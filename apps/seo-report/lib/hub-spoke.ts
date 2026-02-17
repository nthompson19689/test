import type { HubTopic, SpokeKeyword } from './types';

interface KeywordInput {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  intent: string[];
  currentRanking: number | null;
}

export function buildHubAndSpoke(
  keywords: KeywordInput[],
  valueProposition: string
): HubTopic[] {
  // Step 1: Extract topic seeds from value proposition
  const vpTerms = extractTopicTerms(valueProposition);

  // Step 2: Cluster keywords by shared root terms
  const clusters = clusterKeywords(keywords, vpTerms);

  // Step 3: For each cluster, identify hub (broadest, highest volume) and spokes
  const hubs: HubTopic[] = [];

  for (const [, clusterKeywords] of clusters) {
    if (clusterKeywords.length < 3) continue; // Need at least 3 keywords for a meaningful cluster

    // Sort by search volume descending - highest volume becomes hub candidate
    const sorted = [...clusterKeywords].sort((a, b) => b.searchVolume - a.searchVolume);

    // Hub: the broadest, highest-volume keyword
    const hubCandidate = sorted[0];

    // Spokes: remaining keywords, classified by content type
    const spokes: SpokeKeyword[] = sorted.slice(1).map(kw => ({
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      keywordDifficulty: kw.keywordDifficulty,
      intent: kw.intent,
      type: classifySpokeType(kw.keyword),
      currentRanking: kw.currentRanking,
    }));

    // Sort spokes: prioritize those we don't rank for, then by volume
    spokes.sort((a, b) => {
      if (a.currentRanking === null && b.currentRanking !== null) return -1;
      if (a.currentRanking !== null && b.currentRanking === null) return 1;
      return b.searchVolume - a.searchVolume;
    });

    const totalVolume = clusterKeywords.reduce((sum, k) => sum + k.searchVolume, 0);
    const avgDiff = clusterKeywords.reduce((sum, k) => sum + k.keywordDifficulty, 0) / clusterKeywords.length;

    hubs.push({
      hubKeyword: hubCandidate.keyword,
      hubSearchVolume: hubCandidate.searchVolume,
      hubDifficulty: hubCandidate.keywordDifficulty,
      hubIntent: hubCandidate.intent,
      spokeKeywords: spokes.slice(0, 20), // Top 20 spokes per hub
      totalOpportunityVolume: totalVolume,
      avgDifficulty: Math.round(avgDiff),
      estimatedTrafficPotential: estimateClusterTraffic(hubCandidate, spokes),
    });
  }

  // Sort hubs by estimated traffic potential
  hubs.sort((a, b) => b.estimatedTrafficPotential - a.estimatedTrafficPotential);

  return hubs.slice(0, 15); // Top 15 hub topics
}

function extractTopicTerms(valueProposition: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
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
  ]);

  const words = valueProposition
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Also extract 2-word phrases
  const vpLower = valueProposition.toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  const vpWords = vpLower.split(/\s+/);
  const bigrams: string[] = [];
  for (let i = 0; i < vpWords.length - 1; i++) {
    if (!stopWords.has(vpWords[i]) && !stopWords.has(vpWords[i + 1])) {
      bigrams.push(`${vpWords[i]} ${vpWords[i + 1]}`);
    }
  }

  return [...new Set([...bigrams, ...words])];
}

function clusterKeywords(
  keywords: KeywordInput[],
  vpTerms: string[]
): Map<string, KeywordInput[]> {
  const clusters = new Map<string, KeywordInput[]>();

  // Extract common root terms from all keywords
  const termFrequency = new Map<string, number>();
  for (const kw of keywords) {
    const words = kw.keyword.toLowerCase().split(/\s+/);
    const seen = new Set<string>();

    // Single words
    for (const word of words) {
      if (word.length > 2 && !seen.has(word)) {
        seen.add(word);
        termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
      }
    }

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!seen.has(bigram)) {
        seen.add(bigram);
        termFrequency.set(bigram, (termFrequency.get(bigram) || 0) + 1);
      }
    }
  }

  // Identify cluster roots: terms appearing in 3+ keywords
  // Boost terms from value proposition
  const clusterRoots: { term: string; score: number }[] = [];
  for (const [term, freq] of termFrequency) {
    if (freq < 3) continue;

    let score = freq;
    // Boost if term relates to value proposition
    if (vpTerms.some(vt => vt.includes(term) || term.includes(vt))) {
      score *= 2;
    }

    clusterRoots.push({ term, score });
  }

  // Sort by score and take top cluster roots
  clusterRoots.sort((a, b) => b.score - a.score);
  const topRoots = clusterRoots.slice(0, 30);

  // Assign keywords to clusters
  // Prefer longer (more specific) root matches
  const sortedRoots = [...topRoots].sort((a, b) => b.term.length - a.term.length);

  const assigned = new Set<string>();
  for (const root of sortedRoots) {
    const cluster: KeywordInput[] = [];
    for (const kw of keywords) {
      if (assigned.has(kw.keyword)) continue;
      if (kw.keyword.toLowerCase().includes(root.term)) {
        cluster.push(kw);
        assigned.add(kw.keyword);
      }
    }
    if (cluster.length >= 3) {
      clusters.set(root.term, cluster);
    }
  }

  // Assign remaining unassigned keywords to best-matching clusters
  for (const kw of keywords) {
    if (assigned.has(kw.keyword)) continue;
    let bestCluster: string | null = null;
    let bestOverlap = 0;

    const kwWords = new Set(kw.keyword.toLowerCase().split(/\s+/));
    for (const [root] of clusters) {
      const rootWords = root.split(/\s+/);
      const overlap = rootWords.filter(w => kwWords.has(w)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = root;
      }
    }

    if (bestCluster && bestOverlap > 0) {
      clusters.get(bestCluster)!.push(kw);
      assigned.add(kw.keyword);
    }
  }

  return clusters;
}

function classifySpokeType(keyword: string): SpokeKeyword['type'] {
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

function estimateClusterTraffic(hub: KeywordInput, spokes: SpokeKeyword[]): number {
  // Estimate traffic if we could rank top 5 for hub, top 10 for spokes
  const hubCTR = 0.095; // ~position 5
  const spokeCTR = 0.024; // ~position 10

  const hubTraffic = hub.searchVolume * hubCTR;
  const spokeTraffic = spokes.reduce((sum, s) => sum + (s.searchVolume * spokeCTR), 0);

  return Math.round(hubTraffic + spokeTraffic);
}
