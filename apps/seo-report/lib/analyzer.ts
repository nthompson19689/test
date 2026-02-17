import { DataForSEOClient } from './dataforseo';
import type {
  SEOReportInput,
  SEOReport,
  RankedKeyword,
  CompetitorDomain,
  CompetitorKeyword,
  KeywordOpportunity,
  ContentRefreshSuggestion,
  ReportSummary,
} from './types';
import { buildHubAndSpoke } from './hub-spoke';

/** Warnings collected during analysis (non-fatal issues) */
export interface AnalysisWarning {
  step: string;
  message: string;
}

export async function generateSEOReport(
  input: SEOReportInput,
  onProgress?: (step: string, pct: number) => void
): Promise<SEOReport & { warnings: AnalysisWarning[] }> {
  const warnings: AnalysisWarning[] = [];
  const client = new DataForSEOClient(
    input.dataforseoLogin,
    input.dataforseoPassword,
    input.locationCode,
    input.languageCode
  );

  const progress = (step: string, pct: number) => onProgress?.(step, pct);

  // Step 0: Verify credentials before burning time on a full pipeline
  progress('Verifying DataForSEO credentials...', 2);
  await client.verifyCredentials();
  progress('Credentials verified', 5);

  // Step 1: Get current rankings
  progress('Fetching current rankings...', 8);
  const currentRankings = await fetchCurrentRankings(client, input.domain);
  progress(`Current rankings loaded (${currentRankings.length} keywords)`, 20);

  // Step 2: Get competitors
  progress('Identifying top competitors...', 25);
  const competitors = await fetchCompetitors(client, input.domain);
  progress('Competitors identified', 35);

  // Step 3: Get competitor keyword gaps
  progress('Analyzing competitor keyword gaps...', 40);
  const competitorKeywords = await fetchCompetitorGaps(client, input.domain, competitors.slice(0, 3), warnings);
  progress(`Competitor analysis complete (${competitorKeywords.length} gap keywords)`, 55);

  // Step 4: Get net new keyword opportunities
  progress('Discovering net new keyword opportunities...', 60);
  const netNewOpportunities = await fetchNetNewOpportunities(client, input.domain, currentRankings, warnings);
  progress(`Keyword opportunities found (${netNewOpportunities.length})`, 75);

  // Step 5: Generate content refresh suggestions
  progress('Generating content refresh suggestions...', 80);
  const contentRefreshSuggestions = generateContentRefreshSuggestions(currentRankings);
  progress('Content refresh analysis complete', 85);

  // Step 6: Build Hub & Spoke model
  progress('Building Hub & Spoke topic clusters...', 88);
  const allKeywords = [
    ...currentRankings.map(k => ({
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      keywordDifficulty: k.keywordDifficulty,
      intent: k.intent,
      currentRanking: k.position,
    })),
    ...netNewOpportunities.map(k => ({
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      keywordDifficulty: k.keywordDifficulty,
      intent: k.intent,
      currentRanking: null as number | null,
    })),
  ];
  const hubAndSpoke = buildHubAndSpoke(allKeywords, input.valueProposition);
  progress('Hub & Spoke model built', 95);

  // Step 7: Build summary
  const summary = buildSummary(
    currentRankings,
    competitors,
    netNewOpportunities,
    contentRefreshSuggestions,
    hubAndSpoke
  );

  progress('Report complete!', 100);

  return {
    domain: input.domain,
    valueProposition: input.valueProposition,
    generatedAt: new Date().toISOString(),
    summary,
    currentRankings: currentRankings.slice(0, 200),
    competitors,
    competitorKeywords: competitorKeywords.slice(0, 200),
    netNewOpportunities: netNewOpportunities.slice(0, 500),
    contentRefreshSuggestions,
    hubAndSpoke,
    warnings,
  };
}

