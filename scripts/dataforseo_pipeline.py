#!/usr/bin/env python3
"""
DataforSEO Pipeline — AI Content Marketing Engine

Fetches ranked keywords & keyword ideas for a client domain,
parses the sitemap, and populates Supabase tables:
  - sitemap_index
  - keyword_opportunities (refresh + net_new)

Usage:
  python scripts/dataforseo_pipeline.py --domain indiemusicsoundwaves.com
  python scripts/dataforseo_pipeline.py --client-id <uuid> --domain example.com
"""

import argparse
import os
import sys
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DATAFORSEO_LOGIN = os.getenv("DATAFORSEO_LOGIN")
DATAFORSEO_PASSWORD = os.getenv("DATAFORSEO_PASSWORD")

DATAFORSEO_BASE = "https://api.dataforseo.com/v3"
LOCATION_NAME = "United States"
LANGUAGE_NAME = "English"
MIN_SEARCH_VOLUME = 100
BATCH_SIZE = 500


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------
def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def lookup_client_by_domain(sb: Client, domain: str) -> dict:
    """Look up client by domain. Tries exact match, then www variant."""
    result = sb.table("clients").select("*").eq("domain", domain).execute()
    if result.data:
        return result.data[0]

    # Try www / non-www variant
    alt = f"www.{domain}" if not domain.startswith("www.") else domain[4:]
    result = sb.table("clients").select("*").eq("domain", alt).execute()
    if result.data:
        return result.data[0]

    # Try ilike as last resort (handles http(s):// prefixes stored in DB)
    result = sb.table("clients").select("*").ilike("domain", f"%{domain}%").execute()
    if result.data:
        return result.data[0]

    print(f"Error: No client found for domain '{domain}'")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Sitemap fetching & parsing
# ---------------------------------------------------------------------------
SITEMAP_CANDIDATES = [
    "https://{domain}/sitemap.xml",
    "https://{domain}/sitemap_index.xml",
    "https://www.{domain}/sitemap.xml",
]

UA = {"User-Agent": "ContentEngine/1.0"}


def fetch_sitemap(domain: str) -> list[str]:
    """Try common sitemap URLs, parse XML, return list of page URLs."""
    for pattern in SITEMAP_CANDIDATES:
        url = pattern.format(domain=domain)
        try:
            resp = requests.get(url, timeout=30, headers=UA)
            if resp.status_code == 200 and resp.text.strip().startswith("<?xml"):
                urls = _parse_sitemap_xml(resp.text)
                if urls:
                    print(f"  Found {len(urls)} URLs from {url}")
                    return urls
        except requests.RequestException:
            continue
    return []


def _parse_sitemap_xml(xml_text: str) -> list[str]:
    """Recursively parse sitemap XML (handles sitemap index files)."""
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    urls: list[str] = []

    # Sitemap index → follow child sitemaps
    for loc in root.findall(".//sm:sitemap/sm:loc", ns):
        child_url = loc.text.strip()
        try:
            resp = requests.get(child_url, timeout=30, headers=UA)
            if resp.status_code == 200:
                urls.extend(_parse_sitemap_xml(resp.text))
        except requests.RequestException:
            continue

    # Regular sitemap → collect <url><loc>
    for loc in root.findall(".//sm:url/sm:loc", ns):
        urls.append(loc.text.strip())

    return urls


def populate_sitemap_index(sb: Client, client_id: str, urls: list[str]):
    """Insert sitemap URLs into sitemap_index, skipping duplicates."""
    existing = sb.table("sitemap_index").select("url").eq("client_id", client_id).execute()
    existing_urls = {row["url"] for row in existing.data}

    new_rows = [
        {"client_id": client_id, "url": u}
        for u in urls
        if u not in existing_urls
    ]

    if not new_rows:
        print(f"  All {len(urls)} sitemap URLs already exist — nothing to insert")
        return

    for i in range(0, len(new_rows), BATCH_SIZE):
        sb.table("sitemap_index").insert(new_rows[i : i + BATCH_SIZE]).execute()

    print(f"  Inserted {len(new_rows)} new URLs into sitemap_index")


