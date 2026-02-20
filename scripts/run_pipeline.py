#!/usr/bin/env python3
"""
Content Pipeline Orchestrator
Chains content_writer.py → content_editor.py with logging and error handling.
"""

import argparse
import os
import re
import subprocess
import sys
import time
from datetime import datetime

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPTS_DIR)
PIPELINE_LOG = os.path.join(PROJECT_ROOT, "pipeline.log")


def log_to_file(domain, keyword, status, article_id=None, error=None):
    """Append a one-line summary to pipeline.log."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    parts = [ts, domain, f'"{keyword}"', status]
    if article_id:
        parts.append(f"article_id: {article_id}")
    if error:
        parts.append(f"error: {error}")
    line = " | ".join(parts)
    with open(PIPELINE_LOG, "a") as f:
        f.write(line + "\n")


def run_script(script_name, args):
    """Run a Python script via subprocess, streaming output in real time.

    Returns (return_code, captured_output).
    """
    script_path = os.path.join(SCRIPTS_DIR, script_name)
    cmd = [sys.executable, script_path] + args

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    captured = []
    for line in process.stdout:
        print(line, end="", flush=True)
        captured.append(line)

    process.wait()
    return process.returncode, "".join(captured)


def extract_article_id(output):
    """Extract article UUID from writer output.

    Looks for a line containing 'Article saved' with a UUID pattern.
    """
    for line in output.splitlines():
        if "Article saved" in line:
            match = re.search(
                r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                line,
                re.IGNORECASE,
            )
            if match:
                return match.group(0)
    return None


def main():
    parser = argparse.ArgumentParser(description="Content Pipeline Orchestrator")
    parser.add_argument("--domain", required=True, help="Target domain")
    parser.add_argument("--keyword", required=True, help="Target keyword (use quotes for multi-word)")
    args = parser.parse_args()

    start_time = time.time()
    started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Banner
    print("=" * 48)
    print(f"Content Pipeline — {args.domain}")
    print(f"Started: {started_at}")
    print("=" * 48)
    print(f'Keyword: "{args.keyword}"')
    print()

    # --- Step 1: Writer ---
    print("[1/2] Running content writer...")
    writer_code, writer_output = run_script(
        "content_writer.py", ["--domain", args.domain, "--keyword", args.keyword]
    )

    if writer_code != 0:
        error_msg = f"content_writer.py exited with code {writer_code}"
        print(f"\n[ERROR] {error_msg}")
        log_to_file(args.domain, args.keyword, f"FAILED at writer", error=error_msg)
        sys.exit(1)

    print()

    # --- Extract article ID ---
    article_id = extract_article_id(writer_output)
    if article_id:
        print(f"Captured article ID: {article_id}")
    else:
        print("Warning: could not extract article ID from writer output.")
    print()

    # --- Step 2: Editor ---
    print("[2/2] Running content editor...")
    editor_args = ["--domain", args.domain]
    if article_id:
        editor_args += ["--article-id", article_id]

    editor_code, _ = run_script("content_editor.py", editor_args)

    if editor_code != 0:
        error_msg = f"content_editor.py exited with code {editor_code}"
        print(f"\n[ERROR] {error_msg}")
        print("Note: draft was saved to content_output.")
        log_to_file(
            args.domain,
            args.keyword,
            "FAILED at editor",
            article_id=article_id,
            error=error_msg,
        )
        sys.exit(1)

    # --- Success ---
    duration = int(time.time() - start_time)
    log_to_file(args.domain, args.keyword, "SUCCESS", article_id=article_id)

    print()
    print("=" * 48)
    print("Pipeline complete!")
    print(f'Keyword: "{args.keyword}"')
    print(f"Duration: {duration}s")
    print("Article written, edited, and saved.")
    print("Check content_edits table for final version.")
    print("=" * 48)


if __name__ == "__main__":
    main()
