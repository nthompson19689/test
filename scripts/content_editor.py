#!/usr/bin/env python3
"""
Content Editor Agent
Reads drafted articles from content_output, runs a 3-call editorial review
against brand guidelines, and saves annotated + clean versions to content_edits.
"""

import argparse
import os
import re
import sys
from datetime import datetime, timezone

import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

EDITOR_SYSTEM_PROMPT = (
    "You are a senior editor for this brand. You have encyclopedic knowledge of "
    "the brand guidelines provided. Your job is to identify every violation of "
    "brand guidelines, voice, tone, and editorial rules. Be specific and ruthless. "
    "Reference the exact guideline being violated for each issue."
)


def check_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        print(f"[ERROR] Missing environment variables: {', '.join(missing)}")
        sys.exit(1)


def resolve_client_id(supabase, domain: str) -> str:
    result = supabase.table("clients").select("id").eq("domain", domain).execute()
    if not result.data:
        print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return result.data[0]["id"]


def load_draft(supabase, client_id: str, article_id: str | None):
    if article_id:
        result = (
            supabase.table("content_output")
            .select("*")
            .eq("id", article_id)
            .execute()
        )
        if not result.data:
            print(f"[ERROR] No article found with id: {article_id}")
            sys.exit(1)
        row = result.data[0]
        if row.get("client_id") != client_id:
            print(
                f"[ERROR] Article {article_id} belongs to a different client "
                f"(expected {client_id}, got {row.get('client_id')})"
            )
            sys.exit(1)
        return row

    result = (
        supabase.table("content_output")
        .select("*")
        .eq("client_id", client_id)
        .eq("status", "draft")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        print("[ERROR] No draft articles found for this client.")
        sys.exit(1)
    return result.data[0]


def load_brand_guidelines(supabase, client_id: str) -> list[dict]:
    result = (
        supabase.table("brand_guidelines")
        .select("*")
        .eq("client_id", client_id)
        .execute()
    )
    return result.data or []


def format_guidelines(guidelines: list[dict]) -> str:
    if not guidelines:
        return "No brand guidelines found."

    sections: dict[str, list[str]] = {}
    for g in guidelines:
        guideline_type = g.get("type", "general")
        content = g.get("content", "")
        sections.setdefault(guideline_type, []).append(content)

    parts = []
    for guideline_type, entries in sections.items():
        parts.append(f"=== {guideline_type.upper()} ===")
        for entry in entries:
            parts.append(entry)
        parts.append("")

    return "\n".join(parts)


def count_severity(violation_text: str) -> dict[str, int]:
    high = len(re.findall(r"SEVERITY:\s*High", violation_text, re.IGNORECASE))
    medium = len(re.findall(r"SEVERITY:\s*Medium", violation_text, re.IGNORECASE))
    low = len(re.findall(r"SEVERITY:\s*Low", violation_text, re.IGNORECASE))
    return {"high": high, "medium": medium, "low": low}


def extract_editorial_summary(text: str) -> str:
    match = re.search(r"EDITORIAL SUMMARY:\s*(.+)", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def step2_violation_review(
    client: anthropic.Anthropic,
    article_body: str,
    guidelines_text: str,
) -> tuple[str, int, str]:
    """Three-pass violation review. Returns (full_response, violation_count, edit_summary)."""

    system = f"{EDITOR_SYSTEM_PROMPT}\n\n--- BRAND GUIDELINES ---\n{guidelines_text}"

    user_prompt = (
        "Review this article against ALL brand guidelines. "
        "Identify every violation across three categories:\n\n"
        "1. Brand guideline violations (mission, values, what we are/are not)\n"
        "2. Voice and tone violations (wrong register, too corporate, too casual, "
        "explains the joke, punches down, uses banned words/phrases)\n"
        "3. Editorial guideline violations (not actionable, too theoretical, "
        "no useful follow-up to uncomfortable truth, banned phrases used)\n\n"
        "For each violation output in exactly this format:\n"
        "LOCATION: [exact quote from article]\n"
        "RULE: [specific guideline violated]\n"
        "SEVERITY: High / Medium / Low\n"
        "FIX: [exact replacement text]\n\n"
        "End with EDITORIAL SUMMARY: [2-3 sentence summary of main issues found overall]\n\n"
        f"--- ARTICLE ---\n{article_body}"
    )

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = response.content[0].text
    violation_count = text.count("LOCATION:")
    edit_summary = extract_editorial_summary(text)

    return text, violation_count, edit_summary


def step3_annotate(
    client: anthropic.Anthropic,
    article_body: str,
    violation_text: str,
    guidelines_text: str,
) -> str:
    """Annotate article and run second pass. Returns full annotated output."""

    system = f"{EDITOR_SYSTEM_PROMPT}\n\n--- BRAND GUIDELINES ---\n{guidelines_text}"

    user_prompt = (
        "Here is the original article and the violation list from the first review pass.\n"
        "Do exactly two things in order:\n\n"
        "PART 1 — ANNOTATED VERSION:\n"
        "Reproduce the full article with every violation marked inline exactly like this:\n"
        "[EDIT (High/Medium/Low): 'original text' → 'suggested replacement' | Rule: exact guideline name]\n"
        "Do not change anything that wasn't flagged. Preserve all markdown formatting, "
        "links, META line, and SLUG line.\n\n"
        "PART 2 — SECOND PASS CATCHES:\n"
        "After the annotated article, add a section titled '## SECOND PASS CATCHES:' "
        "and list any additional violations the first pass missed, using the same "
        "LOCATION/RULE/SEVERITY/FIX format.\n\n"
        f"--- ORIGINAL ARTICLE ---\n{article_body}\n\n"
        f"--- VIOLATION LIST FROM FIRST PASS ---\n{violation_text}"
    )

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=8000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )

    return response.content[0].text


def step4_clean_version(
    client: anthropic.Anthropic,
    annotated_text: str,
    guidelines_text: str,
) -> str:
    """Generate clean final version from annotated text."""

    system = f"{EDITOR_SYSTEM_PROMPT}\n\n--- BRAND GUIDELINES ---\n{guidelines_text}"

    user_prompt = (
        "Here is the annotated version of the article including second pass catches. "
        "Produce a clean final version that:\n\n"
        "1. Implements ALL suggested edits from EVERY annotation including second pass catches\n"
        "2. Removes all annotation markup completely\n"
        "3. Maintains the exact same structure, headings, links, and approximate length as the original\n"
        "4. Does NOT rewrite or change sections that were not flagged\n"
        "5. Preserves META and SLUG lines at the top exactly as they appear\n\n"
        "Output only the clean article. No commentary, no preamble.\n\n"
        f"--- ANNOTATED ARTICLE ---\n{annotated_text}"
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )

    return response.content[0].text


def main():
    parser = argparse.ArgumentParser(description="Content Editor Agent")
    parser.add_argument(
        "--domain", required=True, help="Client domain (looks up client_id)"
    )
    parser.add_argument(
        "--article-id",
        default=None,
        help="Specific content_output UUID (optional, defaults to most recent draft)",
    )
    args = parser.parse_args()

    check_env()

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    ai = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # ── Step 1: Load draft and Brand Brain ──────────────────────────────
    print(f"\n[1/5] Loading draft and Brand Brain for {args.domain}...")
    client_id = resolve_client_id(supabase, args.domain)
    draft = load_draft(supabase, client_id, args.article_id)
    guidelines = load_brand_guidelines(supabase, client_id)

    article_body = draft.get("body", "")
    original_word_count = len(article_body.split())
    title = draft.get("title", "(untitled)")

    print(f"  Article: {title}")
    print(f"  Original word count: {original_word_count}")

    guideline_types = set(g.get("type", "general") for g in guidelines)
    print(f"  Brand guidelines loaded: {len(guideline_types)} types")

    guidelines_text = format_guidelines(guidelines)

    # ── Step 2: Violation review ────────────────────────────────────────
    print("\n[2/5] Running violation review (Opus)...")
    try:
        violation_text, violation_count, edit_summary = step2_violation_review(
            ai, article_body, guidelines_text
        )
    except Exception as e:
        print(f"  [ERROR] Step 2 failed: {e}")
        print("  Cannot proceed without violation review. Exiting.")
        sys.exit(1)

    severity = count_severity(violation_text)
    print(
        f"  Found {violation_count} violations "
        f"({severity['high']} high, {severity['medium']} medium, {severity['low']} low)"
    )

    # ── Step 3: Annotate and second pass ────────────────────────────────
    print("\n[3/5] Annotating and running second pass (Opus)...")
    annotated_version = None
    step3_failed = False
    try:
        annotated_version = step3_annotate(
            ai, article_body, violation_text, guidelines_text
        )
    except Exception as e:
        print(f"  [ERROR] Step 3 failed: {e}")
        print("  Will attempt Step 4 with original article + violation list.")
        step3_failed = True

    # ── Step 4: Clean final version ─────────────────────────────────────
    print("\n[4/5] Generating clean final version (Sonnet)...")
    clean_version = None
    try:
        if annotated_version:
            clean_version = step4_clean_version(ai, annotated_version, guidelines_text)
        elif step3_failed:
            # Fallback: feed violation list + original directly
            fallback_input = (
                f"--- ORIGINAL ARTICLE ---\n{article_body}\n\n"
                f"--- VIOLATIONS ---\n{violation_text}"
            )
            clean_version = step4_clean_version(ai, fallback_input, guidelines_text)
    except Exception as e:
        print(f"  [ERROR] Step 4 failed: {e}")
        print("  Will save annotated version only.")

    clean_word_count = 0
    if clean_version:
        clean_word_count = len(clean_version.split())
        print(f"  Clean word count: {clean_word_count}")

        if original_word_count > 0:
            ratio = clean_word_count / original_word_count
            if ratio < 0.9:
                pct = round(ratio * 100)
                print(
                    f"  [WARNING] Clean version is {pct}% of original length. "
                    "Review before approving."
                )

    # ── Step 5: Save to Supabase ────────────────────────────────────────
    print("\n[5/5] Saving to Supabase...")
    try:
        status = "pending"
        insert_data = {
            "content_output_id": draft["id"],
            "client_id": client_id,
            "annotated_version": annotated_version or "",
            "clean_version": clean_version or "",
            "edit_summary": edit_summary,
            "violations_found": violation_count,
            "clean_word_count": clean_word_count,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        result = supabase.table("content_edits").insert(insert_data).execute()
        edit_record_id = result.data[0]["id"] if result.data else "unknown"

        # Update content_output status to 'reviewed'
        supabase.table("content_output").update({"status": "reviewed"}).eq(
            "id", draft["id"]
        ).execute()

        print("\nDone! Edit complete.")
        print(f"  Violations found: {violation_count}")
        print(f"  Original word count: {original_word_count}")
        print(f"  Clean word count: {clean_word_count}")
        print(f"  Article status: reviewed")
        print(f"  Edit record ID: {edit_record_id}")

    except Exception as e:
        print(f"  [ERROR] Step 5 failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