# ---------------------------------------------------------------------------
# DataforSEO helpers
# ---------------------------------------------------------------------------
def _dfse_post(endpoint: str, payload: list[dict]) -> dict:
    """Authenticated POST to DataforSEO v3 API."""
    url = f"{DATAFORSEO_BASE}/{endpoint}"
    resp = requests.post(
        url,
        json=payload,
        auth=(DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD),
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    if resp.status_code == 401:
        print("Error: DataforSEO authentication failed. Check DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.")
        sys.exit(1)
    resp.raise_for_status()
    data = resp.json()

    # Check for task-level errors
    for task in data.get("tasks", []):
        if task.get("status_code") != 20000:
            print(f"  DataforSEO task warning: {task.get('status_message')}")

    return data


def fetch_ranked_keywords(domain: str) -> list[dict]:
    """
    DataforSEO Ranked Keywords endpoint.
    Returns keywords the domain already ranks for (organic).
    These become 'refresh' opportunities.
    """
    payload = [
        {
            "target": domain,
            "location_name": LOCATION_NAME,
            "language_name": LANGUAGE_NAME,
            "limit": 1000,
            "item_types": ["organic"],
            "filters": [
                ["keyword_data.keyword_info.search_volume", ">", MIN_SEARCH_VOLUME]
            ],
            "order_by": ["keyword_data.keyword_info.search_volume,desc"],
        }
    ]

    data = _dfse_post("dataforseo_labs/google/ranked_keywords/live", payload)

    keywords = []
    for task in data.get("tasks", []):
        for result in task.get("result") or []:
            for item in result.get("items") or []:
                kd = item.get("keyword_data", {})
                ki = kd.get("keyword_info", {})
                se = item.get("ranked_serp_element", {})
                serp_item = se.get("serp_item", {})

                keyword = kd.get("keyword", "")
                volume = ki.get("search_volume") or 0
                if not keyword or volume <= MIN_SEARCH_VOLUME:
                    continue

                keywords.append(
                    {
                        "keyword": keyword,
                        "search_volume": volume,
                        "competition": ki.get("competition") or 0,
                        "cpc": ki.get("cpc") or 0,
                        "current_rank": serp_item.get("rank_group"),
                        "current_url": serp_item.get("relative_url") or serp_item.get("url"),
                        "opportunity_type": "refresh",
                    }
                )

    return keywords


def fetch_keyword_ideas(domain: str, already_ranked: set[str]) -> list[dict]:
    """
    DataforSEO Keywords-for-Site endpoint.
    Returns keyword ideas relevant to the domain.
    Filters out keywords the site already ranks for → 'net_new' only.
    """
    payload = [
        {
            "target": domain,
            "location_name": LOCATION_NAME,
            "language_name": LANGUAGE_NAME,
            "limit": 1000,
            "filters": [
                ["keyword_info.search_volume", ">", MIN_SEARCH_VOLUME]
            ],
            "order_by": ["keyword_info.search_volume,desc"],
        }
    ]

    data = _dfse_post("dataforseo_labs/google/keywords_for_site/live", payload)

    keywords = []
    for task in data.get("tasks", []):
        for result in task.get("result") or []:
            for item in result.get("items") or []:
                keyword = item.get("keyword", "")
                ki = item.get("keyword_info", {})
                volume = ki.get("search_volume") or 0

                if not keyword or volume <= MIN_SEARCH_VOLUME:
                    continue
                if keyword.lower() in already_ranked:
                    continue

                keywords.append(
                    {
                        "keyword": keyword,
                        "search_volume": volume,
                        "competition": ki.get("competition") or 0,
                        "cpc": ki.get("cpc") or 0,
                        "current_rank": None,
                        "current_url": None,
                        "opportunity_type": "net_new",
                    }
                )

    return keywords


# ---------------------------------------------------------------------------
# Write keyword_opportunities
# ---------------------------------------------------------------------------
def write_keyword_opportunities(sb: Client, client_id: str, keywords: list[dict]):
    """Insert keywords into keyword_opportunities. Skips duplicates."""
    if not keywords:
        print("  No keywords to insert")
        return

    # Fetch all existing keywords for this client to detect duplicates
    existing = (
        sb.table("keyword_opportunities")
        .select("keyword")
        .eq("client_id", client_id)
        .execute()
    )
    seen = {row["keyword"].lower() for row in existing.data}

    rows = []
    for kw in keywords:
        key = kw["keyword"].lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "client_id": client_id,
                "keyword": kw["keyword"],
                "search_volume": kw["search_volume"],
                "competition": kw["competition"],
                "cpc": kw["cpc"],
                "current_rank": kw["current_rank"],
                "current_url": kw["current_url"],
                "opportunity_type": kw["opportunity_type"],
            }
        )

    if not rows:
        print("  All keywords already exist — nothing new to insert")
        return

    for i in range(0, len(rows), BATCH_SIZE):
        sb.table("keyword_opportunities").insert(rows[i : i + BATCH_SIZE]).execute()

    refresh = sum(1 for r in rows if r["opportunity_type"] == "refresh")
    net_new = sum(1 for r in rows if r["opportunity_type"] == "net_new")
    print(f"  Inserted {len(rows)} keywords  ({refresh} refresh, {net_new} net_new)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="DataforSEO Pipeline — fetch keywords & populate Supabase"
    )
    parser.add_argument(
        "--client-id",
        help="Client UUID from Supabase clients table (auto-detected from --domain if omitted)",
    )
    parser.add_argument(
        "--domain",
        required=True,
        help="Domain to analyze, e.g. indiemusicsoundwaves.com",
    )
    args = parser.parse_args()

    # --- Validate env vars ---------------------------------------------------
    missing = [
        v
        for v in [
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
            "DATAFORSEO_LOGIN",
            "DATAFORSEO_PASSWORD",
        ]
        if not os.getenv(v)
    ]
    if missing:
        print(f"Error: Missing env vars: {', '.join(missing)}")
        print("Copy .env.example → .env and fill in all values.")
        sys.exit(1)

    sb = get_supabase()
    domain = args.domain.strip().lower().removeprefix("https://").removeprefix("http://").strip("/")

    # --- Resolve client -------------------------------------------------------
    if args.client_id:
        client_id = args.client_id
        print(f"Using provided client ID: {client_id}")
    else:
        print(f"Looking up client for domain: {domain}")
        client = lookup_client_by_domain(sb, domain)
        client_id = client["id"]
        print(f"  Found client: {client.get('name', 'N/A')} (ID: {client_id})")

    # --- Step 1: Sitemap ------------------------------------------------------
    print(f"\n[1/4] Fetching sitemap for {domain} ...")
    sitemap_urls = fetch_sitemap(domain)
    if sitemap_urls:
        populate_sitemap_index(sb, client_id, sitemap_urls)
    else:
        print("  Warning: No sitemap found or empty — skipping sitemap_index")

    # --- Step 2: Ranked Keywords (refresh) ------------------------------------
    print(f"\n[2/4] Fetching ranked keywords from DataforSEO ...")
    ranked = fetch_ranked_keywords(domain)
    print(f"  {len(ranked)} ranked keywords with volume > {MIN_SEARCH_VOLUME}")

    # --- Step 3: Keyword Ideas (net_new) --------------------------------------
    ranked_set = {kw["keyword"].lower() for kw in ranked}
    print(f"\n[3/4] Fetching keyword ideas from DataforSEO ...")
    ideas = fetch_keyword_ideas(domain, ranked_set)
    print(f"  {len(ideas)} net-new keyword ideas with volume > {MIN_SEARCH_VOLUME}")

    # --- Step 4: Write to Supabase --------------------------------------------
    all_kw = ranked + ideas
    print(f"\n[4/4] Writing {len(all_kw)} keywords to keyword_opportunities ...")
    write_keyword_opportunities(sb, client_id, all_kw)

    print(f"\nDone! Pipeline complete for {domain}.")


if __name__ == "__main__":
    main()