async function fetchCurrentRankings(client: DataForSEOClient, domain: string): Promise<RankedKeyword[]> {
  const response = await client.getRankedKeywords(domain, 1000);
  const result = response.tasks?.[0]?.result?.[0];
  if (!result?.items || result.items.length === 0) {
    // This is expected for brand-new domains with no organic presence.
    // Return empty but don't throw — the rest of the pipeline can still
    // find opportunities via keywords_for_site fallback.
    return [];
  }

  return result.items.map(item => ({
    keyword: item.keyword_data.keyword,
    position: item.ranked_serp_element.serp_item.rank_group,
    searchVolume: item.keyword_data.keyword_info.search_volume || 0,
    cpc: item.keyword_data.keyword_info.cpc || 0,
    competition: item.keyword_data.keyword_info.competition || 0,
    url: item.ranked_serp_element.serp_item.url || '',
    trafficCost: item.ranked_serp_element.serp_item.estimated_paid_traffic_cost || 0,
    estimatedTraffic: item.ranked_serp_element.serp_item.etv || 0,
    keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
    intent: item.keyword_data.search_intent_info
      ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
      : [],
  }));
}

async function fetchCompetitors(client: DataForSEOClient, domain: string): Promise<CompetitorDomain[]> {
  const response = await client.getCompetitorsDomain(domain, 20);
  const result = response.tasks?.[0]?.result?.[0];
  if (!result?.items) return [];

  return result.items
    .filter(item => item.domain !== domain)
    .slice(0, 10)
    .map(item => {
      const organicMetrics = item.full_domain_metrics?.[0]?.organic;
      return {
        domain: item.domain,
        overlapRank: item.sum_position,
        commonKeywords: item.intersections,
        organicTraffic: organicMetrics?.etv || 0,
        organicKeywords: organicMetrics?.count || 0,
        avgPosition: item.avg_position,
      };
    });
}

