import type { HubTopic, SpokeKeyword, RankedKeyword } from './types';

/**
 * A hub seed is a topic derived from the value proposition + current rankings.
 * Each seed drives targeted keyword research via DataForSEO.
 */
export interface HubSeed {
  topic: string;          // The hub topic phrase (used as seed keyword)
  seedKeywords: string[]; // Additional seed keywords for this hub
  source: 'value_prop' | 'top_ranking' | 'combined';
  relevanceScore: number; // How central this topic is to the value proposition
}

/**
 * Phase 1: Derive hub topic seeds BEFORE keyword research.
 *
 * Analyzes the value proposition and current rankings to identify
 * 8-12 hub topics that should drive the keyword research.
 */
export function deriveHubSeeds(
  valueProposition: string,
  currentRankings: RankedKeyword[]
): HubSeed[] {
  const vpTerms = extractTopicTerms(valueProposition);
  const vpBigrams = extractBigrams(valueProposition);

  // Get top-performing keywords grouped by topic
  const topKeywords = currentRankings
    .filter(k => k.position <= 30 && k.searchVolume >= 50)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 100);

  // Find recurring themes in current rankings
  const rankingThemes = findRecurringThemes(topKeywords.map(k => k.keyword));

  const seeds: HubSeed[] = [];
  const usedTopics = new Set<string>();

  // 1. Bigrams from value proposition are the strongest hub candidates
  for (const bigram of vpBigrams) {
    if (usedTopics.has(bigram)) continue;

    // Find matching keywords from rankings for additional seeds
    const matchingKeywords = topKeywords
      .filter(k => k.keyword.toLowerCase().includes(bigram))
      .map(k => k.keyword)
      .slice(0, 5);

    // Score: based on how many current rankings relate to this topic
    const rankingMatches = topKeywords.filter(k =>
      k.keyword.toLowerCase().includes(bigram)
    ).length;
    const relevance = Math.min(1, 0.5 + (rankingMatches / 20));

    seeds.push({
      topic: bigram,
      seedKeywords: matchingKeywords,
      source: matchingKeywords.length > 0 ? 'combined' : 'value_prop',
      relevanceScore: relevance,
    });
    usedTopics.add(bigram);
  }

  // 2. Single terms from value proposition that overlap with ranking themes
  for (const term of vpTerms) {
    if (usedTopics.has(term)) continue;
    if (term.includes(' ')) continue; // Already handled bigrams above

    // Only promote single terms if they appear in ranking themes
    const matchingTheme = rankingThemes.find(t =>
      t.term.includes(term) || term.includes(t.term)
    );
    if (!matchingTheme) continue;

    // Use the ranking theme phrase (usually more specific) as the topic
    const topicPhrase = matchingTheme.term.length > term.length ? matchingTheme.term : term;
    if (usedTopics.has(topicPhrase)) continue;

    const matchingKeywords = topKeywords
      .filter(k => k.keyword.toLowerCase().includes(topicPhrase))
      .map(k => k.keyword)
      .slice(0, 5);

    seeds.push({
      topic: topicPhrase,
      seedKeywords: matchingKeywords,
      source: 'combined',
      relevanceScore: Math.min(1, matchingTheme.frequency / 10),
    });
    usedTopics.add(topicPhrase);
  }

  // 3. Strong ranking themes not yet covered by value proposition terms
  for (const theme of rankingThemes) {
    if (usedTopics.has(theme.term)) continue;
    if (theme.frequency < 3) continue;

    // Check if this theme is at least tangentially related to value prop
    const vpRelated = vpTerms.some(vt =>
      vt.includes(theme.term) || theme.term.includes(vt) ||
      theme.term.split(' ').some(w => vt.includes(w))
    );

    const matchingKeywords = topKeywords
      .filter(k => k.keyword.toLowerCase().includes(theme.term))
      .map(k => k.keyword)
      .slice(0, 5);

    seeds.push({
      topic: theme.term,
      seedKeywords: matchingKeywords,
      source: 'top_ranking',
      relevanceScore: vpRelated ? 0.6 : 0.3,
    });
    usedTopics.add(theme.term);
  }

  // Sort by relevance and take top 10-12
  seeds.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return seeds.slice(0, 12);
}

interface DiscoveredKeyword {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  competition: number;
  intent: string[];
  currentRanking: number | null;
}

/**
 * Phase 2: After per-hub keyword research, build the final Hub & Spoke structure.
 *
 * Takes the hub seeds and the keywords discovered for each hub,
 * plus current rankings to mark which keywords we already rank for.
 */
