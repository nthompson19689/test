#!/usr/bin/env python3
"""
Batch pipeline for the AI Content Marketing Engine.

Reads from a Supabase content_schedule table and runs the full
writer + editor pipeline for all keywords scheduled for a given date.

Usage:
    python3 scripts/batch_pipeline.py --domain sequel.com --date 2026-03-01
    python3 scripts/batch_pipeline.py --domain sequel.com
    python3 scripts/batch_pipeline.py --domain sequel.com --date 2026-03-01 --dry-run
"""

import argparse
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

MAX_WORKERS = 3
STAGGER_SECONDS = 10
RETRY_WAIT_SECONDS = 60
LOG_FILE = "pipeline.log"

# Lock for synchronized terminal output
_print_lock = threading.Lock()


def log_to_file(domain, keyword, status, detail=""):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{timestamp} | {domain} | {keyword} | {status}"
    if detail:
        line += f" | {detail}"
    line += "\n"
    with open(LOG_FILE, "a") as f:
        f.write(line)


def safe_print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs, flush=True)


def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        safe_print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def lookup_client_id(supabase, domain):
    result = supabase.table("clients").select("id").eq("domain", domain).execute()
    if not result.data:
        safe_print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return result.data[0]["id"]


def load_scheduled_keywords(supabase, client_id, date_str):
    result = (
        supabase.table("content_schedule")
        .select("id, keyword, search_intent")
        .eq("client_id", client_id)
        .eq("scheduled_for", date_str)
        .eq("status", "pending")
        .execute()
    )
    return result.data or []


def extract_article_id(output):
    """Scan writer output for a UUID near 'Article saved' or 'article_id'."""
    uuid_pattern = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

    for line in reversed(output.splitlines()):
        lower = line.lower()
        if "article" in lower or "saved" in lower or "article_id" in lower:
            match = re.search(uuid_pattern, line)
            if match:
                return match.group(0)

    # Fallback: find any UUID in the last 20 lines
    for line in reversed(output.splitlines()[-20:]):
        match = re.search(uuid_pattern, line)
        if match:
            return match.group(0)

    return None


def run_subprocess(cmd):
    """Run a subprocess, capture all output, return (exit_code, combined_output)."""
    process = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )
    combined = ""
    if process.stdout:
        combined += process.stdout
    if process.stderr:
        combined += process.stderr
    return process.returncode, combined


def run_single_job(domain, keyword, schedule_id, job_index, total_jobs):
    """Run writer + editor for a single keyword. Returns (success, output_text)."""
    output_lines = []

    # --- Run content_writer.py ---
    writer_cmd = [
        sys.executable,
        "scripts/content_writer.py",
        "--domain", domain,
        "--keyword", keyword,
        "--schedule-id", str(schedule_id),
    ]
    exit_code, writer_output = run_subprocess(writer_cmd)
    output_lines.append("=== Writer Output ===")
    output_lines.append(writer_output.rstrip())

    if exit_code != 0:
        output_lines.append(f"[ERROR] Writer exited with code {exit_code}")
        return False, "\n".join(output_lines)

    # --- Extract article_id ---
    article_id = extract_article_id(writer_output)
    if not article_id:
        output_lines.append("[ERROR] Could not extract article_id from writer output")
        return False, "\n".join(output_lines)

    output_lines.append(f"Extracted article_id: {article_id}")

    # --- Run content_editor.py ---
    editor_cmd = [
        sys.executable,
        "scripts/content_editor.py",
        "--domain", domain,
        "--article-id", article_id,
    ]
    exit_code, editor_output = run_subprocess(editor_cmd)
    output_lines.append("=== Editor Output ===")
    output_lines.append(editor_output.rstrip())

    if exit_code != 0:
        output_lines.append(f"[ERROR] Editor exited with code {exit_code}")
        return False, "\n".join(output_lines)

    return True, "\n".join(output_lines)


def run_job_with_retry(domain, keyword, schedule_id, job_index, total_jobs):
    """Run a single job with one retry on failure."""
    success, output = run_single_job(domain, keyword, schedule_id, job_index, total_jobs)

    if not success:
        safe_print(
            f"  [Job {job_index}/{total_jobs}] {keyword} — \u2717 Failed (retrying in {RETRY_WAIT_SECONDS}s)"
        )
        time.sleep(RETRY_WAIT_SECONDS)
        success, retry_output = run_single_job(domain, keyword, schedule_id, job_index, total_jobs)
        output += "\n\n=== RETRY OUTPUT ===\n" + retry_output

        if not success:
            return False, output, "FAILED after retry"

    return success, output, "SUCCESS"


