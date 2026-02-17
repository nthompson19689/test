import type { KeywordOpportunity, SEOReportInput } from './types';

/**
 * Relevance filter that removes noise keywords based on brand context.
 *
 * Builds a "brand dictionary" from the value proposition, industry,
 * products, and target audience, then scores every keyword against it.
 * Keywords that don't meet the relevance threshold are discarded.
 */

interface BrandContext {
  /** Meaningful terms from value prop, industry, products, audience */
  relevantTerms: Set<string>;
  /** Multi-word phrases that strongly signal relevance */
  relevantPhrases: string[];
  /** Terms that explicitly indicate irrelevant results */
  negativeTerms: Set<string>;
  /** Negative phrases (multi-word) */
  negativePhrases: string[];
  /** The raw industry string for semantic matching */
  industry: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'that', 'this', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'when',
  'where', 'why', 'how', 'help', 'helps', 'provide', 'provides',
  'best', 'top', 'leading', 'get', 'make', 'using', 'like', 'also',
  'well', 'new', 'way', 'ways', 'used', 'use',
]);

/**
 * Build brand context from the SEO report inputs.
 */
export function buildBrandContext(input: SEOReportInput): BrandContext {
  const relevantTerms = new Set<string>();
  const relevantPhrases: string[] = [];
  const negativeTerms = new Set<string>();
  const negativePhrases: string[] = [];

  // Extract meaningful words from value proposition
  const vpWords = extractMeaningfulWords(input.valueProposition);
  for (const w of vpWords) relevantTerms.add(w);

  // Extract bigrams from value proposition as phrases
  const vpPhrases = extractPhrases(input.valueProposition);
  relevantPhrases.push(...vpPhrases);

  // Industry terms
  if (input.industry) {
    const industryWords = extractMeaningfulWords(input.industry);
    for (const w of industryWords) relevantTerms.add(w);
    const industryPhrases = extractPhrases(input.industry);
    relevantPhrases.push(...industryPhrases);
  }

  // Products/services are high-signal terms
  if (input.products?.length) {
    for (const product of input.products) {
      const words = extractMeaningfulWords(product);
      for (const w of words) relevantTerms.add(w);
      // The full product name is a strong phrase
      const cleaned = product.toLowerCase().trim();
      if (cleaned.includes(' ')) {
        relevantPhrases.push(cleaned);
      }
    }
  }

  // Target audience terms
  if (input.targetAudience) {
    const audienceWords = extractMeaningfulWords(input.targetAudience);
    for (const w of audienceWords) relevantTerms.add(w);
    const audiencePhrases = extractPhrases(input.targetAudience);
    relevantPhrases.push(...audiencePhrases);
  }

  // Domain name itself is relevant (strip TLD)
  const domainBase = input.domain.replace(/\.(com|io|co|net|org|ai|app|dev)$/, '');
  const domainWords = domainBase.split(/[-._]/).filter(w => w.length > 2);
  for (const w of domainWords) relevantTerms.add(w.toLowerCase());

  // Negative keywords
  if (input.negativeKeywords?.length) {
    for (const nk of input.negativeKeywords) {
      const cleaned = nk.toLowerCase().trim();
      if (cleaned.includes(' ')) {
        negativePhrases.push(cleaned);
      }
      const words = extractMeaningfulWords(nk);
      for (const w of words) negativeTerms.add(w);
    }
  }

  return {
    relevantTerms,
    relevantPhrases: [...new Set(relevantPhrases)],
    negativeTerms,
    negativePhrases: [...new Set(negativePhrases)],
    industry: (input.industry || '').toLowerCase(),
  };
}

/**
 * Score a single keyword's relevance to the brand (0–1).
 *
 * Returns 0 if the keyword matches a negative term/phrase.
 * Higher score = more relevant.
 */
export function scoreKeywordRelevance(keyword: string, ctx: BrandContext): number {
  const kwLower = keyword.toLowerCase();

  // Immediate disqualification: matches a negative phrase
  for (const np of ctx.negativePhrases) {
    if (kwLower.includes(np)) return 0;
  }

  // Check for negative single-word matches (only disqualify if no positive signals)
  let negativeHits = 0;
  const kwWords = kwLower.split(/\s+/);
  for (const w of kwWords) {
    if (ctx.negativeTerms.has(w)) negativeHits++;
  }

  // Score positive signals
  let score = 0;
  let signals = 0;

  // Phrase match is the strongest signal (0.5 each, up to 1.0)
  for (const phrase of ctx.relevantPhrases) {
    if (kwLower.includes(phrase)) {
      score += 0.5;
      signals++;
    }
  }

  // Individual relevant term matches (0.15 each)
  for (const word of kwWords) {
    if (word.length <= 2) continue;
    if (STOP_WORDS.has(word)) continue;
    if (ctx.relevantTerms.has(word)) {
      score += 0.15;
      signals++;
    }
  }

  // Industry match bonus
  if (ctx.industry) {
    const industryWords = ctx.industry.split(/\s+/).filter(w => w.length > 2);
    for (const iw of industryWords) {
      if (kwLower.includes(iw)) {
        score += 0.2;
        signals++;
        break;
      }
    }
  }

  // If keyword has negative hits and no positive signals, disqualify
  if (negativeHits > 0 && signals === 0) return 0;

  // If keyword has negative hits but also positive signals, reduce score
  if (negativeHits > 0) {
    score *= 0.5;
  }

  return Math.min(1, score);
}

/**
 * Filter a batch of keyword opportunities, removing irrelevant ones.
 * Returns only keywords with relevance score above the threshold.
 */
export function filterKeywordBatch(
  keywords: KeywordOpportunity[],
  ctx: BrandContext,
  threshold = 0.15
): { kept: KeywordOpportunity[]; removed: KeywordOpportunity[] } {
  const kept: KeywordOpportunity[] = [];
  const removed: KeywordOpportunity[] = [];

  for (const kw of keywords) {
    const relevance = scoreKeywordRelevance(kw.keyword, ctx);
    if (relevance >= threshold) {
      // Blend the brand relevance into the existing relevanceScore
      kw.relevanceScore = (kw.relevanceScore * 0.6) + (relevance * 0.4);
      kept.push(kw);
    } else {
      removed.push(kw);
    }
  }

  return { kept, removed };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractMeaningfulWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function extractPhrases(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
  const phrases: string[] = [];

  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1]) &&
        words[i].length > 2 && words[i + 1].length > 2) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  // Trigrams
  for (let i = 0; i < words.length - 2; i++) {
    const meaningful = [words[i], words[i + 1], words[i + 2]]
      .filter(w => !STOP_WORDS.has(w) && w.length > 2);
    if (meaningful.length >= 2) {
      phrases.push(meaningful.join(' '));
    }
  }

  return [...new Set(phrases)];
}
