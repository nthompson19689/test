#!/usr/bin/env python3
"""
Content Writer Agent — AI Content Marketing Engine
Takes a keyword and client domain, conducts real research, and writes
a fully optimized 1500-word blog post grounded in the client's Brand Brain.
Usage:
    python scripts/content_writer.py --domain barelyshipping.ai --keyword "AI workflows for small SaaS teams"
"""
import argparse
import os
import re
import sys
from datetime import datetime, timezone
import anthropic
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client
load_dotenv()
# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
DATAFORSEO_LOGIN = os.environ["DATAFORSEO_LOGIN"]
DATAFORSEO_PASSWORD = os.environ["DATAFORSEO_PASSWORD"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3/"
REQUEST_TIMEOUT = 10
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
# ---------------------------------------------------------------------------
# Cache Logging Helper
# ---------------------------------------------------------------------------
def log_cache_stats(response, label=""):
    """Log cache performance stats from an API response."""
    usage = response.usage
    input_tokens = usage.input_tokens
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    total_input = input_tokens + cache_read + cache_creation
    if total_input > 0:
        savings_pct = (cache_read / total_input) * 100
    else:
        savings_pct = 0.0
    prefix = f"[CACHE{' ' + label if label else ''}]"
    print(f"  {prefix} Input tokens: {total_input} | Cached tokens: {cache_read} | Cache savings: {savings_pct:.1f}%")
# ---------------------------------------------------------------------------
# Step 1 — Load Brand Brain from Supabase
# ---------------------------------------------------------------------------
def load_brand_brain(client_id: str) -> dict:
    print(f"[1/6] Loading Brand Brain for client {client_id}...")
    guidelines_resp = (
        supabase.table("brand_guidelines")
        .select("*")
        .eq("client_id", client_id)
        .execute()
    )
    guidelines = guidelines_resp.data or []
    chunks_resp = (
        supabase.table("brand_brain_chunks")
        .select("*")
        .eq("client_id", client_id)
        .eq("source_type", "content_example")
        .execute()
    )
    content_examples = chunks_resp.data or []
    print(f"  Loaded {len(guidelines)} brand guidelines, {len(content_examples)} content examples")
    return {"guidelines": guidelines, "content_examples": content_examples}
# ---------------------------------------------------------------------------
# Step 2 — SERP Analysis via DataforSEO
# ---------------------------------------------------------------------------
def analyze_serps(keyword: str) -> dict:
    print(f"[2/6] Analyzing SERPs for '{keyword}'...")
    url = f"{DATAFORSEO_BASE_URL}serp/google/organic/live/regular"
    payload = [
        {
            "keyword": keyword,
            "location_name": "United States",
            "language_name": "English",
            "device": "desktop",
            "os": "windows",
        }
    ]
    try:
        resp = requests.post(
            url,
            auth=(DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD),
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        print(f"  [ERROR] DataforSEO request failed: {exc}")
        return {"organic": [], "paa": [], "related": [], "competitor_analysis": []}
    results = []
    try:
        results = data["tasks"][0]["result"][0]["items"]
    except (KeyError, IndexError, TypeError):
        print("  [ERROR] Unexpected DataforSEO response structure")
        return {"organic": [], "paa": [], "related": [], "competitor_analysis": []}
    # Extract organic, PAA, related searches
    organic = [
        {"url": item["url"], "title": item.get("title", ""), "description": item.get("description", "")}
        for item in results
        if item.get("type") == "organic"
    ][:3]
    paa = [
        item.get("title", "") or item.get("question", "")
        for item in results
        if item.get("type") == "people_also_ask"
    ]
    related = [
        item.get("title", "") or item.get("seed_keyword", "")
        for item in results
        if item.get("type") == "related_searches"
    ]
    # Scrape top 3 organic URLs
    competitor_analysis = []
    scraped_count = 0
    for entry in organic:
        analysis = scrape_competitor(entry["url"])
        if analysis:
            analysis["serp_title"] = entry["title"]
            analysis["serp_description"] = entry["description"]
            competitor_analysis.append(analysis)
            scraped_count += 1
    print(
        f"  Found {len(paa)} PAA questions, {len(related)} related searches, "
        f"scraped {scraped_count}/3 competitor URLs"
    )
    return {
        "organic": organic,
        "paa": paa,
        "related": related,
        "competitor_analysis": competitor_analysis,
    }
def scrape_competitor(url: str) -> dict | None:
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
    except Exception:
        return None
    soup = BeautifulSoup(resp.text, "html.parser")
    # Remove all script and style tags before extracting text
    for tag in soup.find_all(["script", "style"]):
        tag.decompose()
    h1 = soup.find("h1")
    h1_text = h1.get_text(strip=True) if h1 else ""
    h2s = [h2.get_text(strip=True) for h2 in soup.find_all("h2")]
    body_text = soup.get_text(separator=" ", strip=True)
    word_count = len(body_text.split())
    first_2000 = body_text[:2000]
    return {
        "url": url,
        "h1": h1_text,
        "h2s": h2s,
        "word_count": word_count,
        "body_preview": first_2000,
    }
# ---------------------------------------------------------------------------
# Step 3 — Internal Link Opportunities
# ---------------------------------------------------------------------------
def find_internal_links(client_id: str, keyword: str) -> list[dict]:
    print("[3/6] Finding internal link opportunities...")
    resp = (
        supabase.table("sitemap_index")
        .select("url, title, primary_keyword")
        .eq("client_id", client_id)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        print("  Found 0 internal link candidates")
        return []
    kw_words = set(keyword.lower().split())
    matches = []
    for row in rows:
        text = f"{row.get('title', '')} {row.get('primary_keyword', '')}".lower()
        text_words = set(text.split())
        if kw_words & text_words:
            matches.append({"url": row["url"], "title": row.get("title", "")})
    print(f"  Found {len(matches)} internal link candidates")
    return matches
# ---------------------------------------------------------------------------
# Step 4 — Recent Research via Claude Web Search
# ---------------------------------------------------------------------------
def research_topic(keyword: str) -> list[dict]:
    print("[4/6] Researching recent stats via web search...")
    prompt = (
        f"Find the most recent statistics, data, and trends about {keyword} "
        "relevant to B2B SaaS teams in 2025 and 2026. "
        "Include specific numbers and cite your sources."
    )
    try:
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        print(f"  [WARNING] Web search failed: {exc}")
        return []
    # Extract citations from the response
    citations = []
    for block in response.content:
        if block.type == "text":
            text = block.text
            if hasattr(block, "citations") and block.citations:
                for cite in block.citations:
                    citations.append({
                        "text": cite.cited_text if hasattr(cite, "cited_text") else "",
                        "url": cite.url if hasattr(cite, "url") else "",
                    })
    # Also extract useful facts from the text blocks
    facts = []
    for block in response.content:
        if block.type == "text" and block.text.strip():
            facts.append(block.text.strip())
    # Deduplicate citations by URL
    seen_urls = set()
    unique_citations = []
    for c in citations:
        if c["url"] and c["url"] not in seen_urls:
            seen_urls.add(c["url"])
            unique_citations.append(c)
    # Limit to 5
    unique_citations = unique_citations[:5]
    print(f"  Found {len(unique_citations)} citations")
    return [{"facts": "\n".join(facts), "citations": unique_citations}]
# ---------------------------------------------------------------------------
# Step 5 — Write the Article
# ---------------------------------------------------------------------------
def write_article(
    keyword: str,
    brand_brain: dict,
    serp_data: dict,
    internal_links: list[dict],
    research: list[dict],
) -> str:
    print("[5/6] Writing article...")
    # Build brand context strings for system prompt
    guidelines_text = ""
    for g in brand_brain["guidelines"]:
        guideline_type = g.get("type", g.get("guideline_type", "guideline"))
        content = g.get("content", g.get("value", ""))
        guidelines_text += f"[{guideline_type}]\n{content}\n\n"
    examples_text = ""
    for ex in brand_brain["content_examples"]:
        examples_text += f"[Content Example]\n{ex.get('content', ex.get('chunk_text', ''))}\n\n"
    # System prompt as structured blocks with cache_control on static content.
    # Block 1: Base writing instructions (static across all clients)
    # Block 2: Brand guidelines (static per client — cached)
    # Block 3: Content examples (static per client — cached, last static block)
    system_blocks = [
        {
            "type": "text",
            "text": (
                "You are a content writer for this brand. Match the voice, tone, and style "
                "exactly as described in the guidelines. Do not write generic AI content. "
                "Write like a confident, slightly irreverent B2B practitioner who has actually "
                "done this work in the trenches. The humor is observational, not performative. "
                "Always follow the uncomfortable truth with something actionable."
            ),
        },
        {
            "type": "text",
            "text": f"=== BRAND GUIDELINES ===\n{guidelines_text}",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"=== CONTENT EXAMPLES ===\n{examples_text}",
            "cache_control": {"type": "ephemeral"},
        },
    ]
    # Build SERP analysis summary (dynamic — not cached)
    serp_summary_parts = []
    for comp in serp_data.get("competitor_analysis", []):
        serp_summary_parts.append(
            f"- {comp.get('serp_title', comp['url'])}\n"
            f"  H1: {comp['h1']}\n"
            f"  H2s: {', '.join(comp['h2s'][:8])}\n"
            f"  Word count: {comp['word_count']}\n"
            f"  Preview: {comp['body_preview'][:500]}..."
        )
    serp_summary = "\n".join(serp_summary_parts) if serp_summary_parts else "No competitor data available."
    # Research findings (dynamic)
    research_text = ""
    if research:
        research_text = research[0].get("facts", "")
        cites = research[0].get("citations", [])
        if cites:
            research_text += "\n\nSources:\n"
            for c in cites:
                research_text += f"- {c['url']}: {c['text'][:200]}\n"
    # Internal links (dynamic)
    links_text = ""
    if internal_links:
        links_text = "\n".join(
            f"- [{link['title']}]({link['url']})" for link in internal_links
        )
    else:
        links_text = "No internal links available."
    user_prompt = (
        f"Write a comprehensive, SEO-optimized blog post about: {keyword}\n\n"
        f"=== SERP ANALYSIS ===\n{serp_summary}\n\n"
        f"=== PEOPLE ALSO ASK ===\n"
        + "\n".join(f"- {q}" for q in serp_data.get("paa", []))
        + f"\n\n=== RELATED SEARCHES ===\n"
        + "\n".join(f"- {s}" for s in serp_data.get("related", []))
        + f"\n\n=== RECENT RESEARCH & STATS ===\n{research_text}\n\n"
        f"=== INTERNAL LINK OPPORTUNITIES ===\n{links_text}\n\n"
        "=== OUTPUT REQUIREMENTS ===\n"
        "First line: META: [150-160 char meta description]\n"
        "Second line: SLUG: [suggested-url-slug]\n"
        "Then full article in markdown.\n"
        "- H1 must contain the target keyword\n"
        "- Minimum 1500 words\n"
        "- H2s address main subtopics AND People Also Ask questions\n"
        "- FAQ section at end with 5 questions from PAA and related searches\n"
        "- 2-3 external links to cited research under relevant anchor text\n"
        "- Internal links woven in naturally where relevant\n"
        "- Natural keyword placement, not stuffed\n"
    )
    response = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8000,
        system=system_blocks,
        messages=[{"role": "user", "content": user_prompt}],
    )
    log_cache_stats(response, "write_article")
    article_text = ""
    for block in response.content:
        if block.type == "text":
            article_text += block.text
    return article_text
# ---------------------------------------------------------------------------
# Step 6 — Parse and Save
# ---------------------------------------------------------------------------
def parse_and_save(client_id: str, keyword: str, raw_article: str) -> None:
    print("[6/6] Saving to Supabase...")
    lines = raw_article.strip().split("\n")
    # Parse META line
    meta_description = ""
    slug = ""
    body_start_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.upper().startswith("META:"):
            meta_description = stripped[5:].strip()
        elif stripped.upper().startswith("SLUG:"):
            slug = stripped[5:].strip()
            body_start_idx = i + 1
            break
    body = "\n".join(lines[body_start_idx:]).strip()
    # Extract H1: first line starting with "# " in markdown
    title = keyword  # fallback
    for line in body.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = stripped[2:].strip()
            break
    word_count = len(body.split())
    if word_count < 1400:
        print(f"  [WARNING] Article is under 1400 words ({word_count}). Consider regenerating.")
    record = {
        "client_id": client_id,
        "keyword": keyword,
        "title": title,
        "meta_description": meta_description,
        "target_url": slug,
        "body": body,
        "word_count": word_count,
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("content_output").insert(record).execute()
    print(f"Done! Article saved. Word count: {word_count}. Status: draft.")
# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------
def resolve_client_id(domain: str) -> str:
    resp = (
        supabase.table("clients")
        .select("id")
        .eq("domain", domain)
        .limit(1)
        .execute()
    )
    if not resp.data:
        print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return resp.data[0]["id"]
def main():
    parser = argparse.ArgumentParser(description="AI Content Writer Agent")
    parser.add_argument("--domain", required=True, help="Client domain (e.g. barelyshipping.ai)")
    parser.add_argument("--keyword", required=True, help="Target keyword (wrap multi-word in quotes)")
    args = parser.parse_args()
    client_id = resolve_client_id(args.domain)
    # Step 1 — Brand Brain
    brand_brain = load_brand_brain(client_id)
    # Step 2 — SERP Analysis
    serp_data = analyze_serps(args.keyword)
    # Step 3 — Internal Links
    internal_links = find_internal_links(client_id, args.keyword)
    # Step 4 — Research
    research = research_topic(args.keyword)
    # Step 5 — Write Article
    raw_article = write_article(
        keyword=args.keyword,
        brand_brain=brand_brain,
        serp_data=serp_data,
        internal_links=internal_links,
        research=research,
    )
    # Step 6 — Parse & Save
    parse_and_save(client_id, args.keyword, raw_article)
if __name__ == "__main__":
    main()