def run_batch(domain, date_str, keywords):
    """Execute all jobs with parallel workers and staggered starts."""
    total = len(keywords)
    start_time = time.time()

    # Track live status
    status_map = {}
    status_lock = threading.Lock()

    def update_status(job_index, keyword, status_text):
        with status_lock:
            status_map[job_index] = (keyword, status_text)

    def job_wrapper(keyword_entry, job_index):
        # Stagger start
        delay = (job_index - 1) * STAGGER_SECONDS
        if delay > 0:
            time.sleep(delay)

        keyword = keyword_entry["keyword"]
        schedule_id = keyword_entry["id"]

        update_status(job_index, keyword, "Running...")

        success, output, status_label = run_job_with_retry(
            domain, keyword, schedule_id, job_index, total
        )

        if success:
            update_status(job_index, keyword, "\u2713 Complete")
            log_to_file(domain, keyword, "SUCCESS", f"article in content_edits")
        else:
            update_status(job_index, keyword, "\u2717 Failed")
            # Extract last error line for log
            error_lines = [l for l in output.splitlines() if "[ERROR]" in l]
            error_detail = error_lines[-1] if error_lines else "unknown error"
            log_to_file(domain, keyword, status_label, f"error: {error_detail}")

        # Print buffered output block
        status_icon = "Complete \u2713" if success else "Failed \u2717"
        safe_print(f"  [Job {job_index}/{total}] {keyword} — {status_icon}")
        safe_print("  --- Output ---")
        for line in output.splitlines():
            safe_print(f"  {line}")
        safe_print("  --- End ---\n")

        return job_index, keyword, success

    # Submit all jobs
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {}
        for i, entry in enumerate(keywords, 1):
            future = executor.submit(job_wrapper, entry, i)
            futures[future] = (i, entry["keyword"])

        completed_count = 0
        failed_count = 0
        failed_keywords = []

        for future in as_completed(futures):
            job_index, keyword, success = future.result()
            if success:
                completed_count += 1
            else:
                failed_count += 1
                failed_keywords.append(keyword)

    elapsed = time.time() - start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    # Final summary
    safe_print("=" * 50)
    safe_print(f"Batch complete for {domain} — {date_str}")
    safe_print("=" * 50)
    safe_print(f"Completed: {completed_count}/{total}")
    safe_print(f"Failed: {failed_count}/{total}" + (
        f" ({', '.join(failed_keywords)} — see {LOG_FILE})" if failed_keywords else ""
    ))
    safe_print(f"Total time: {minutes}m {seconds}s")
    safe_print(f"Articles ready in content_edits table.")
    safe_print("=" * 50)


def main():
    parser = argparse.ArgumentParser(
        description="Batch pipeline: run writer + editor for all scheduled keywords."
    )
    parser.add_argument("--domain", required=True, help="Client domain (e.g. sequel.com)")
    parser.add_argument(
        "--date",
        default=None,
        help="Scheduled date in YYYY-MM-DD format. Defaults to today (local timezone).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show scheduled keywords without running anything.",
    )

    args = parser.parse_args()

    # Resolve date — local timezone, not UTC
    if args.date:
        try:
            datetime.strptime(args.date, "%Y-%m-%d")
            date_str = args.date
        except ValueError:
            print(f"[ERROR] Invalid date format: {args.date}. Use YYYY-MM-DD.")
            sys.exit(1)
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    domain = args.domain

    # --- Step 1: Load scheduled keywords ---
    supabase = get_supabase_client()
    client_id = lookup_client_id(supabase, domain)
    keywords = load_scheduled_keywords(supabase, client_id, date_str)

    if not keywords:
        print(f"No keywords scheduled for {domain} on {date_str}")
        sys.exit(0)

    # Display what will be run
    print(f"\nFound {len(keywords)} keywords scheduled for {domain} on {date_str}:")
    for i, entry in enumerate(keywords, 1):
        intent = entry.get("search_intent", "")
        intent_display = f" ({intent})" if intent else ""
        print(f"  {i}. {entry['keyword']}{intent_display}")
    print()

    if args.dry_run:
        print("--dry-run flag set. Exiting without running.")
        sys.exit(0)

    # Confirmation prompt
    confirm = input(f"Run all {len(keywords)}? (y/n): ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        sys.exit(0)

    print()

    # --- Steps 2-5: Execute batch ---
    run_batch(domain, date_str, keywords)


if __name__ == "__main__":
    main()
