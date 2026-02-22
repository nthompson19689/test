"""
Content Engine API — FastAPI backend wrapping Python pipeline scripts.

Endpoints:
  GET  /clients         — list all clients from Supabase
  POST /run-pipeline    — stream pipeline execution via SSE
  POST /upload-keywords — upload CSV, return column headers
  POST /load-keywords   — load keywords into Supabase (non-interactive)
  GET  /articles        — query articles with optional filters
  GET  /schedule        — query content schedule
  POST /batch-run       — stream batch execution via SSE

Run:
  pip3 install fastapi uvicorn python-multipart supabase python-dotenv
  uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import csv
import io
import os
import sys
from datetime import date
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client, create_client

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(
        "WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. "
        "Database endpoints will fail."
    )

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Content Engine API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Supabase client (lazy init so the app can still start without creds)
# ---------------------------------------------------------------------------

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(
                status_code=500,
                detail="Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env",
            )
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RunPipelineRequest(BaseModel):
    domain: str
    keyword: str


class LoadKeywordsRequest(BaseModel):
    domain: str
    keyword_column: str
    date_column: str
    fallback_date: str = ""


class BatchRunRequest(BaseModel):
    domain: str
    date: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _stream_subprocess(cmd: list[str]):
    """Run *cmd* and yield each stdout/stderr line as an SSE event."""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    assert process.stdout is not None
    try:
        async for raw_line in process.stdout:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
            yield f"data: {line}\n\n"
    except Exception as exc:
        yield f"data: ERROR: {exc}\n\n"

    await process.wait()
    if process.returncode == 0:
        yield "data: DONE\n\n"
    else:
        yield f"data: FAILED (exit code {process.returncode})\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/clients")
def list_clients():
    """Return all rows from the *clients* table."""
    sb = get_supabase()
    resp = sb.table("clients").select("id, name, domain").execute()
    return resp.data


@app.post("/run-pipeline")
async def run_pipeline(body: RunPipelineRequest):
    """Stream the output of ``scripts/run_pipeline.py`` via SSE."""
    script = SCRIPTS_DIR / "run_pipeline.py"
    if not script.exists():
        raise HTTPException(status_code=404, detail=f"Script not found: {script}")

    cmd = [
        sys.executable,
        str(script),
        "--domain",
        body.domain,
        "--keyword",
        body.keyword,
    ]
    return StreamingResponse(
        _stream_subprocess(cmd),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/upload-keywords")
async def upload_keywords(file: UploadFile = File(...)):
    """Accept a CSV upload, persist it to /tmp, and return the column headers."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    contents = await file.read()
    dest = Path("/tmp/uploaded_keywords.csv")
    dest.write_bytes(contents)

    # Parse headers
    text = contents.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        headers = next(reader)
    except StopIteration:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    # Read up to 5 preview rows
    preview_rows: list[list[str]] = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        preview_rows.append(row)

    return {"columns": headers, "preview": preview_rows}


@app.post("/load-keywords")
async def load_keywords(body: LoadKeywordsRequest):
    """
    Run ``scripts/load_keywords.py`` with all decisions passed as CLI args
    so no interactive prompts are needed.
    """
    script = SCRIPTS_DIR / "load_keywords.py"
    if not script.exists():
        raise HTTPException(status_code=404, detail=f"Script not found: {script}")

    cmd = [
        sys.executable,
        str(script),
        "--domain",
        body.domain,
        "--file",
        "/tmp/uploaded_keywords.csv",
        "--keyword-column",
        body.keyword_column,
        "--date-column",
        body.date_column,
    ]
    if body.fallback_date:
        cmd += ["--fallback-date", body.fallback_date]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout_bytes, _ = await process.communicate()
    output = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""

    success = process.returncode == 0
    return {
        "success": success,
        "output": output,
        "exit_code": process.returncode,
    }


@app.get("/articles")
def list_articles(
    domain: str,
    status: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
):
    """Return articles from content_edits joined with content_output."""
    sb = get_supabase()

    query = sb.table("content_edits").select(
        "id, keyword, status, word_count, clean_version, created_at, content_output(*)"
    ).eq("domain", domain)

    if status:
        query = query.eq("status", status)
    if date:
        query = query.gte("created_at", date)

    resp = query.order("created_at", desc=True).execute()

    # Truncate clean_version for the list view
    articles = []
    for row in resp.data:
        article = {
            "id": row.get("id"),
            "keyword": row.get("keyword"),
            "status": row.get("status"),
            "word_count": row.get("word_count"),
            "clean_version": row.get("clean_version", ""),
            "clean_version_preview": (row.get("clean_version") or "")[:200],
            "created_at": row.get("created_at"),
        }
        articles.append(article)

    return articles


@app.get("/schedule")
def get_schedule(
    domain: str,
    date: Optional[str] = Query(None),
):
    """Return content_schedule rows."""
    sb = get_supabase()

    query = sb.table("content_schedule").select(
        "keyword, scheduled_for, status, intent"
    ).eq("domain", domain)

    if date:
        query = query.eq("scheduled_for", date)

    resp = query.order("scheduled_for", desc=False).execute()
    return resp.data


@app.post("/batch-run")
async def batch_run(body: BatchRunRequest):
    """Stream the output of ``scripts/run_pipeline.py --batch`` via SSE."""
    script = SCRIPTS_DIR / "run_pipeline.py"
    if not script.exists():
        raise HTTPException(status_code=404, detail=f"Script not found: {script}")

    cmd = [
        sys.executable,
        str(script),
        "--domain",
        body.domain,
        "--date",
        body.date,
        "--batch",
    ]
    return StreamingResponse(
        _stream_subprocess(cmd),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
