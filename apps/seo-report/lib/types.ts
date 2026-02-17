export interface SEOReportInput {
  domain: string;
  valueProposition: string;
  dataforseoLogin: string;
  dataforseoPassword: string;
  // Business Context Brief — Product Definition
  productCategory?: string;      // Specific category, e.g. "B2B webinar and virtual events platform"
  products?: string[];            // Key products/services
  // Business Context Brief — Buyer Definition
  primaryBuyer?: string;          // e.g. "VP of Marketing at B2B enterprise companies"
  buyingTriggers?: string;        // What triggers them to search for a solution
  competitors?: string[];         // Direct competitors and alternatives
  // Business Context Brief — Boundary Definition
  productIsNot?: string;          // Thorough description of what this product is NOT
  ambiguousTerms?: string;        // Terms with dual meanings + correct context
  negativeKeywords?: string[];    // Explicit exclusion terms
  // Legacy (mapped from older fields)
  industry?: string;
  targetAudience?: string;
  locationCode?: number; // default 2840 = United States
  languageCode?: string; // default "en"
}

/** Saved project configuration for quarterly re-runs */
export interface SavedProject {
  id: string;
  name: string;
  domain: string;
  valueProposition: string;
  productCategory: string;
  products: string[];
  primaryBuyer: string;
  buyingTriggers: string;
  competitors: string[];
  productIsNot: string;
  ambiguousTerms: string;
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RankedKeyword {
  keyword: string;
  position: number;
  searchVolume: number;
  cpc: number;
  competition: number;
  url: string;
  trafficCost: number;
  estimatedTraffic: number;
  keywordDifficulty: number;
  intent: string[];
}

export interface CompetitorDomain {
  domain: string;
  overlapRank: number;
  commonKeywords: number;
  organicTraffic: number;
  organicKeywords: number;
  avgPosition: number;
}

export interface CompetitorKeyword extends RankedKeyword {
  competitorDomain: string;
}

export interface KeywordOpportunity {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number;
  keywordDifficulty: number;
  intent: string[];
  source: 'gap' | 'suggestion' | 'related';
  relevanceScore: number;
  hubTopic?: string; // which hub this opportunity belongs to
}

export interface ContentRefreshSuggestion {
  keyword: string;
  currentPosition: number;
  url: string;
  searchVolume: number;
  potentialTraffic: number;
  action: 'optimize_title' | 'expand_content' | 'add_sections' | 'update_freshness' | 'improve_internal_links';
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface HubTopic {
  hubKeyword: string;
  hubSearchVolume: number;
  hubDifficulty: number;
  hubIntent: string[];
  spokeKeywords: SpokeKeyword[];
  totalOpportunityVolume: number;
  avgDifficulty: number;
  estimatedTrafficPotential: number;
}

export interface SpokeKeyword {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  intent: string[];
  type: 'how-to' | 'comparison' | 'list' | 'definition' | 'review' | 'guide' | 'general';
  currentRanking: number | null;
}

export interface SEOReport {
  domain: string;
  valueProposition: string;
  generatedAt: string;
  summary: ReportSummary;
  currentRankings: RankedKeyword[];
  competitors: CompetitorDomain[];
  competitorKeywords: CompetitorKeyword[];
  netNewOpportunities: KeywordOpportunity[];
  contentRefreshSuggestions: ContentRefreshSuggestion[];
  hubAndSpoke: HubTopic[];
}

export interface ReportSummary {
  totalCurrentKeywords: number;
  avgPosition: number;
  totalSearchVolume: number;
  estimatedMonthlyTraffic: number;
  topCompetitor: string;
  netNewOpportunitiesCount: number;
  contentRefreshCount: number;
  hubTopicsCount: number;
  totalSpokePages: number;
  estimatedTrafficPotential: number;
}

export interface DataForSEOResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  tasks: DataForSEOTask<T>[];
}

export interface DataForSEOTask<T> {
  id: string;
  status_code: number;
  status_message: string;
  result: T[] | null;
  result_count: number;
}