async function fetchCompetitorGaps(
  client: DataForSEOClient,
  domain: string,
  competitors: CompetitorDomain[],
  warnings: AnalysisWarning[]
): Promise<CompetitorKeyword[]> {
  const allGaps: CompetitorKeyword[] = [];

  for (const competitor of competitors) {
    try {
      const response = await client.getDomainIntersection(domain, competitor.domain, 200);
      const result = response.tasks?.[0]?.result?.[0];
      if (!result?.items) continue;

      for (const item of result.items) {
        allGaps.push({
          keyword: item.keyword_data.keyword,
          position: item.first_domain_serp_element.serp_item.rank_group,
          searchVolume: item.keyword_data.keyword_info.search_volume || 0,
          cpc: item.keyword_data.keyword_info.cpc || 0,
          competition: item.keyword_data.keyword_info.competition || 0,
          url: item.first_domain_serp_element.serp_item.url || '',
          trafficCost: 0,
          estimatedTraffic: item.first_domain_serp_element.serp_item.etv || 0,
          keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
          intent: item.keyword_data.search_intent_info
            ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
            : [],
          competitorDomain: competitor.domain,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({ step: 'competitor_gaps', message: `Failed to fetch gaps for ${competitor.domain}: ${msg}` });
    }
  }

  // Deduplicate by keyword, keeping highest-volume entries
  const seen = new Map<string, CompetitorKeyword>();
  for (const gap of allGaps) {
    const existing = seen.get(gap.keyword);
    if (!existing || gap.searchVolume > existing.searchVolume) {
      seen.set(gap.keyword, gap);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.searchVolume - a.searchVolume);
}

async function fetchNetNewOpportunities(
  client: DataForSEOClient,
  domain: string,
  currentRankings: RankedKeyword[],
  warnings: AnalysisWarning[]
): Promise<KeywordOpportunity[]> {
  const currentKeywords = new Set(currentRankings.map(k => k.keyword.toLowerCase()));

  // Extract seed keywords from top-performing rankings
  const seedKeywords = currentRankings
    .filter(k => k.position <= 20 && k.searchVolume > 100)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 20)
    .map(k => k.keyword);

  if (seedKeywords.length === 0) {
    // Fallback: use keywords for site if no current rankings
    const siteKwResponse = await client.getKeywordsForSite(domain, 500);
    const siteResult = siteKwResponse.tasks?.[0]?.result?.[0];
    if (!siteResult?.items) return [];

    return siteResult.items
      .filter(item => !currentKeywords.has(item.keyword.toLowerCase()))
      .map(item => ({
        keyword: item.keyword,
        searchVolume: item.keyword_info.search_volume || 0,
        cpc: item.keyword_info.cpc || 0,
        competition: item.keyword_info.competition || 0,
        keywordDifficulty: item.keyword_properties?.keyword_difficulty || 0,
        intent: item.search_intent_info
          ? [item.search_intent_info.main_intent, ...(item.search_intent_info.foreign_intent || [])]
          : [],
        source: 'suggestion' as const,
        relevanceScore: 0.5,
      }))
      .slice(0, 500);
  }

  const opportunities: KeywordOpportunity[] = [];

  // Fetch keyword suggestions
  try {
    const suggestionsResponse = await client.getKeywordSuggestions(seedKeywords, 300);
    const suggestionsResult = suggestionsResponse.tasks?.[0]?.result?.[0];
    if (suggestionsResult?.items) {
      for (const item of suggestionsResult.items) {
        if (!currentKeywords.has(item.keyword_data.keyword.toLowerCase())) {
          opportunities.push({
            keyword: item.keyword_data.keyword,
            searchVolume: item.keyword_data.keyword_info.search_volume || 0,
            cpc: item.keyword_data.keyword_info.cpc || 0,
            competition: item.keyword_data.keyword_info.competition || 0,
            keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
            intent: item.keyword_data.search_intent_info
              ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
              : [],
            source: 'suggestion',
            relevanceScore: calculateRelevanceScore(item.keyword_data.keyword_info.search_volume || 0, item.keyword_data.keyword_properties?.keyword_difficulty || 0),
          });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push({ step: 'keyword_suggestions', message: `Keyword suggestions failed: ${msg}` });
  }

  // Fetch related keywords
  try {
    const relatedResponse = await client.getRelatedKeywords(seedKeywords.slice(0, 10), 200);
    const relatedResult = relatedResponse.tasks?.[0]?.result?.[0];
    if (relatedResult?.items) {
      for (const item of relatedResult.items) {
        if (!currentKeywords.has(item.keyword_data.keyword.toLowerCase())) {
          opportunities.push({
            keyword: item.keyword_data.keyword,
            searchVolume: item.keyword_data.keyword_info.search_volume || 0,
            cpc: item.keyword_data.keyword_info.cpc || 0,
            competition: item.keyword_data.keyword_info.competition || 0,
            keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
            intent: item.keyword_data.search_intent_info
              ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
              : [],
            source: 'related',
            relevanceScore: calculateRelevanceScore(item.keyword_data.keyword_info.search_volume || 0, item.keyword_data.keyword_properties?.keyword_difficulty || 0),
          });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push({ step: 'related_keywords', message: `Related keywords failed: ${msg}` });
  }

  // Deduplicate
  const seen = new Set<string>();
  const deduped = opportunities.filter(k => {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 500);
}

function calculateRelevanceScore(searchVolume: number, difficulty: number): number {
  // Higher volume + lower difficulty = higher relevance
  const volumeScore = Math.min(searchVolume / 10000, 1);
  const difficultyScore = 1 - (difficulty / 100);
  return (volumeScore * 0.6) + (difficultyScore * 0.4);
}

function generateContentRefreshSuggestions(rankings: RankedKeyword[]): ContentRefreshSuggestion[] {
  const suggestions: ContentRefreshSuggestion[] = [];

  for (const kw of rankings) {
    // Pages ranking 4-10 (bottom of page 1) - high priority optimize
    if (kw.position >= 4 && kw.position <= 10 && kw.searchVolume >= 100) {
      suggestions.push({
        keyword: kw.keyword,
        currentPosition: kw.position,
        url: kw.url,
        searchVolume: kw.searchVolume,
        potentialTraffic: estimateTrafficGain(kw.searchVolume, kw.position, 3),
        action: 'optimize_title',
        reason: `Ranking #${kw.position} - optimizing title tag and meta description could push into top 3 for +${estimateTrafficGain(kw.searchVolume, kw.position, 3).toLocaleString()} monthly visits`,
        priority: 'high',
      });
    }

    // Pages ranking 11-20 (page 2) - medium priority expand
    if (kw.position >= 11 && kw.position <= 20 && kw.searchVolume >= 200) {
      suggestions.push({
        keyword: kw.keyword,
        currentPosition: kw.position,
        url: kw.url,
        searchVolume: kw.searchVolume,
        potentialTraffic: estimateTrafficGain(kw.searchVolume, kw.position, 7),
        action: 'expand_content',
        reason: `Ranking #${kw.position} (page 2) - expanding content depth and adding relevant sections can push to page 1`,
        priority: 'high',
      });
    }

    // Pages ranking 21-50 - add sections
    if (kw.position >= 21 && kw.position <= 50 && kw.searchVolume >= 500) {
      suggestions.push({
        keyword: kw.keyword,
        currentPosition: kw.position,
        url: kw.url,
        searchVolume: kw.searchVolume,
        potentialTraffic: estimateTrafficGain(kw.searchVolume, kw.position, 10),
        action: 'add_sections',
        reason: `High-volume keyword (${kw.searchVolume.toLocaleString()} monthly) ranking #${kw.position} - needs significant content additions and internal linking`,
        priority: 'medium',
      });
    }
  }

  // Group by URL and keep highest-impact suggestion per URL
  const byUrl = new Map<string, ContentRefreshSuggestion[]>();
  for (const s of suggestions) {
    const list = byUrl.get(s.url) || [];
    list.push(s);
    byUrl.set(s.url, list);
  }

  // Return top suggestion per URL, sorted by potential traffic
  const result: ContentRefreshSuggestion[] = [];
  for (const [, urlSuggestions] of byUrl) {
    urlSuggestions.sort((a, b) => b.potentialTraffic - a.potentialTraffic);
    result.push(urlSuggestions[0]);
  }

  return result.sort((a, b) => b.potentialTraffic - a.potentialTraffic).slice(0, 50);
}

function estimateTrafficGain(searchVolume: number, currentPosition: number, targetPosition: number): number {
  // Approximate CTR by position (Google organic)
  const ctrByPosition: Record<number, number> = {
    1: 0.316, 2: 0.241, 3: 0.186, 4: 0.113, 5: 0.095,
    6: 0.062, 7: 0.042, 8: 0.032, 9: 0.028, 10: 0.024,
  };
  const currentCTR = ctrByPosition[Math.min(currentPosition, 10)] || 0.01;
  const targetCTR = ctrByPosition[Math.min(targetPosition, 10)] || 0.01;
  return Math.round(searchVolume * (targetCTR - currentCTR));
}

function buildSummary(
  currentRankings: RankedKeyword[],
  competitors: CompetitorDomain[],
  netNew: KeywordOpportunity[],
  refreshSuggestions: ContentRefreshSuggestion[],
  hubAndSpoke: import('./types').HubTopic[]
): ReportSummary {
  const totalTraffic = currentRankings.reduce((sum, k) => sum + k.estimatedTraffic, 0);
  const avgPos = currentRankings.length > 0
    ? currentRankings.reduce((sum, k) => sum + k.position, 0) / currentRankings.length
    : 0;
  const totalVolume = currentRankings.reduce((sum, k) => sum + k.searchVolume, 0);
  const totalSpokes = hubAndSpoke.reduce((sum, h) => sum + h.spokeKeywords.length, 0);
  const trafficPotential = hubAndSpoke.reduce((sum, h) => sum + h.estimatedTrafficPotential, 0);

  return {
    totalCurrentKeywords: currentRankings.length,
    avgPosition: Math.round(avgPos * 10) / 10,
    totalSearchVolume: totalVolume,
    estimatedMonthlyTraffic: Math.round(totalTraffic),
    topCompetitor: competitors[0]?.domain || 'N/A',
    netNewOpportunitiesCount: netNew.length,
    contentRefreshCount: refreshSuggestions.length,
    hubTopicsCount: hubAndSpoke.length,
    totalSpokePages: totalSpokes,
    estimatedTrafficPotential: Math.round(trafficPotential),
  };
}
