/**
 * Web Scraper Module
 * Fetches URLs and extracts clean text using Readability
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ScrapeResult {
  raw_html: string;
  clean_text: string;
  title: string;
  url: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  publishedTime?: string;
}

export interface ScrapeOptions {
  timeout?: number;
  userAgent?: string;
  followRedirects?: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape a URL and extract content
 */
export async function scrapeUrl(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const { timeout = 30000, userAgent = DEFAULT_USER_AGENT } = options;

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Fetch the page
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const raw_html = await response.text();

    // Parse with JSDOM
    const dom = new JSDOM(raw_html, { url });
    const document = dom.window.document;

    // Extract title
    const title = document.title || parsedUrl.hostname;

    // Use Readability to extract main content
    const reader = new Readability(document);
    const article = reader.parse();

    let clean_text: string;
    let byline: string | undefined;
    let excerpt: string | undefined;
    let siteName: string | undefined;
    let publishedTime: string | undefined;

    if (article) {
      clean_text = article.textContent || '';
      byline = article.byline || undefined;
      excerpt = article.excerpt || undefined;
      siteName = article.siteName || undefined;
      publishedTime = article.publishedTime || undefined;
    } else {
      // Fallback: extract text from body
      const body = document.querySelector('body');
      clean_text = body ? extractTextFromElement(body) : '';
    }

    // Clean up the text
    clean_text = cleanText(clean_text);

    return {
      raw_html,
      clean_text,
      title,
      url: response.url, // Final URL after redirects
      byline,
      excerpt,
      siteName,
      publishedTime,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout fetching URL: ${url}`);
    }
    throw error;
  }
}

/**
 * Extract text from an HTML element
 */
function extractTextFromElement(element: Element): string {
  // Remove script, style, and other non-content elements
  const clone = element.cloneNode(true) as Element;
  const removeSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'footer',
    'header',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.nav',
    '.navigation',
    '.menu',
    '.sidebar',
    '.footer',
    '.header',
    '.advertisement',
    '.ads',
    '.ad',
  ];

  for (const selector of removeSelectors) {
    const elements = clone.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  }

  return clone.textContent || '';
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return (
    text
      // Normalize whitespace
      .replace(/[\t ]+/g, ' ')
      // Normalize newlines
      .replace(/\n\s*\n/g, '\n\n')
      // Remove leading/trailing whitespace from lines
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Trim overall
      .trim()
  );
}

/**
 * Pluggable interface for JS-rendering scraper (future enhancement)
 */
export interface JsRenderingScraper {
  scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}

// TODO: Implement Puppeteer-based JS rendering scraper
// export class PuppeteerScraper implements JsRenderingScraper { ... }
