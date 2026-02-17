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
  HubTopic,
} from './types';
import { deriveHubSeeds, buildHubAndSpoke, type HubSeed } from './hub-spoke';

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

  // Step 0: Verify credentials
  progress('Verifying DataForSEO credentials...', 2);
  await client.verifyCredentials();
  progress('Credentials verified', 5);

  // Step 1: Get current rankings
  progress('Fetching current rankings...', 8);
  const currentRankings = await fetchCurrentRankings(client, input.domain);
  progress(`Current rankings loaded (${currentRankings.length} keywords)`, 15);

  // Step 2: Get competitors
  progress('Identifying top competitors...', 18);
  const competitors = await fetchCompetitors(client, input.domain);
  progress('Competitors identified', 22);

  // Step 3: Get competitor keyword gaps
  progress('Analyzing competitor keyword gaps...', 25);
  const competitorKeywords = await fetchCompetitorGaps(client, input.domain, competitors.slice(0, 3), warnings);
  progress(`Competitor analysis complete (${competitorKeywords.length} gap keywords)`, 35);

  // Step 4: DERIVE HUB TOPICS from value proposition + current rankings
  progress('Deriving hub topics from value proposition...', 38);
  const hubSeeds = deriveHubSeeds(input.valueProposition, currentRankings);
  progress(`Identified ${hubSeeds.length} hub topics — starting targeted research`, 40);

  // Step 5: PER-HUB KEYWORD RESEARCH — this is where the 500 net new come from
  const currentKeywords = new Set(currentRankings.map(k => k.keyword.toLowerCase()));
  const hubKeywordMap = new Map<string, {
    keyword: string;
    searchVolume: number;
    keywordDifficulty: number;
    cpc: number;
    competition: number;
    intent: string[];
    currentRanking: number | null;
  }[]>();
  const allNetNew: KeywordOpportunity[] = [];
  const globalSeenKeywords = new Set<string>();

  // Budget: ~50 keywords per hub to reach 500+ total across 10-12 hubs
  const perHubLimit = Math.max(40, Math.ceil(550 / Math.max(hubSeeds.length, 1)));

  for (let i = 0; i < hubSeeds.length; i++) {
    const hub = hubSeeds[i];
    const pctBase = 42 + Math.round((i / hubSeeds.length) * 40);
    progress(`Researching hub ${i + 1}/${hubSeeds.length}: "${hub.topic}"...`, pctBase);

    const hubKeywords: typeof hubKeywordMap extends Map<string, infer V> ? V : never = [];

    // Build seed list for this hub: topic phrase + any matching existing keywords
    const seeds = [hub.topic, ...hub.seedKeywords].slice(0, 10);

    // Keyword suggestions for this hub
    try {
      const suggestionsResponse = await client.getKeywordSuggestions(seeds, perHubLimit);
      const suggestionsResult = suggestionsResponse.tasks?.[0]?.result?.[0];
      if (suggestionsResult?.items) {
        for (const item of suggestionsResult.items) {
          const kw = item.keyword_data.keyword;
          const kwLower = kw.toLowerCase();
          if (globalSeenKeywords.has(kwLower)) continue;
          globalSeenKeywords.add(kwLower);

          const kwData = {
            keyword: kw,
            searchVolume: item.keyword_data.keyword_info.search_volume || 0,
            keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
            cpc: item.keyword_data.keyword_info.cpc || 0,
            competition: item.keyword_data.keyword_info.competition || 0,
            intent: item.keyword_data.search_intent_info
              ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
              : [],
            currentRanking: null as number | null,
          };

          hubKeywords.push(kwData);

          // If we don't currently rank for it, it's a net new opportunity
          if (!currentKeywords.has(kwLower)) {
            allNetNew.push({
              ...kwData,
              source: 'suggestion',
              relevanceScore: calculateRelevanceScore(kwData.searchVolume, kwData.keywordDifficulty),
              hubTopic: hub.topic,
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({ step: 'hub_suggestions', message: `Suggestions for hub "${hub.topic}" failed: ${msg}` });
    }

    // Related keywords for this hub
    try {
      const relatedResponse = await client.getRelatedKeywords(seeds.slice(0, 5), perHubLimit);
      const relatedResult = relatedResponse.tasks?.[0]?.result?.[0];
      if (relatedResult?.items) {
        for (const item of relatedResult.items) {
          const kw = item.keyword_data.keyword;
          const kwLower = kw.toLowerCase();
          if (globalSeenKeywords.has(kwLower)) continue;
          globalSeenKeywords.add(kwLower);

          const kwData = {
            keyword: kw,
            searchVolume: item.keyword_data.keyword_info.search_volume || 0,
            keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty || 0,
            cpc: item.keyword_data.keyword_info.cpc || 0,
            competition: item.keyword_data.keyword_info.competition || 0,
            intent: item.keyword_data.search_intent_info
              ? [item.keyword_data.search_intent_info.main_intent, ...(item.keyword_data.search_intent_info.foreign_intent || [])]
              : [],
            currentRanking: null as number | null,
          };

          hubKeywords.push(kwData);

          if (!currentKeywords.has(kwLower)) {
            allNetNew.push({
              ...kwData,
              source: 'related',
              relevanceScore: calculateRelevanceScore(kwData.searchVolume, kwData.keywordDifficulty),
              hubTopic: hub.topic,
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({ step: 'hub_related', message: `Related keywords for hub "${hub.topic}" failed: ${msg}` });
    }

    // Also include any current rankings that match this hub topic
    for (const r of currentRankings) {
      const kwLower = r.keyword.toLowerCase();
      if (globalSeenKeywords.has(kwLower)) continue;
      if (!kwLower.includes(hub.topic.toLowerCase())) continue;
      globalSeenKeywords.add(kwLower);

      hubKeywords.push({
        keyword: r.keyword,
        searchVolume: r.searchVolume,
        keywordDifficulty: r.keywordDifficulty,
        cpc: r.cpc,
        competition: r.competition,
        intent: r.intent,
        currentRanking: r.position,
      });
    }

    hubKeywordMap.set(hub.topic, hubKeywords);
  }

  progress(`Hub research complete — ${allNetNew.length} net new keywords found`, 82);

  // If hub research produced fewer than expected, supplement with keywords_for_site
  if (allNetNew.length < 100 && currentRankings.length === 0) {
    progress('Supplementing with site-level keyword discovery...', 83);
    try {
      const siteKwResponse = await client.getKeywordsForSite(input.domain, 200);
      const siteResult = siteKwResponse.tasks?.[0]?.result?.[0];
      if (siteResult?.items) {
        for (const item of siteResult.items) {
          const kwLower = item.keyword.toLowerCase();
          if (globalSeenKeywords.has(kwLower)) continue;
          globalSeenKeywords.add(kwLower);

          allNetNew.push({
            keyword: item.keyword,
            searchVolume: item.keyword_info.search_volume || 0,
            cpc: item.keyword_info.cpc || 0,
            competition: item.keyword_info.competition || 0,
            keywordDifficulty: item.keyword_properties?.keyword_difficulty || 0,
            intent: item.search_intent_info
              ? [item.search_intent_info.main_intent, ...(item.search_intent_info.foreign_intent || [])]
              : [],
            source: 'suggestion',
            relevanceScore: 0.3,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({ step: 'site_keywords', message: `Site keyword fallback failed: ${msg}` });
    }
  }

  // Step 6: Build Hub & Spoke model from research results
  progress('Building Hub & Spoke content strategy...', 85);
  const hubAndSpoke = buildHubAndSpoke(hubSeeds, hubKeywordMap, currentRankings);
  progress('Hub & Spoke model built', 88);

  // Step 7: Finalize net new opportunities (sorted by relevance, capped at 500)
  const netNewOpportunities = allNetNew
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 500);

  // Step 8: Content refresh suggestions
  progress('Generating content refresh suggestions...', 90);
  const contentRefreshSuggestions = generateContentRefreshSuggestions(currentRankings);
  progress('Content refresh analysis complete', 93);

  // Step 9: Build summary
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
    netNewOpportunities,
    contentRefreshSuggestions,
    hubAndSpoke,
    warnings,
  };
}

// ─── Data fetching helpers (unchanged) ───────────────────────────────

async function fetchCurrentRankings(client: DataForSEOClient, domain: string): Promise<RankedKeyword[]> {
  const response = await client.getRankedKeywords(domain, 1000);
  const result = response.tasks?.[0]?.result?.[0];
  if (!result?.items || result.items.length === 0) {
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

  const seen = new Map<string, CompetitorKeyword>();
  for (const gap of allGaps) {
    const existing = seen.get(gap.keyword);
    if (!existing || gap.searchVolume > existing.searchVolume) {
      seen.set(gap.keyword, gap);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.searchVolume - a.searchVolume);
}

// ─── Scoring & analysis helpers ──────────────────────────────────────

function calculateRelevanceScore(searchVolume: number, difficulty: number): number {
  const volumeScore = Math.min(searchVolume / 10000, 1);
  const difficultyScore = 1 - (difficulty / 100);
  return (volumeScore * 0.6) + (difficultyScore * 0.4);
}

function generateContentRefreshSuggestions(rankings: RankedKeyword[]): ContentRefreshSuggestion[] {
  const suggestions: ContentRefreshSuggestion[] = [];

  for (const kw of rankings) {
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

  const byUrl = new Map<string, ContentRefreshSuggestion[]>();
  for (const s of suggestions) {
    const list = byUrl.get(s.url) || [];
    list.push(s);
    byUrl.set(s.url, list);
  }

  const result: ContentRefreshSuggestion[] = [];
  for (const [, urlSuggestions] of byUrl) {
    urlSuggestions.sort((a, b) => b.potentialTraffic - a.potentialTraffic);
    result.push(urlSuggestions[0]);
  }

  return result.sort((a, b) => b.potentialTraffic - a.potentialTraffic).slice(0, 50);
}

function estimateTrafficGain(searchVolume: number, currentPosition: number, targetPosition: number): number {
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
  hubAndSpoke: HubTopic[]
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
