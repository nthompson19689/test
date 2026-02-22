"""
Content pipeline runner.

Usage:
  python run_pipeline.py --domain <domain> --keyword <keyword>
  python run_pipeline.py --domain <domain> --date <YYYY-MM-DD> --batch

All output goes to stdout so the FastAPI SSE wrapper can stream it to the UI.
After the writer step completes, the article ID is resolved by querying
Supabase directly (not by parsing subprocess output).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

SCRIPTS_DIR = Path(__file__).resolve().parent


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def run_step(label: str, cmd: list[str]) -> int:
    """Run a subprocess, streaming its stdout line-by-line. Return exit code."""
    print(f"[{label}] Starting...")
    sys.stdout.flush()

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{label}] {line}", end="")
        sys.stdout.flush()

    process.wait()

    if process.returncode == 0:
        print(f"[{label}] Done.")
    else:
        print(f"[{label}] Failed (exit code {process.returncode}).")
    sys.stdout.flush()
    return process.returncode


def get_latest_draft_id(domain: str) -> str | None:
    """
    Query Supabase for the most recent content_output row for this domain
    with status='draft', ordered by created_at DESC.

    Returns the article ID or None.
    """
    sb = get_supabase()
    resp = (
        sb.table("content_output")
        .select("id")
        .eq("domain", domain)
        .eq("status", "draft")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["id"]
    return None


# ---------------------------------------------------------------------------
# Pipeline: single keyword
# ---------------------------------------------------------------------------


def run_single(domain: str, keyword: str) -> None:
    print(f"Pipeline starting for domain={domain}, keyword={keyword}")
    sys.stdout.flush()

    # Step 1 — Research
    research_script = SCRIPTS_DIR / "research.py"
    if research_script.exists():
        rc = run_step("Research", [sys.executable, str(research_script), "--domain", domain, "--keyword", keyword])
        if rc != 0:
            print("Pipeline aborted at Research step.")
            sys.exit(1)
    else:
        print("[Research] Script not found, skipping.")
        sys.stdout.flush()

    # Step 2 — Outline
    outline_script = SCRIPTS_DIR / "outline.py"
    if outline_script.exists():
        rc = run_step("Outline", [sys.executable, str(outline_script), "--domain", domain, "--keyword", keyword])
        if rc != 0:
            print("Pipeline aborted at Outline step.")
            sys.exit(1)
    else:
        print("[Outline] Script not found, skipping.")
        sys.stdout.flush()

    # Step 3 — Writer
    writer_script = SCRIPTS_DIR / "writer.py"
    if writer_script.exists():
        rc = run_step("Writer", [sys.executable, str(writer_script), "--domain", domain, "--keyword", keyword])
        if rc != 0:
            print("Pipeline aborted at Writer step.")
            sys.exit(1)
    else:
        print("[Writer] Script not found, skipping.")
        sys.stdout.flush()

    # Step 4 — Resolve article ID from Supabase (not from terminal output)
    print("[Resolve] Querying Supabase for latest draft article...")
    sys.stdout.flush()

    article_id = get_latest_draft_id(domain)
    if article_id:
        print(f"[Resolve] Found article ID: {article_id}")
    else:
        print("[Resolve] No draft article found for this domain.")
    sys.stdout.flush()

    # Step 5 — Editor / post-processing
    editor_script = SCRIPTS_DIR / "editor.py"
    if editor_script.exists() and article_id:
        rc = run_step("Editor", [sys.executable, str(editor_script), "--domain", domain, "--article-id", article_id])
        if rc != 0:
            print("Pipeline completed with Editor errors.")
            sys.exit(1)
    elif not article_id:
        print("[Editor] Skipped — no article ID resolved.")
        sys.stdout.flush()
    else:
        print("[Editor] Script not found, skipping.")
        sys.stdout.flush()

    print("Pipeline complete.")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Pipeline: batch (all keywords for a date)
# ---------------------------------------------------------------------------


def run_batch(domain: str, date_str: str) -> None:
    print(f"Batch pipeline starting for domain={domain}, date={date_str}")
    sys.stdout.flush()

    sb = get_supabase()
    resp = (
        sb.table("content_schedule")
        .select("keyword")
        .eq("domain", domain)
        .eq("scheduled_for", date_str)
        .eq("status", "pending")
        .execute()
    )

    keywords = [row["keyword"] for row in resp.data]
    if not keywords:
        print("No pending keywords found for this date.")
        sys.stdout.flush()
        return

    print(f"Found {len(keywords)} keyword(s) to process.")
    sys.stdout.flush()

    for i, kw in enumerate(keywords, 1):
        print(f"\n--- [{i}/{len(keywords)}] {kw} ---")
        sys.stdout.flush()
        run_single(domain, kw)

    print(f"\nBatch complete. Processed {len(keywords)} keyword(s).")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Content pipeline runner")
    parser.add_argument("--domain", required=True)
    parser.add_argument("--keyword", default=None)
    parser.add_argument("--date", default=None)
    parser.add_argument("--batch", action="store_true")
    args = parser.parse_args()

    if args.batch:
        if not args.date:
            print("ERROR: --date is required for batch mode.")
            sys.exit(1)
        run_batch(args.domain, args.date)
    else:
        if not args.keyword:
            print("ERROR: --keyword is required for single mode.")
            sys.exit(1)
        run_single(args.domain, args.keyword)
