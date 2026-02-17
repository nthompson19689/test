import type { SEOReportInput } from './types';

/**
 * Business Context Brief — built once before keyword research begins.
 * Acts as the "bouncer at the door" for every keyword evaluated.
 */
export interface BusinessContext {
  /** Positive signal terms extracted from product category, value prop, products */
  categoryTerms: string[];
  /** Multi-word positive phrases */
  categoryPhrases: string[];
  /** Buyer-related terms (job titles, functions, company types) */
  buyerTerms: string[];
  /** Explicit negative keywords (instant disqualify) */
  negativeKeywords: string[];
  /** Multi-word negative phrases (instant disqualify) */
  negativePhrases: string[];
  /** Patterns parsed from "what this product is NOT" */
  isNotPatterns: string[];
  /** Ambiguous term disambiguation rules */
  ambiguousRules: AmbiguousRule[];
  /** Competitor names (for navigational query handling) */
  competitors: string[];
  /** The raw product category for context */
  productCategory: string;
  /** Category exclusion overrides — which built-in categories to skip */
  categoryOverrides: Set<string>;
}

interface AmbiguousRule {
  term: string;           // The ambiguous word
  correctContext: string[];  // Words that confirm correct usage
  wrongContext: string[];    // Words that confirm wrong usage
}

// ─── Built-in Category Exclusion Patterns ─────────────────────────────
// Each category has regex patterns. If a keyword matches AND the product
// doesn't override that category, the keyword is rejected.

const CATEGORY_EXCLUSIONS: Record<string, { patterns: RegExp[]; overrideIf: string[] }> = {
  entertainment: {
    patterns: [
      /\b(movie|movies|film|films|cinema|tv\s*show|television|series\s+finale|episode|season\s+\d|cast\s+(?:of|list)|actor|actress|trailer|prequel|franchise|netflix|hulu|disney\+?|hbo|amazon\s+prime|streaming\s+(?:service|platform)s?|box\s+office|rotten\s+tomatoes|imdb|sequel\s+(?:movie|film|to\s+the|announced))\b/i,
      /\b(?:part\s+[2-9]|part\s+(?:two|three|four)|chapter\s+\d)\b/i,
    ],
    overrideIf: ['entertainment', 'streaming', 'movie', 'film', 'media'],
  },
  consumer_streaming: {
    patterns: [
      /\b(live\s+scor(?:e|es|ing)|live\s+stream\s+(?:sports|music|news|free|game|nfl|nba|mlb)|live\s+tv\s+(?:channel|free|app)|sports?\s+scor(?:e|es)|match\s+result|live\s+concert)\b/i,
    ],
    overrideIf: ['streaming', 'live tv', 'sports', 'broadcast'],
  },
  job_seeking: {
    patterns: [
      /\b((?:remote\s+)?jobs?\s+(?:near|opening|listing|posting|salary|description|interview|search|board|site)|career(?:s|builder)|hiring\s+(?:manager|process|now)|resume|(?:work\s+from\s+home|wfh)\s+jobs?|virtual\s+assistant\s+(?:job|salary|hiring))\b/i,
      /\b(?:salary|salaries|glassdoor|indeed|linkedin\s+jobs?)\b/i,
    ],
    overrideIf: ['job board', 'recruitment', 'hiring', 'career', 'hr tech'],
  },
  local_events: {
    patterns: [
      /\b(near\s+me|events?\s+(?:near|in\s+[a-z]+|this\s+weekend|today|tonight)|things\s+to\s+do|venue(?:s)?\s+(?:near|for|in)|ticket(?:s|master|ing)\s+(?:for|buy|price)|concert(?:s)?\s+(?:near|in|tonight|2\d{3})|festival(?:s)?\s+(?:near|in|2\d{3}))\b/i,
    ],
    overrideIf: ['ticketing', 'venue', 'event planning', 'event management'],
  },
  consumer_hardware: {
    patterns: [
      /\b(vr\s+headset|virtual\s+reality\s+(?:headset|glasses|game|experience)|oculus|meta\s+quest|playstation\s+vr|htc\s+vive|vr\s+(?:game|gaming|app))\b/i,
    ],
    overrideIf: ['virtual reality', 'vr', 'hardware', 'headset'],
  },
  unrelated_software: {
    patterns: [
      /\b(sql\s+(?:query|queries|server|database|tutorial|injection|join|select|insert|update|delete|syntax)|mysql|postgresql|mongodb|oracle\s+(?:db|database)|nosql)\b/i,
      /\b(programming\s+(?:language|tutorial)|python\s+(?:code|script|tutorial)|javascript\s+(?:code|tutorial)|github\s+(?:repo|repository|actions))\b/i,
    ],
    overrideIf: ['database', 'sql', 'developer tool', 'programming', 'devops'],
  },
  broad_academic: {
    patterns: [
      /\b(research\s+paper|academic\s+(?:journal|paper|study)|(?:event|marketing)\s+(?:probability|theory|definition|101|fundamentals)|(?:what\s+is)\s+(?:marketing|business|management|economics))\b/i,
    ],
    overrideIf: ['education', 'academic', 'learning', 'university'],
  },
};

