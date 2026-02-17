import type { DataForSEOResponse } from './types';

const BASE_URL = 'https://api.dataforseo.com/v3';

export class DataForSEOClient {
  private authHeader: string;
  private locationCode: number;
  private languageCode: string;

  constructor(login: string, password: string, locationCode = 2840, languageCode = 'en') {
    this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    this.locationCode = locationCode;
    this.languageCode = languageCode;
  }

  private async request<T>(endpoint: string, body: unknown[]): Promise<DataForSEOResponse<T>> {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DataForSEO API error ${res.status}: ${text}`);
    }

    return res.json();
  }

  async getRankedKeywords(domain: string, limit = 1000, offset = 0): Promise<DataForSEOResponse<RankedKeywordsResult>> {
    return this.request<RankedKeywordsResult>(
      '/dataforseo_labs/google/ranked_keywords/live',
      [{
        target: domain,
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        offset,
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
        filters: [
          ['ranked_serp_element.serp_item.rank_group', '<=', 100]
        ],
      }]
    );
  }

  async getCompetitorsDomain(domain: string, limit = 20): Promise<DataForSEOResponse<CompetitorsDomainResult>> {
    return this.request<CompetitorsDomainResult>(
      '/dataforseo_labs/google/competitors_domain/live',
      [{
        target: domain,
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        filters: [
          ['relevant_serp_items', '>', 10]
        ],
        order_by: ['avg_position,asc'],
      }]
    );
  }

  async getKeywordSuggestions(seedKeywords: string[], limit = 500): Promise<DataForSEOResponse<KeywordSuggestionsResult>> {
    return this.request<KeywordSuggestionsResult>(
      '/dataforseo_labs/google/keyword_suggestions/live',
      [{
        keywords: seedKeywords.slice(0, 20),
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        include_seed_keyword: false,
        order_by: ['keyword_info.search_volume,desc'],
      }]
    );
  }

  async getRelatedKeywords(seedKeywords: string[], limit = 500): Promise<DataForSEOResponse<RelatedKeywordsResult>> {
    return this.request<RelatedKeywordsResult>(
      '/dataforseo_labs/google/related_keywords/live',
      [{
        keywords: seedKeywords.slice(0, 20),
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
      }]
    );
  }

  async getKeywordsForSite(domain: string, limit = 500): Promise<DataForSEOResponse<KeywordsForSiteResult>> {
    return this.request<KeywordsForSiteResult>(
      '/dataforseo_labs/google/keywords_for_site/live',
      [{
        target: domain,
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        order_by: ['keyword_info.search_volume,desc'],
      }]
    );
  }

  async getDomainIntersection(domain: string, competitorDomain: string, limit = 500): Promise<DataForSEOResponse<DomainIntersectionResult>> {
    return this.request<DomainIntersectionResult>(
      '/dataforseo_labs/google/domain_intersection/live',
      [{
        target1: competitorDomain,
        target2: domain,
        location_code: this.locationCode,
        language_code: this.languageCode,
        limit,
        // Keywords where competitor ranks but target doesn't (or ranks worse)
        intersections: {
          [competitorDomain]: { '1': true },  // competitor present in top results
          [domain]: { '1': false },  // our domain NOT present
        },
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
      }]
    );
  }

  async getBulkKeywordDifficulty(keywords: string[]): Promise<DataForSEOResponse<BulkKeywordDifficultyResult>> {
    return this.request<BulkKeywordDifficultyResult>(
      '/dataforseo_labs/google/bulk_keyword_difficulty/live',
      [{
        keywords: keywords.slice(0, 1000),
        location_code: this.locationCode,
        language_code: this.languageCode,
      }]
    );
  }
}

// DataForSEO response result types
export interface RankedKeywordsResult {
  se_type: string;
  target: string;
  location_code: number;
  total_count: number;
  items_count: number;
  items: RankedKeywordItem[];
}

export interface RankedKeywordItem {
  se_type: string;
  keyword_data: {
    keyword: string;
    keyword_info: {
      search_volume: number;
      cpc: number;
      competition: number;
      competition_level: string;
    };
    keyword_info_normalized_with_bing?: {
      search_volume: number;
    };
    search_intent_info?: {
      main_intent: string;
      foreign_intent: string[];
    };
    keyword_properties?: {
      keyword_difficulty: number;
    };
  };
  ranked_serp_element: {
    serp_item: {
      type: string;
      rank_group: number;
      rank_absolute: number;
      url: string;
      estimated_paid_traffic_cost: number;
      etv: number; // estimated traffic volume
    };
  };
}

export interface CompetitorsDomainResult {
  se_type: string;
  target: string;
  location_code: number;
  total_count: number;
  items_count: number;
  items: CompetitorDomainItem[];
}

export interface CompetitorDomainItem {
  se_type: string;
  domain: string;
  avg_position: number;
  sum_position: number;
  intersections: number;
  full_domain_metrics: {
    organic: {
      etv: number;
      count: number;
      estimated_paid_traffic_cost: number;
    };
  }[];
}

export interface KeywordSuggestionsResult {
  se_type: string;
  seed_keywords: string[];
  total_count: number;
  items_count: number;
  items: KeywordSuggestionItem[];
}

export interface KeywordSuggestionItem {
  se_type: string;
  keyword_data: {
    keyword: string;
    keyword_info: {
      search_volume: number;
      cpc: number;
      competition: number;
      competition_level: string;
    };
    search_intent_info?: {
      main_intent: string;
      foreign_intent: string[];
    };
    keyword_properties?: {
      keyword_difficulty: number;
    };
  };
}

export interface RelatedKeywordsResult {
  se_type: string;
  total_count: number;
  items_count: number;
  items: RelatedKeywordItem[];
}

export interface RelatedKeywordItem {
  se_type: string;
  keyword_data: {
    keyword: string;
    keyword_info: {
      search_volume: number;
      cpc: number;
      competition: number;
    };
    search_intent_info?: {
      main_intent: string;
      foreign_intent: string[];
    };
    keyword_properties?: {
      keyword_difficulty: number;
    };
  };
  related_keywords: string[];
}

export interface KeywordsForSiteResult {
  se_type: string;
  target: string;
  total_count: number;
  items_count: number;
  items: KeywordForSiteItem[];
}

export interface KeywordForSiteItem {
  se_type: string;
  keyword_info: {
    search_volume: number;
    cpc: number;
    competition: number;
    competition_level: string;
  };
  keyword_properties?: {
    keyword_difficulty: number;
  };
  search_intent_info?: {
    main_intent: string;
    foreign_intent: string[];
  };
  keyword: string;
  impressions_info?: {
    daily_impressions_average: number;
    daily_clicks_average: number;
  };
}

export interface DomainIntersectionResult {
  se_type: string;
  total_count: number;
  items_count: number;
  items: DomainIntersectionItem[];
}

export interface DomainIntersectionItem {
  se_type: string;
  keyword_data: {
    keyword: string;
    keyword_info: {
      search_volume: number;
      cpc: number;
      competition: number;
    };
    search_intent_info?: {
      main_intent: string;
      foreign_intent: string[];
    };
    keyword_properties?: {
      keyword_difficulty: number;
    };
  };
  first_domain_serp_element: {
    serp_item: {
      rank_group: number;
      url: string;
      etv: number;
    };
  };
  second_domain_serp_element: {
    serp_item: {
      rank_group: number;
      url: string;
      etv: number;
    };
  } | null;
}

export interface BulkKeywordDifficultyResult {
  se_type: string;
  items_count: number;
  items: {
    keyword: string;
    keyword_difficulty: number;
  }[];
}
