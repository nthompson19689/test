#!/usr/bin/env python3
"""
Google Search Console Pipeline for AI Content Marketing Engine.

Pulls GSC performance data and writes keyword opportunities and sitemap
updates to Supabase. Designed for multi-tenant use — looks up client_id
by domain automatically.

Usage:
    python scripts/gsc_pipeline.py --domain indiemusicsoundwaves.com
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from supabase import create_client, Client


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
LOOKBACK_DAYS = 90
RECENT_WINDOW_DAYS = 30  # last 30 days
PREVIOUS_WINDOW_DAYS = 30  # 30 days before the recent window
MIN_IMPRESSIONS_QUICK_WIN = 100
POSITION_RANGE_LOW = 6
POSITION_RANGE_HIGH = 20
CLICK_DECLINE_THRESHOLD = 0.20  # 20 %
MIN_RECENT_CLICKS = 10
ROW_LIMIT = 25_000  # GSC API max rows per request


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env() -> dict:
    """Load and validate required environment variables."""
    load_dotenv()
    required = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        "GSC_SERVICE_ACCOUNT_JSON": os.getenv("GSC_SERVICE_ACCOUNT_JSON"),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}")
        sys.exit(1)
    return required


def get_gsc_service(service_account_path: str):
    """Build an authenticated GSC service client."""
    if not os.path.isfile(service_account_path):
        print(f"ERROR: Service account JSON not found at: {service_account_path}")
        sys.exit(1)
    credentials = service_account.Credentials.from_service_account_file(
        service_account_path, scopes=GSC_SCOPES
    )
    return build("searchconsole", "v1", credentials=credentials)


def resolve_property(service, domain: str) -> str:
    """Try both GSC property formats and return the one that works.

    GSC properties come in two formats:
      - Domain property:     sc-domain:example.com
      - URL-prefix property: https://example.com/

    We try the domain property first (broader coverage), then fall back to
    the URL-prefix property.
    """
    candidates = [
        f"sc-domain:{domain}",
        f"https://{domain}/",
    ]

    today = datetime.utcnow().date()
    test_request = {
        "startDate": (today - timedelta(days=7)).isoformat(),
        "endDate": today.isoformat(),
        "dimensions": ["query"],
        "rowLimit": 1,
    }

    for prop in candidates:
        try:
            response = (
                service.searchanalytics()
                .query(siteUrl=prop, body=test_request)
                .execute()
            )
            if response.get("rows"):
                print(f"  Resolved GSC property: {prop}")
                return prop
        except Exception:
            continue

    print(
        f"ERROR: Could not find a working GSC property for '{domain}'.\n"
        f"  Tried: {candidates}\n"
        "  Make sure the service account has access to this property in GSC."
    )
    sys.exit(1)


def fetch_gsc_data(service, site_url: str, start_date: str, end_date: str,
                   dimensions: list[str]) -> list[dict]:
    """Fetch performance rows from GSC, paging through results."""
    all_rows = []
    start_row = 0

    while True:
        request_body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimensions,
            "rowLimit": ROW_LIMIT,
            "startRow": start_row,
        }
        response = (
            service.searchanalytics()
            .query(siteUrl=site_url, body=request_body)
            .execute()
        )
        rows = response.get("rows", [])
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < ROW_LIMIT:
            break
        start_row += ROW_LIMIT

    return all_rows


# ---------------------------------------------------------------------------
# Opportunity detection
# ---------------------------------------------------------------------------

def find_quick_wins(service, site_url: str) -> list[dict]:
    """Find queries ranking positions 6-20 with impressions > 100 over 90 days.

    These are 'net_new' quick-win keyword opportunities.
    """
    today = datetime.utcnow().date()
    start = (today - timedelta(days=LOOKBACK_DAYS)).isoformat()
    end = today.isoformat()

    rows = fetch_gsc_data(service, site_url, start, end, ["query", "page"])

    opportunities = []
    for row in rows:
        impressions = row.get("impressions", 0)
        position = row.get("position", 0)

        # Filter out zero-impression queries
        if impressions == 0:
            continue

        if (
            POSITION_RANGE_LOW <= position <= POSITION_RANGE_HIGH
            and impressions > MIN_IMPRESSIONS_QUICK_WIN
        ):
            opportunities.append({
                "keyword": row["keys"][0],
                "current_url": row["keys"][1],
                "search_volume": int(impressions),
                "current_rank": round(position),
                "opportunity_type": "net_new",
            })

    print(f"  Found {len(opportunities)} quick-win opportunities")
    return opportunities


def find_refresh_candidates(service, site_url: str) -> list[dict]:
    """Find pages with clicks declining >20% (last 30d vs previous 30d).

    Only flags pages with at least MIN_RECENT_CLICKS in the recent period.
    """
    today = datetime.utcnow().date()

    recent_start = (today - timedelta(days=RECENT_WINDOW_DAYS)).isoformat()
    recent_end = today.isoformat()

    previous_start = (
        today - timedelta(days=RECENT_WINDOW_DAYS + PREVIOUS_WINDOW_DAYS)
    ).isoformat()
    previous_end = (today - timedelta(days=RECENT_WINDOW_DAYS)).isoformat()

    recent_rows = fetch_gsc_data(
        service, site_url, recent_start, recent_end, ["query", "page"]
    )
    previous_rows = fetch_gsc_data(
        service, site_url, previous_start, previous_end, ["query", "page"]
    )

    # Build lookup: (query, page) -> clicks for the previous window
    previous_clicks: dict[tuple[str, str], float] = {}
    for row in previous_rows:
        key = (row["keys"][0], row["keys"][1])
        previous_clicks[key] = row.get("clicks", 0)

    candidates = []
    for row in recent_rows:
        query = row["keys"][0]
        page = row["keys"][1]
        recent_click_count = row.get("clicks", 0)
        impressions = row.get("impressions", 0)
        position = row.get("position", 0)

        # Filter out zero-impression queries
        if impressions == 0:
            continue

        # Minimum click threshold in recent period
        if recent_click_count < MIN_RECENT_CLICKS:
            continue

        prev = previous_clicks.get((query, page), 0)
        if prev == 0:
            continue  # can't compute decline from zero

        decline = (prev - recent_click_count) / prev
        if decline > CLICK_DECLINE_THRESHOLD:
            candidates.append({
                "keyword": query,
                "current_url": page,
                "search_volume": int(impressions),
                "current_rank": round(position),
                "opportunity_type": "refresh",
            })

    print(f"  Found {len(candidates)} refresh candidates")
    return candidates


# ---------------------------------------------------------------------------
# Supabase writes
# ---------------------------------------------------------------------------

def lookup_client_id(supabase: Client, domain: str) -> str:
    """Look up client_id from the clients table by domain."""
    result = (
        supabase.table("clients")
        .select("id")
        .eq("domain", domain)
        .limit(1)
        .execute()
    )
    if not result.data:
        print(f"ERROR: No client found for domain '{domain}' in clients table.")
        sys.exit(1)
    return result.data[0]["id"]


def write_keyword_opportunities(
    supabase: Client, client_id: str, opportunities: list[dict]
) -> int:
    """Write keyword opportunities to Supabase, skipping duplicates.

    Duplicate = same keyword + client_id already exists.
    """
    # Fetch existing keywords for this client to check duplicates
    existing = set()
    page_size = 1000
    offset = 0
    while True:
        result = (
            supabase.table("keyword_opportunities")
            .select("keyword")
            .eq("client_id", client_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not result.data:
            break
        for row in result.data:
            existing.add(row["keyword"])
        if len(result.data) < page_size:
            break
        offset += page_size

    new_rows = []
    for opp in opportunities:
        if opp["keyword"] in existing:
            continue
        existing.add(opp["keyword"])  # prevent duplicates within batch
        new_rows.append({
            "client_id": client_id,
            "keyword": opp["keyword"],
            "opportunity_type": opp["opportunity_type"],
            "search_volume": opp["search_volume"],
            "current_rank": opp["current_rank"],
            "current_url": opp["current_url"],
            "source": "gsc",
        })

    if new_rows:
        # Insert in batches of 500 to avoid payload limits
        batch_size = 500
        for i in range(0, len(new_rows), batch_size):
            batch = new_rows[i : i + batch_size]
            supabase.table("keyword_opportunities").insert(batch).execute()

    print(f"  Inserted {len(new_rows)} new keyword opportunities (skipped {len(opportunities) - len(new_rows)} duplicates)")
    return len(new_rows)


def update_sitemap_index(
    supabase: Client, client_id: str, urls: set[str]
) -> tuple[int, int]:
    """Update sitemap_index: update existing URLs, insert new ones.

    Returns (updated_count, inserted_count).
    """
    if not urls:
        return 0, 0

    now = datetime.utcnow().isoformat()

    # Fetch existing URLs for this client
    existing_urls = set()
    page_size = 1000
    offset = 0
    while True:
        result = (
            supabase.table("sitemap_index")
            .select("url")
            .eq("client_id", client_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not result.data:
            break
        for row in result.data:
            existing_urls.add(row["url"])
        if len(result.data) < page_size:
            break
        offset += page_size

    to_update = urls & existing_urls
    to_insert = urls - existing_urls

    # Update existing: set last_refreshed_at
    for url in to_update:
        (
            supabase.table("sitemap_index")
            .update({"last_refreshed_at": now})
            .eq("client_id", client_id)
            .eq("url", url)
            .execute()
        )

    # Insert new URLs
    if to_insert:
        new_rows = [
            {"client_id": client_id, "url": url, "last_refreshed_at": now}
            for url in to_insert
        ]
        batch_size = 500
        for i in range(0, len(new_rows), batch_size):
            batch = new_rows[i : i + batch_size]
            supabase.table("sitemap_index").insert(batch).execute()

    print(f"  Sitemap index: updated {len(to_update)}, inserted {len(to_insert)} URLs")
    return len(to_update), len(to_insert)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Google Search Console pipeline for keyword opportunities"
    )
    parser.add_argument(
        "--domain",
        required=True,
        help="Domain to pull GSC data for (e.g. indiemusicsoundwaves.com)",
    )
    args = parser.parse_args()
    domain = args.domain

    print(f"\n{'='*60}")
    print(f"GSC Pipeline — {domain}")
    print(f"{'='*60}\n")

    # --- Load environment ---
    env = load_env()

    # --- Supabase client ---
    print("[1/6] Connecting to Supabase...")
    supabase: Client = create_client(
        env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
    )

    # --- Look up client_id ---
    print("[2/6] Looking up client_id...")
    client_id = lookup_client_id(supabase, domain)
    print(f"  client_id: {client_id}")

    # --- GSC authentication ---
    print("[3/6] Authenticating with Google Search Console...")
    service = get_gsc_service(env["GSC_SERVICE_ACCOUNT_JSON"])
    site_url = resolve_property(service, domain)

    # --- Find opportunities ---
    print("[4/6] Finding quick-win keyword opportunities (positions 6-20, impressions > 100)...")
    quick_wins = find_quick_wins(service, site_url)

    print("[5/6] Finding refresh candidates (clicks declining > 20%, min 10 recent clicks)...")
    refresh_candidates = find_refresh_candidates(service, site_url)

    # --- Combine and write ---
    all_opportunities = quick_wins + refresh_candidates

    # Collect all unique page URLs for sitemap_index
    all_urls = {opp["current_url"] for opp in all_opportunities}

    print(f"\n[6/6] Writing results to Supabase...")
    inserted = write_keyword_opportunities(supabase, client_id, all_opportunities)
    updated, new_sitemap = update_sitemap_index(supabase, client_id, all_urls)

    # --- Summary ---
    print(f"\n{'='*60}")
    print("Pipeline complete!")
    print(f"  Quick wins found:        {len(quick_wins)}")
    print(f"  Refresh candidates found:{len(refresh_candidates)}")
    print(f"  Keywords inserted:       {inserted}")
    print(f"  Sitemap URLs updated:    {updated}")
    print(f"  Sitemap URLs inserted:   {new_sitemap}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