// ─── Build Business Context ───────────────────────────────────────────

export function buildBusinessContext(input: SEOReportInput): BusinessContext {
  const categoryTerms: string[] = [];
  const categoryPhrases: string[] = [];
  const buyerTerms: string[] = [];
  const negativeKeywords: string[] = [];
  const negativePhrases: string[] = [];
  const isNotPatterns: string[] = [];
  const ambiguousRules: AmbiguousRule[] = [];
  const competitors: string[] = [];

  // Product category is the core signal
  const productCategory = input.productCategory || input.industry || '';
  if (productCategory) {
    categoryTerms.push(...extractTerms(productCategory));
    categoryPhrases.push(...extractPhrases(productCategory));
  }

  // Value proposition
  categoryTerms.push(...extractTerms(input.valueProposition));
  categoryPhrases.push(...extractPhrases(input.valueProposition));

  // Products/services
  if (input.products?.length) {
    for (const p of input.products) {
      categoryTerms.push(...extractTerms(p));
      const cleaned = p.toLowerCase().trim();
      if (cleaned.includes(' ')) categoryPhrases.push(cleaned);
    }
  }

  // Buying triggers add context about the problem space
  if (input.buyingTriggers) {
    categoryTerms.push(...extractTerms(input.buyingTriggers));
    categoryPhrases.push(...extractPhrases(input.buyingTriggers));
  }

  // Primary buyer
  const buyer = input.primaryBuyer || input.targetAudience || '';
  if (buyer) {
    buyerTerms.push(...extractTerms(buyer));
  }

  // Domain name
  const domainBase = input.domain.replace(/\.(com|io|co|net|org|ai|app|dev)$/, '');
  categoryTerms.push(...domainBase.split(/[-._]/).filter(w => w.length > 2).map(w => w.toLowerCase()));

  // Explicit negative keywords
  if (input.negativeKeywords?.length) {
    for (const nk of input.negativeKeywords) {
      const cleaned = nk.toLowerCase().trim();
      if (!cleaned) continue;
      if (cleaned.includes(' ')) {
        negativePhrases.push(cleaned);
      } else {
        negativeKeywords.push(cleaned);
      }
    }
  }

  // "What this product is NOT" — parse into exclusion patterns
  if (input.productIsNot) {
    const isNotText = input.productIsNot.toLowerCase();
    // Split on commas, periods, "NOT a/an", semicolons
    const clauses = isNotText.split(/[,.;]|\bnot\s+(?:a|an)\b/i).map(s => s.trim()).filter(Boolean);
    for (const clause of clauses) {
      const terms = extractTerms(clause);
      const phrase = terms.join(' ');
      if (phrase.length > 3) {
        isNotPatterns.push(phrase);
      }
      // Individual strong terms from isNot also become negatives
      for (const t of terms) {
        if (t.length > 3 && !STOP_WORDS.has(t)) {
          // Only add as negative if it's NOT also a positive category term
          if (!categoryTerms.includes(t)) {
            isNotPatterns.push(t);
          }
        }
      }
    }
  }

  // Ambiguous terms
  if (input.ambiguousTerms) {
    const lines = input.ambiguousTerms.split(/[;\n]/).filter(Boolean);
    for (const line of lines) {
      // Parse format: "term = correct meaning, not wrong meaning"
      // or "term: correct meaning vs wrong meaning"
      const eqMatch = line.match(/^([^=:]+)[=:](.+)/);
      if (eqMatch) {
        const term = eqMatch[1].trim().toLowerCase();
        const rest = eqMatch[2].toLowerCase();
        const wrongParts = rest.split(/\bnot\b|\bvs\b|\bnot\b|\bconfused with\b|\boften confused\b/);
        const correctPart = wrongParts[0] || '';
        const wrongPart = wrongParts.slice(1).join(' ');

        ambiguousRules.push({
          term,
          correctContext: extractTerms(correctPart).filter(t => t !== term),
          wrongContext: extractTerms(wrongPart).filter(t => t !== term),
        });
      }
    }
  }

  // Competitors
  if (input.competitors?.length) {
    for (const c of input.competitors) {
      const cleaned = c.toLowerCase().trim();
      if (cleaned) competitors.push(cleaned);
    }
  }

  // Determine which category exclusions to override based on product
  const categoryOverrides = new Set<string>();
  const allProductText = `${productCategory} ${input.valueProposition} ${(input.products || []).join(' ')}`.toLowerCase();
  for (const [catName, catDef] of Object.entries(CATEGORY_EXCLUSIONS)) {
    for (const overrideTerm of catDef.overrideIf) {
      if (allProductText.includes(overrideTerm)) {
        categoryOverrides.add(catName);
        break;
      }
    }
  }

  return {
    categoryTerms: [...new Set(categoryTerms)],
    categoryPhrases: [...new Set(categoryPhrases)],
    buyerTerms: [...new Set(buyerTerms)],
    negativeKeywords: [...new Set(negativeKeywords)],
    negativePhrases: [...new Set(negativePhrases)],
    isNotPatterns: [...new Set(isNotPatterns)],
    ambiguousRules,
    competitors,
    productCategory,
    categoryOverrides,
  };
}