export function buildHubAndSpoke(
  hubSeeds: HubSeed[],
  hubKeywordMap: Map<string, DiscoveredKeyword[]>,
  currentRankings: RankedKeyword[]
): HubTopic[] {
  const currentKeywordPositions = new Map<string, number>();
  for (const r of currentRankings) {
    currentKeywordPositions.set(r.keyword.toLowerCase(), r.position);
  }

  const hubs: HubTopic[] = [];

  for (const seed of hubSeeds) {
    const discovered = hubKeywordMap.get(seed.topic) || [];
    if (discovered.length < 2) continue;

    // Find the best hub keyword: highest volume, broadest term
    const sorted = [...discovered].sort((a, b) => {
      // Prefer shorter (broader) keywords with high volume
      const aScore = a.searchVolume * (1 / Math.max(a.keyword.split(' ').length, 1));
      const bScore = b.searchVolume * (1 / Math.max(b.keyword.split(' ').length, 1));
      return bScore - aScore;
    });

    const hubKw = sorted[0];

    // Everything else becomes spokes
    const spokes: SpokeKeyword[] = sorted.slice(1).map(kw => ({
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      keywordDifficulty: kw.keywordDifficulty,
      intent: kw.intent,
      type: classifySpokeType(kw.keyword),
      currentRanking: currentKeywordPositions.get(kw.keyword.toLowerCase()) ?? null,
    }));

    // Sort spokes: new opportunities first, then by volume
    spokes.sort((a, b) => {
      if (a.currentRanking === null && b.currentRanking !== null) return -1;
      if (a.currentRanking !== null && b.currentRanking === null) return 1;
      return b.searchVolume - a.searchVolume;
    });

    const allClusterKws = [hubKw, ...discovered.slice(1)];
    const totalVolume = allClusterKws.reduce((sum, k) => sum + k.searchVolume, 0);
    const avgDiff = allClusterKws.reduce((sum, k) => sum + k.keywordDifficulty, 0) / allClusterKws.length;

    hubs.push({
      hubKeyword: hubKw.keyword,
      hubSearchVolume: hubKw.searchVolume,
      hubDifficulty: hubKw.keywordDifficulty,
      hubIntent: hubKw.intent,
      spokeKeywords: spokes.slice(0, 25), // Top 25 spokes per hub
      totalOpportunityVolume: totalVolume,
      avgDifficulty: Math.round(avgDiff),
      estimatedTrafficPotential: estimateClusterTraffic(hubKw.searchVolume, spokes),
    });
  }

  // Sort by traffic potential
  hubs.sort((a, b) => b.estimatedTrafficPotential - a.estimatedTrafficPotential);
  return hubs.slice(0, 15);
}

// ─── Helper functions ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'that', 'this', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'when',
  'where', 'why', 'how', 'help', 'helps', 'provide', 'provides',
  'offering', 'offer', 'best', 'top', 'leading', 'get', 'make',
  'using', 'like', 'also', 'well', 'new', 'way', 'ways',
]);

function extractTopicTerms(valueProposition: string): string[] {
  const words = valueProposition
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const bigrams = extractBigrams(valueProposition);
  return [...new Set([...bigrams, ...words])];
}

function extractBigrams(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1]) &&
        words[i].length > 2 && words[i + 1].length > 2) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
  }
  // Also extract trigrams for more specific topics
  for (let i = 0; i < words.length - 2; i++) {
    const meaningful = [words[i], words[i + 1], words[i + 2]].filter(w => !STOP_WORDS.has(w) && w.length > 2);
    if (meaningful.length >= 2) {
      bigrams.push(meaningful.join(' '));
    }
  }
  return [...new Set(bigrams)];
}

interface ThemeEntry {
  term: string;
  frequency: number;
}

function findRecurringThemes(keywords: string[]): ThemeEntry[] {
  const termFreq = new Map<string, number>();

  for (const kw of keywords) {
    const words = kw.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

    for (const w of words) {
      termFreq.set(w, (termFreq.get(w) || 0) + 1);
    }

    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      termFreq.set(bigram, (termFreq.get(bigram) || 0) + 1);
    }
  }

  return Array.from(termFreq.entries())
    .filter(([, freq]) => freq >= 2)
    .map(([term, frequency]) => ({ term, frequency }))
    .sort((a, b) => {
      // Prefer bigrams over single words at similar frequency
      const aBoost = a.term.includes(' ') ? 1.5 : 1;
      const bBoost = b.term.includes(' ') ? 1.5 : 1;
      return (b.frequency * bBoost) - (a.frequency * aBoost);
    });
}

export function classifySpokeType(keyword: string): SpokeKeyword['type'] {
  const kw = keyword.toLowerCase();

  if (/^how\s+(to|do|does|can|should)/.test(kw) || kw.includes('tutorial') || kw.includes('step by step')) {
    return 'how-to';
  }
  if (/\bvs\.?\b|\bversus\b|\bcompare\b|\bcomparison\b|\balternative/.test(kw)) {
    return 'comparison';
  }
  if (/\bbest\b|\btop\s+\d|\b\d+\s+(best|top|ways)/.test(kw) || kw.includes('list')) {
    return 'list';
  }
  if (/^what\s+(is|are|does)/.test(kw) || kw.includes('definition') || kw.includes('meaning')) {
    return 'definition';
  }
  if (/\breview\b|\brating\b|\bpros\s+and\s+cons/.test(kw)) {
    return 'review';
  }
  if (/\bguide\b|\bcomplete\b|\bultimate\b|\bbeginners?\b/.test(kw)) {
    return 'guide';
  }

  return 'general';
}

function estimateClusterTraffic(hubVolume: number, spokes: SpokeKeyword[]): number {
  const hubCTR = 0.095;  // ~position 5
  const spokeCTR = 0.024; // ~position 10

  const hubTraffic = hubVolume * hubCTR;
  const spokeTraffic = spokes.reduce((sum, s) => sum + (s.searchVolume * spokeCTR), 0);

  return Math.round(hubTraffic + spokeTraffic);
}
