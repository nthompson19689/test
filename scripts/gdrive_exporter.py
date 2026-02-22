#!/usr/bin/env python3
"""
Google Drive exporter for the AI Content Marketing Engine.

Exports completed articles from the Supabase content_edits table
as formatted Google Docs in a per-client folder.

Usage:
    python3 scripts/gdrive_exporter.py --domain sequel.com --date 2026-03-01
    python3 scripts/gdrive_exporter.py --domain sequel.com
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GDRIVE_SERVICE_ACCOUNT_JSON = os.getenv("GDRIVE_SERVICE_ACCOUNT_JSON")
GDRIVE_FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID")

LOG_FILE = "pipeline.log"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]


def log_to_file(domain, keyword, status, detail=""):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{timestamp} | {domain} | {keyword} | {status}"
    if detail:
        line += f" | {detail}"
    line += "\n"
    with open(LOG_FILE, "a") as f:
        f.write(line)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def lookup_client_id(supabase, domain):
    result = supabase.table("clients").select("id").eq("domain", domain).execute()
    if not result.data:
        print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return result.data[0]["id"]


def load_exportable_articles(supabase, client_id, date_str):
    """Load content_edits rows (status=pending) joined with content_output for the given date."""
    result = (
        supabase.table("content_edits")
        .select("id, clean_version, content_output_id, content_output(keyword, created_at)")
        .eq("content_output.client_id", client_id)
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        return []

    # Filter by date on the client side (Supabase date filtering on joined
    # tables with ::date cast is unreliable via supabase-py).
    articles = []
    for row in result.data:
        co = row.get("content_output")
        if not co:
            continue
        created = co.get("created_at", "")
        if created.startswith(date_str):
            articles.append(row)
    return articles


# ---------------------------------------------------------------------------
# Google Drive helpers
# ---------------------------------------------------------------------------

def get_google_credentials():
    if not GDRIVE_SERVICE_ACCOUNT_JSON:
        print("[ERROR] GDRIVE_SERVICE_ACCOUNT_JSON must be set in .env")
        sys.exit(1)

    if not os.path.isfile(GDRIVE_SERVICE_ACCOUNT_JSON):
        print(f"[ERROR] Service account file not found: {GDRIVE_SERVICE_ACCOUNT_JSON}")
        sys.exit(1)

    try:
        creds = service_account.Credentials.from_service_account_file(
            GDRIVE_SERVICE_ACCOUNT_JSON, scopes=DRIVE_SCOPES
        )
        return creds
    except Exception as exc:
        print(f"[ERROR] Google Drive authentication failed: {exc}")
        sys.exit(1)



def doc_name_exists(service, name, folder_id):
    """Check if a Google Doc with the given name already exists in the folder."""
    query = (
        f"name = '{name}' and '{folder_id}' in parents "
        f"and mimeType = 'application/vnd.google-apps.document' and trashed = false"
    )
    results = service.files().list(q=query, spaces="drive", fields="files(id)").execute()
    return len(results.get("files", [])) > 0


# ---------------------------------------------------------------------------
# Markdown → Google Docs conversion
# ---------------------------------------------------------------------------

def markdown_to_doc_requests(markdown_text):
    """Convert markdown text to a list of Google Docs API batchUpdate requests.

    Inserts the full plain text first, then applies formatting in reverse
    offset order so earlier mutations don't shift later offsets.
    """
    lines = markdown_text.split("\n")
    # Build a plain-text document and collect formatting ranges
    plain_parts = []
    formats = []  # (start, end, fmt_type, extra)
    offset = 1  # Docs body starts at index 1

    for line in lines:
        stripped = line.rstrip()

        # Headings
        heading_match = re.match(r"^(#{1,3})\s+(.*)", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2)
            plain_parts.append(text + "\n")
            formats.append((offset, offset + len(text) + 1, "heading", level))
            offset += len(text) + 1
            continue

        # Regular line — process inline markdown
        processed, inline_formats = process_inline_markdown(stripped, offset)
        plain_parts.append(processed + "\n")
        formats.extend(inline_formats)
        offset += len(processed) + 1

    plain_text = "".join(plain_parts)

    # Build requests: first insert all text
    requests = []
    if plain_text:
        requests.append({
            "insertText": {
                "location": {"index": 1},
                "text": plain_text,
            }
        })

    # Apply formatting in reverse order so offsets stay valid
    for start, end, fmt_type, extra in reversed(formats):
        if fmt_type == "heading":
            heading_map = {1: "HEADING_1", 2: "HEADING_2", 3: "HEADING_3"}
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "paragraphStyle": {"namedStyleType": heading_map.get(extra, "HEADING_1")},
                    "fields": "namedStyleType",
                }
            })
        elif fmt_type == "bold":
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": {"bold": True},
                    "fields": "bold",
                }
            })
        elif fmt_type == "italic":
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": {"italic": True},
                    "fields": "italic",
                }
            })
        elif fmt_type == "link":
            url = extra
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "textStyle": {"link": {"url": url}},
                    "fields": "link",
                }
            })

    return requests


def process_inline_markdown(text, base_offset):
    """Strip inline markdown (bold, italic, links) and return plain text + format ranges."""
    formats = []
    result = ""
    i = 0

    while i < len(text):
        # Links: [text](url)
        link_match = re.match(r"\[([^\]]+)\]\(([^)]+)\)", text[i:])
        if link_match:
            link_text = link_match.group(1)
            link_url = link_match.group(2)
            start = base_offset + len(result)
            result += link_text
            end = base_offset + len(result)
            formats.append((start, end, "link", link_url))
            i += link_match.end()
            continue

        # Bold: **text** or __text__
        bold_match = re.match(r"\*\*(.+?)\*\*|__(.+?)__", text[i:])
        if bold_match:
            bold_text = bold_match.group(1) or bold_match.group(2)
            start = base_offset + len(result)
            result += bold_text
            end = base_offset + len(result)
            formats.append((start, end, "bold", None))
            i += bold_match.end()
            continue

        # Italic: *text* or _text_ (but not inside bold)
        italic_match = re.match(r"\*(.+?)\*|_(.+?)_", text[i:])
        if italic_match:
            italic_text = italic_match.group(1) or italic_match.group(2)
            start = base_offset + len(result)
            result += italic_text
            end = base_offset + len(result)
            formats.append((start, end, "italic", None))
            i += italic_match.end()
            continue

        result += text[i]
        i += 1

    return result, formats


def create_google_doc(drive_service, docs_service, name, markdown_content, folder_id):
    """Create a Google Doc via the Docs API, then move it into the target folder.

    Two-step process so the doc is created in the authenticated user's Drive
    storage (not the service account's) and then placed in the shared folder.
    """
    # Step 1: Create empty doc via Docs API
    doc = docs_service.documents().create(body={"title": name}).execute()
    doc_id = doc["documentId"]

    # Step 2: Move doc into the target folder via Drive API
    # Retrieve current parents so we can remove them in the same call
    file = drive_service.files().get(fileId=doc_id, fields="parents").execute()
    previous_parents = ",".join(file.get("parents", []))
    drive_service.files().update(
        fileId=doc_id,
        addParents=folder_id,
        removeParents=previous_parents,
        fields="id",
    ).execute()

    # Step 3: Insert formatted content
    requests = markdown_to_doc_requests(markdown_content)
    if requests:
        docs_service.documents().batchUpdate(
            documentId=doc_id, body={"requests": requests}
        ).execute()

    doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
    return doc_id, doc_url


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Export completed articles to Google Drive as formatted Google Docs."
    )
    parser.add_argument("--domain", required=True, help="Client domain (e.g. sequel.com)")
    parser.add_argument(
        "--date",
        default=None,
        help="Date in YYYY-MM-DD format. Defaults to today (local timezone).",
    )
    args = parser.parse_args()

    # Resolve date — local timezone
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

    # --- Step 1: Load articles ---
    supabase = get_supabase_client()
    client_id = lookup_client_id(supabase, domain)
    articles = load_exportable_articles(supabase, client_id, date_str)

    if not articles:
        print(f"No exportable articles found for {domain} on {date_str}")
        sys.exit(0)

    total = len(articles)
    print(f"\nExporting {total} articles to Google Drive for {domain}...\n")

    # --- Step 2: Authenticate with Google Drive ---
    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    docs_service = build("docs", "v1", credentials=creds)

    # --- Step 3: Use configured parent folder ---
    if not GDRIVE_FOLDER_ID:
        print("[ERROR] GDRIVE_FOLDER_ID must be set in .env")
        sys.exit(1)
    folder_id = GDRIVE_FOLDER_ID
    folder_url = f"https://drive.google.com/drive/folders/{folder_id}"

    # --- Step 4: Export each article ---
    exported = 0
    failed = 0
    failed_keywords = []

    for idx, article in enumerate(articles, 1):
        co = article.get("content_output", {})
        keyword = co.get("keyword", "Untitled")
        clean_version = article.get("clean_version", "")
        edit_id = article["id"]

        print(f"  [{idx}/{total}] {keyword} — Creating doc...", end=" ", flush=True)

        try:
            # Determine doc name (deduplicate if exists)
            doc_name = keyword
            if doc_name_exists(drive_service, doc_name, folder_id):
                doc_name = f"{keyword} ({date_str})"

            doc_id, doc_url = create_google_doc(
                drive_service, docs_service, doc_name, clean_version, folder_id
            )

            # Update content_edits status to 'exported'
            supabase.table("content_edits").update({"status": "exported"}).eq("id", edit_id).execute()

            log_to_file(domain, keyword, "EXPORTED", f"doc_id: {doc_id}")
            print("\u2713")
            exported += 1

        except Exception as exc:
            log_to_file(domain, keyword, "EXPORT_FAILED", f"error: {exc}")
            print(f"\u2717 Failed (see {LOG_FILE})")
            failed += 1
            failed_keywords.append(keyword)

    # --- Step 5: Final summary ---
    print(f"\nExport complete!")
    print(f"  Exported: {exported}/{total}")
    if failed:
        print(f"  Failed: {failed}/{total} ({', '.join(failed_keywords)})")
    else:
        print(f"  Failed: 0/{total}")
    if folder_url:
        print(f"  Folder: {folder_url}")
    else:
        print(f"  Folder ID: {folder_id}")


if __name__ == "__main__":
    main()