// ─── Per-Keyword Evaluation Gate ──────────────────────────────────────

export interface FilterResult {
  pass: boolean;
  reason?: string;  // Why it was rejected (for debugging/warnings)
}

/**
 * The "bouncer at the door" — evaluates a single keyword against
 * the Business Context Brief. Returns pass/fail with reason.
 *
 * Applied to EVERY keyword before it enters any list.
 */
export function evaluateKeyword(keyword: string, ctx: BusinessContext): FilterResult {
  const kw = keyword.toLowerCase();
  const kwWords = kw.split(/\s+/);

  // ─── Gate 1: Explicit negative phrase match (instant reject) ───
  for (const np of ctx.negativePhrases) {
    if (kw.includes(np)) {
      return { pass: false, reason: `matches negative phrase "${np}"` };
    }
  }

  // ─── Gate 2: Explicit negative keyword match ───
  // Only reject if the keyword has no positive signals
  let negativeHits = 0;
  for (const w of kwWords) {
    if (ctx.negativeKeywords.includes(w)) negativeHits++;
  }
  if (negativeHits > 0) {
    const hasPositive = kwWords.some(w =>
      ctx.categoryTerms.includes(w) && !ctx.negativeKeywords.includes(w)
    );
    if (!hasPositive) {
      return { pass: false, reason: `matches negative keyword(s) with no positive signal` };
    }
  }

  // ─── Gate 3: "Product is NOT" patterns ───
  // Check if keyword matches isNot patterns without matching product category
  for (const isNotPattern of ctx.isNotPatterns) {
    if (kw.includes(isNotPattern)) {
      // But does it ALSO match a positive category phrase?
      const hasPositivePhrase = ctx.categoryPhrases.some(cp => kw.includes(cp));
      if (!hasPositivePhrase) {
        // Check if any positive category term is present
        const posTerms = kwWords.filter(w => ctx.categoryTerms.includes(w) && !ctx.isNotPatterns.includes(w));
        if (posTerms.length === 0) {
          return { pass: false, reason: `matches "product is NOT" pattern: "${isNotPattern}"` };
        }
      }
    }
  }

  // ─── Gate 4: Ambiguous term disambiguation ───
  for (const rule of ctx.ambiguousRules) {
    if (!kw.includes(rule.term)) continue;
    // Keyword contains the ambiguous term — check context
    const hasWrongContext = rule.wrongContext.some(wc => kw.includes(wc));
    const hasCorrectContext = rule.correctContext.some(cc => kw.includes(cc));
    if (hasWrongContext && !hasCorrectContext) {
      return { pass: false, reason: `"${rule.term}" used in wrong context` };
    }
  }

  // ─── Gate 5: Category-level exclusions ───
  for (const [catName, catDef] of Object.entries(CATEGORY_EXCLUSIONS)) {
    // Skip categories that don't apply to this product
    if (ctx.categoryOverrides.has(catName)) continue;
    for (const pattern of catDef.patterns) {
      if (pattern.test(kw)) {
        return { pass: false, reason: `category exclusion: ${catName}` };
      }
    }
  }

  // ─── Gate 6: Competitor navigational queries ───
  for (const competitor of ctx.competitors) {
    if (kw.includes(competitor)) {
      // Allow comparison/alternative queries
      if (/\b(vs|versus|alternative|compared?|comparison|switch|migrat)/i.test(kw)) {
        continue; // This is a valuable comparison query
      }
      // Reject navigational queries: "[competitor] login", "[competitor] pricing"
      if (/\b(login|sign\s*in|sign\s*up|support|help|download|app|dashboard|cancel|pricing)\b/i.test(kw)) {
        return { pass: false, reason: `competitor navigational query: "${competitor}"` };
      }
    }
  }

  // ─── Gate 7: Buyer plausibility check ───
  // If we have enough context, check that the keyword relates to the product
  // A keyword passes if it has at least one positive signal from the brand context
  if (ctx.categoryTerms.length > 0) {
    const positiveSignals = countPositiveSignals(kw, kwWords, ctx);
    if (positiveSignals === 0) {
      // Zero positive signals — this keyword has nothing to do with the product
      // Exception: very short keywords (1-2 words) may be too generic to match
      if (kwWords.length >= 3) {
        return { pass: false, reason: `no positive signals — not related to product category` };
      }
    }
  }

  return { pass: true };
}

