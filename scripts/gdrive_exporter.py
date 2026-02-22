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
import io
import os
import sys
from datetime import datetime

import markdown2
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
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
# Google Doc creation via Drive Files API
# ---------------------------------------------------------------------------

def create_google_doc(drive_service, name, markdown_content, folder_id):
    """Create a Google Doc by uploading HTML via the Drive Files API.

    Converts markdown to HTML, then uploads with mimeType
    'application/vnd.google-apps.document' so Drive auto-converts the
    HTML into a native Google Doc with formatting preserved.
    """
    html_content = markdown2.markdown(markdown_content)

    file_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.document",
        "parents": [folder_id],
    }
    media = MediaIoBaseUpload(
        io.BytesIO(html_content.encode("utf-8")),
        mimetype="text/html",
    )
    doc_file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, webViewLink",
    ).execute()

    doc_id = doc_file["id"]
    doc_url = doc_file.get("webViewLink", "")
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
                drive_service, doc_name, clean_version, folder_id
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
