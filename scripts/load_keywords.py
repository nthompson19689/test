#!/usr/bin/env python3
"""
load_keywords.py — Read a CSV, detect keyword intent, cluster similar keywords,
check for duplicates against Supabase, and load into content_schedule.

Usage:
    python3 scripts/load_keywords.py --file sequel_keywords.csv --domain sequel.com

Requires .env with:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime

import anthropic
from dotenv import load_dotenv
from rapidfuzz import fuzz
from supabase import create_client

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
INTENT_BATCH_SIZE = 20
FUZZY_CLUSTER_THRESHOLD = 80
FUZZY_DUPLICATE_EXACT = 100
FUZZY_DUPLICATE_WARN = 80
ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_MAX_TOKENS = 1000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_supabase_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def get_anthropic_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[ERROR] ANTHROPIC_API_KEY must be set in .env")
        sys.exit(1)
    return anthropic.Anthropic(api_key=api_key)


def validate_date(date_str):
    """Validate and return a date string in YYYY-MM-DD format, or None."""
    if not date_str or not date_str.strip():
        return None
    date_str = date_str.strip()
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return date_str
    except ValueError:
        return None


def prompt_user(message):
    """Prompt the user for input."""
    try:
        return input(message)
    except (EOFError, KeyboardInterrupt):
        print("\n[INFO] Operation cancelled by user.")
        sys.exit(0)


# ---------------------------------------------------------------------------
# Step 1 — Read the CSV
# ---------------------------------------------------------------------------

def read_csv(file_path, domain, supabase):
    """Read CSV, let user pick columns, validate domain."""
    # Validate domain against clients table
    result = supabase.table("clients").select("id, domain").eq("domain", domain).execute()
    if not result.data:
        print(f"[ERROR] Domain '{domain}' not found in clients table. Exiting.")
        sys.exit(1)
    client = result.data[0]
    client_id = client["id"]
    print(f"[OK] Domain '{domain}' found. Client ID: {client_id}")

    # Open and read CSV
    try:
        with open(file_path, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            if not headers:
                print("[ERROR] CSV has no headers.")
                sys.exit(1)
            rows = list(reader)
    except FileNotFoundError:
        print(f"[ERROR] File not found: {file_path}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Could not read CSV: {e}")
        sys.exit(1)

    print(f"\nCSV has {len(rows)} rows and these columns:")
    for i, h in enumerate(headers, 1):
        print(f"  {i}. {h}")

    # Pick keyword column
    kw_choice = prompt_user("\nPick the keyword column number: ")
    try:
        kw_col = headers[int(kw_choice) - 1]
    except (ValueError, IndexError):
        print("[ERROR] Invalid column number.")
        sys.exit(1)
    print(f"[OK] Keyword column: '{kw_col}'")

    # Pick date column
    date_choice = prompt_user(
        "Pick the date column number (or press Enter to assign one date to all): "
    )
    date_col = None
    single_date = None
    if date_choice.strip():
        try:
            date_col = headers[int(date_choice) - 1]
        except (ValueError, IndexError):
            print("[ERROR] Invalid column number.")
            sys.exit(1)
        print(f"[OK] Date column: '{date_col}'")
    else:
        single_date = prompt_user("Enter a date for all keywords (YYYY-MM-DD): ").strip()
        if not validate_date(single_date):
            print("[ERROR] Invalid date format. Use YYYY-MM-DD.")
            sys.exit(1)
        print(f"[OK] All keywords will use date: {single_date}")

    # Build keyword list
    keywords = []
    blank_date_rows = []
    skipped_empty = 0

    for i, row in enumerate(rows, 2):  # row 2 = first data row (1-indexed, after header)
        kw = (row.get(kw_col) or "").strip()
        if not kw:
            print(f"[WARNING] Row {i}: empty keyword, skipping")
            skipped_empty += 1
            continue

        if date_col:
            date_val = validate_date(row.get(date_col))
            if date_val is None:
                blank_date_rows.append({"keyword": kw, "row": i})
            else:
                keywords.append({"keyword": kw, "date": date_val})
        else:
            keywords.append({"keyword": kw, "date": single_date})

    # Handle blank dates in date column
    if date_col and blank_date_rows:
        print(
            f"\n{len(blank_date_rows)} rows have no date."
        )
        default_date = prompt_user(
            "Enter a default date for them (YYYY-MM-DD) or press Enter to skip those rows: "
        ).strip()
        if default_date:
            if not validate_date(default_date):
                print("[ERROR] Invalid date format. Skipping those rows.")
            else:
                for item in blank_date_rows:
                    keywords.append({"keyword": item["keyword"], "date": default_date})
                print(f"[OK] Assigned {default_date} to {len(blank_date_rows)} rows.")
        else:
            print(f"[INFO] Skipping {len(blank_date_rows)} rows with blank dates.")
            skipped_empty += len(blank_date_rows)

    return keywords, client_id, skipped_empty


# ---------------------------------------------------------------------------
# Step 2 — Clean and validate keywords
# ---------------------------------------------------------------------------

def clean_keywords(keywords):
    """Strip whitespace, warn on large batches."""
    for kw in keywords:
        kw["keyword"] = kw["keyword"].strip()

    if len(keywords) > 100:
        print(f"\n[WARNING] CSV has {len(keywords)} keywords (more than 100).")
        confirm = prompt_user("Continue? (y/n): ").strip().lower()
        if confirm != "y":
            print("[INFO] Exiting.")
            sys.exit(0)

    return keywords


# ---------------------------------------------------------------------------
# Step 3 — Intent auto-detection (before clustering)
# ---------------------------------------------------------------------------

def detect_intents(keywords, anthropic_client):
    """Batch keywords in groups of 20 and classify intent via Claude."""
    kw_list = [k["keyword"] for k in keywords]
    intent_map = {}

    batches = [
        kw_list[i : i + INTENT_BATCH_SIZE]
        for i in range(0, len(kw_list), INTENT_BATCH_SIZE)
    ]

    for batch_idx, batch in enumerate(batches, 1):
        print(f"[INFO] Detecting intent for batch {batch_idx}/{len(batches)} ({len(batch)} keywords)...")
        prompt_text = (
            "For each keyword below, classify the search intent as exactly one of: "
            "informational, commercial, transactional, navigational. "
            "Return ONLY valid JSON array: "
            '[{"keyword": "example", "intent": "informational"}, ...]. '
            "No preamble, no markdown.\n\nKeywords:\n"
        )
        for kw in batch:
            prompt_text += f"- {kw}\n"

        try:
            response = anthropic_client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=ANTHROPIC_MAX_TOKENS,
                messages=[{"role": "user", "content": prompt_text}],
            )
            raw_text = response.content[0].text.strip()
            parsed = json.loads(raw_text)

            for item in parsed:
                kw_name = item.get("keyword", "")
                intent = item.get("intent", "informational")
                if intent not in ("informational", "commercial", "transactional", "navigational"):
                    intent = "informational"
                intent_map[kw_name] = intent

        except json.JSONDecodeError:
            print(
                f"[WARNING] Could not parse intent for batch {batch_idx}, "
                f"defaulted to informational: {batch}"
            )
            for kw in batch:
                intent_map[kw] = "informational"
        except Exception as e:
            print(
                f"[WARNING] API call failed for batch {batch_idx} ({e}), "
                f"defaulted to informational: {batch}"
            )
            for kw in batch:
                intent_map[kw] = "informational"

    # Map intents back to keyword dicts
    for kw in keywords:
        kw["intent"] = intent_map.get(kw["keyword"], "informational")

    return keywords


# ---------------------------------------------------------------------------
# Step 4 — Keyword clustering (after intent detection)
# ---------------------------------------------------------------------------

def cluster_keywords(keywords, supabase, client_id):
    """
    Cluster similar keywords using rapidfuzz, comparing against each other
    AND against existing content_schedule records for this client.
    """
    # Fetch existing keywords from Supabase for this client
    existing = (
        supabase.table("content_schedule")
        .select("keyword")
        .eq("client_id", client_id)
        .execute()
    )
    existing_keywords = [r["keyword"] for r in (existing.data or [])]

    n = len(keywords)
    merged_into = set()  # indices that have been absorbed as secondaries
    cluster_decisions = []

    for i in range(n):
        if i in merged_into:
            continue

        cluster_indices = [i]

        # Compare against other keywords in the CSV
        for j in range(i + 1, n):
            if j in merged_into:
                continue
            score = fuzz.token_sort_ratio(keywords[i]["keyword"], keywords[j]["keyword"])
            if score >= FUZZY_CLUSTER_THRESHOLD:
                cluster_indices.append(j)

        # Compare against existing Supabase keywords
        existing_matches = []
        for ex_kw in existing_keywords:
            for idx in cluster_indices:
                score = fuzz.token_sort_ratio(keywords[idx]["keyword"], ex_kw)
                if score >= FUZZY_CLUSTER_THRESHOLD:
                    existing_matches.append(ex_kw)
                    break

        if len(cluster_indices) == 1 and not existing_matches:
            continue  # No cluster — standalone keyword

        # Show cluster to user
        print("\n[CLUSTER FOUND] These keywords are similar:")
        for pos, idx in enumerate(cluster_indices, 1):
            kw = keywords[idx]
            suggested = " <-- suggested primary" if pos == 1 else ""
            print(f"  {pos}. {kw['keyword']} ({kw['intent']}){suggested}")

        if existing_matches:
            print("  Also similar to existing Supabase keywords:")
            for ex_kw in existing_matches:
                print(f"    - {ex_kw} (already in content_schedule)")

        choice = prompt_user(
            "Pick primary (number) or Enter to keep all as separate articles: "
        ).strip()

        if choice:
            try:
                primary_pos = int(choice)
                primary_idx = cluster_indices[primary_pos - 1]
            except (ValueError, IndexError):
                print("[WARNING] Invalid choice, keeping all as separate.")
                continue

            # Merge: primary gets secondary_keywords list
            secondaries = []
            for idx in cluster_indices:
                if idx != primary_idx:
                    merged_into.add(idx)
                    secondaries.append(keywords[idx]["keyword"])

            keywords[primary_idx].setdefault("secondary_keywords", [])
            keywords[primary_idx]["secondary_keywords"].extend(secondaries)

            cluster_decisions.append({
                "primary": keywords[primary_idx]["keyword"],
                "secondaries": secondaries,
            })

    # Remove merged keywords
    remaining = [kw for i, kw in enumerate(keywords) if i not in merged_into]

    # Show clustering summary
    total_merged = len(keywords) - len(remaining)
    print("\n--- Clustering summary ---")
    for dec in cluster_decisions:
        count = len(dec["secondaries"])
        print(
            f"  - {count + 1} keywords merged into 1 article "
            f"({dec['primary']} + {count} secondaries)"
        )
    print(f"  - {len(remaining) - len(cluster_decisions)} keywords kept separate")
    print(f"  Total articles to create: {len(remaining)} (down from {len(keywords)} keywords)")

    # Extra warning if total drops below 50%
    if len(remaining) < len(keywords) * 0.5:
        print(
            f"\n[WARNING] After clustering, articles dropped to less than 50% "
            f"of original keyword count ({len(remaining)}/{len(keywords)})."
        )

    confirm = prompt_user("Continue? (y/n): ").strip().lower()
    if confirm != "y":
        print("[INFO] Exiting.")
        sys.exit(0)

    return remaining


# ---------------------------------------------------------------------------
# Step 5 — Fuzzy duplicate check against existing Supabase records
# ---------------------------------------------------------------------------

def check_duplicates(keywords, supabase, client_id):
    """Check remaining keywords against existing content_schedule for this client."""
    existing = (
        supabase.table("content_schedule")
        .select("keyword")
        .eq("client_id", client_id)
        .execute()
    )
    existing_keywords = [r["keyword"] for r in (existing.data or [])]

    if not existing_keywords:
        return keywords

    kept = []
    skipped_duplicates = 0
    skip_all_warnings = False

    for kw in keywords:
        best_match = None
        best_score = 0

        for ex_kw in existing_keywords:
            score = fuzz.token_sort_ratio(kw["keyword"].lower(), ex_kw.lower())
            if score > best_score:
                best_score = score
                best_match = ex_kw

        if best_score >= FUZZY_DUPLICATE_EXACT:
            print(f"[SKIPPED] '{kw['keyword']}' — exact match with existing '{best_match}'")
            skipped_duplicates += 1
            continue

        if best_score >= FUZZY_DUPLICATE_WARN:
            if skip_all_warnings:
                kept.append(kw)
                continue

            print(
                f"\n[WARNING] '{kw['keyword']}' is similar to existing keyword "
                f"'{best_match}' ({best_score}% match)"
            )
            choice = prompt_user("  (y) Load anyway  (n) Skip  (s) Skip all remaining warnings: ").strip().lower()
            if choice == "n":
                skipped_duplicates += 1
                continue
            elif choice == "s":
                skip_all_warnings = True
                kept.append(kw)
                continue
            else:
                kept.append(kw)
                continue
        else:
            kept.append(kw)

    if skipped_duplicates:
        print(f"\n[INFO] Skipped {skipped_duplicates} duplicate(s).")

    return kept


# ---------------------------------------------------------------------------
# Step 6 — Preview
# ---------------------------------------------------------------------------

def preview_keywords(keywords, domain):
    """Show full preview with intents and secondaries."""
    print(f"\nReady to load {len(keywords)} keywords for {domain}:\n")
    for i, kw in enumerate(keywords, 1):
        secondaries = kw.get("secondary_keywords", [])
        sec_text = ""
        if secondaries:
            sec_text = f"\n     Secondaries: {', '.join(secondaries)}"
        print(
            f"  {i}. {kw['keyword']} -- {kw['date']} -- {kw['intent']}{sec_text}"
        )

    confirm = prompt_user("\nLoad these keywords? (y/n): ").strip().lower()
    if confirm != "y":
        print("[INFO] Exiting without loading.")
        sys.exit(0)


# ---------------------------------------------------------------------------
# Step 7 — Load to Supabase
# ---------------------------------------------------------------------------

def load_to_supabase(keywords, client_id, supabase):
    """Insert keywords into content_schedule."""
    total = len(keywords)
    loaded = 0
    errors = 0

    for i, kw in enumerate(keywords, 1):
        record = {
            "client_id": client_id,
            "keyword": kw["keyword"],
            "scheduled_for": kw["date"],
            "status": "pending",
            "intent": kw["intent"],
            "secondary_keywords": kw.get("secondary_keywords", []),
        }

        try:
            supabase.table("content_schedule").insert(record).execute()
            loaded += 1
        except Exception as e:
            print(f"[ERROR] Failed to insert '{kw['keyword']}': {e}")
            errors += 1

        # Progress indicator
        print(f"  Loading... {i}/{total}", end="\r")

    print()  # newline after progress
    return loaded, errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Load keywords from CSV into Supabase content_schedule."
    )
    parser.add_argument("--file", required=True, help="Path to CSV file")
    parser.add_argument("--domain", required=True, help="Client domain (e.g. sequel.com)")
    args = parser.parse_args()

    # Initialize clients
    supabase = get_supabase_client()
    anthropic_client = get_anthropic_client()

    # Step 1 — Read CSV
    print("=== Step 1: Reading CSV ===")
    keywords, client_id, skipped_empty = read_csv(args.file, args.domain, supabase)

    if not keywords:
        print("[ERROR] No valid keywords found in CSV.")
        sys.exit(1)
    print(f"\n[OK] {len(keywords)} keywords extracted from CSV.")

    # Step 2 — Clean and validate
    print("\n=== Step 2: Cleaning keywords ===")
    keywords = clean_keywords(keywords)
    print(f"[OK] {len(keywords)} keywords after cleaning.")

    original_count = len(keywords)

    # Step 3 — Intent detection (BEFORE clustering — Gap 1 fix)
    print("\n=== Step 3: Detecting intent ===")
    keywords = detect_intents(keywords, anthropic_client)
    print("[OK] Intent detection complete.")

    # Step 4 — Clustering (AFTER intent detection — Gap 1 fix)
    # Also checks against existing Supabase records (Gap 2 fix)
    # Secondary keywords carry the primary's intent (Gap 3 fix)
    print("\n=== Step 4: Clustering keywords ===")
    keywords = cluster_keywords(keywords, supabase, client_id)

    clustered_count = original_count - len(keywords)

    # Step 5 — Fuzzy duplicate check against Supabase
    print("\n=== Step 5: Checking for duplicates ===")
    pre_dup_count = len(keywords)
    keywords = check_duplicates(keywords, supabase, client_id)
    skipped_duplicates = pre_dup_count - len(keywords)

    if not keywords:
        print("[INFO] No keywords remaining after duplicate check. Exiting.")
        sys.exit(0)

    # Step 6 — Preview
    print("\n=== Step 6: Preview ===")
    preview_keywords(keywords, args.domain)

    # Step 7 — Load to Supabase
    print("\n=== Step 7: Loading to Supabase ===")
    loaded, errors = load_to_supabase(keywords, client_id, supabase)

    # Final summary
    print("\n=== Done! ===")
    print(f"  Loaded: {loaded} keywords")
    if clustered_count > 0:
        print(f"  Clustered: {clustered_count} keywords merged into fewer articles")
    print(f"  Skipped duplicates: {skipped_duplicates}")
    print(f"  Skipped empty rows: {skipped_empty}")
    if errors:
        print(f"  Errors: {errors}")


if __name__ == "__main__":
    main()