/**
 * Count how many positive signals a keyword has from the business context.
 */
function countPositiveSignals(kw: string, kwWords: string[], ctx: BusinessContext): number {
  let signals = 0;

  // Phrase matches are strong signals
  for (const phrase of ctx.categoryPhrases) {
    if (kw.includes(phrase)) signals += 3;
  }

  // Individual term matches
  for (const word of kwWords) {
    if (word.length <= 2) continue;
    if (STOP_WORDS.has(word)) continue;
    if (ctx.categoryTerms.includes(word)) signals++;
  }

  // Buyer term matches
  for (const word of kwWords) {
    if (ctx.buyerTerms.includes(word)) signals++;
  }

  return signals;
}

/**
 * Score keyword relevance for ranking purposes (0-1).
 * Only called for keywords that PASS the evaluation gate.
 */
export function scoreRelevance(keyword: string, ctx: BusinessContext): number {
  const kw = keyword.toLowerCase();
  const kwWords = kw.split(/\s+/);
  let score = 0;

  // Phrase match
  for (const phrase of ctx.categoryPhrases) {
    if (kw.includes(phrase)) score += 0.4;
  }

  // Term matches
  let termMatches = 0;
  for (const word of kwWords) {
    if (word.length <= 2 || STOP_WORDS.has(word)) continue;
    if (ctx.categoryTerms.includes(word)) termMatches++;
  }
  score += Math.min(0.4, termMatches * 0.12);

  // Buyer relevance
  for (const word of kwWords) {
    if (ctx.buyerTerms.includes(word)) {
      score += 0.15;
      break;
    }
  }

  return Math.min(1, score);
}

// ─── Helpers ─────────────────────────────────────────────────────────

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

function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function extractPhrases(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
  const phrases: string[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1]) &&
        words[i].length > 2 && words[i + 1].length > 2) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  for (let i = 0; i < words.length - 2; i++) {
    const meaningful = [words[i], words[i + 1], words[i + 2]]
      .filter(w => !STOP_WORDS.has(w) && w.length > 2);
    if (meaningful.length >= 2) {
      phrases.push(meaningful.join(' '));
    }
  }

  return [...new Set(phrases)];
}
