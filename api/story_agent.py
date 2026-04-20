"""
Story Agent — generates gene stories using the Anthropic Claude API.

This module implements the Four-Layer Caching Guarantee:

  Layer 1 — Cache-first check (outside lock)
    Before doing anything, we check if a verified story already exists.
    This is the fast path: 99% of requests hit this and return instantly.

  Layer 2 — Per-gene lock + re-check (prevents duplicate API calls)
    If no cache hit, we acquire a lock specific to this gene_id.
    While we waited for the lock, another request may have already generated
    the story — so we check the cache again before calling the API.

  Layer 3 — Atomic write (no partial stories ever stored)
    We only write to the database AFTER the full story has been streamed
    and assembled. A partial story (e.g. from a dropped connection) is
    never saved.

  Layer 4 — Read-back verification (confirms the write succeeded)
    After saving, we immediately read the story back from the DB and
    compare it to what we wrote. Only then do we mark it as verified=TRUE.
    If the content doesn't match, we raise an error so the caller knows.
"""

import asyncio
import logging
import os
import time
from typing import AsyncGenerator

import anthropic

log = logging.getLogger(__name__)

# ── Per-gene locks (Layer 2) ──────────────────────────────────────────────────
# Each gene gets its own asyncio.Lock so only one coroutine at a time can
# generate a story for that gene. Other genes are unaffected.
_gene_locks: dict[str, asyncio.Lock] = {}
_lock_registry = asyncio.Lock()  # protects the _gene_locks dict itself


async def _get_gene_lock(gene_id: str) -> asyncio.Lock:
    """Return (or create) the asyncio.Lock for a specific gene."""
    async with _lock_registry:
        if gene_id not in _gene_locks:
            _gene_locks[gene_id] = asyncio.Lock()
        return _gene_locks[gene_id]


# ── Story prompt ──────────────────────────────────────────────────────────────
STORY_PROMPT = """\
You are writing a chapter for "Gene Story" — a book that tells the story of \
every gene in the human genome, written for educated readers including scientists, \
students, and curious minds.

Gene Information:
  Name:        {gene_name}
  Ensembl ID:  {gene_id}
  Type:        {gene_type}
  Chromosome:  {chromosome}  |  Position: {start:,} – {end:,}  ({strand} strand)
  Length:      {gene_length:,} base pairs
  Exons:       {exon_count}
  Transcripts: {transcript_count}

Write a captivating, book-like story about this gene. Guidelines:
- For well-studied protein-coding genes: write 3–4 rich paragraphs.
- For less-studied or non-coding genes or pseudogenes: write 1–2 focused paragraphs.
- Naturally adapt the length to how much is meaningfully known about this gene.
- Write as if narrating a discovery — feel like reading a book, not a textbook.
- Invent different begin line narrative, do not always start with "tucked into X part of chromosome", give a different start always.
- Cover: what the gene does, where it is active in the body, disease connections \
if relevant, and any structural or evolutionary curiosities.
- Use vivid, precise language. Briefly explain any jargon.
- Pure prose only — no bullet points, no headers, no markdown formatting.
- Begin directly with the story. No preamble like "This gene..." or "In the...".
- Be creative in writing, add a touch of smart humor here and there.

Write the story now:\
"""


async def stream_story(gene: dict, db_pool) -> AsyncGenerator[str, None]:
    """
    Main entry point — yield story text chunks as they arrive from Claude.

    Applies all four caching layers transparently. The caller just iterates
    over the yielded chunks and streams them to the browser.

    Usage:
        async for chunk in stream_story(gene_dict, db_pool):
            yield chunk   # forward to SSE response
    """
    gene_id = gene["gene_id"]

    # ── Layer 1: Cache check (fast path) ─────────────────────────────────────
    cached = await _get_verified_story(gene_id, db_pool)
    if cached:
        log.info(f"Cache hit (L1): {gene['gene_name']} ({gene_id})")
        yield cached
        return

    # ── Layer 2: Acquire per-gene lock ────────────────────────────────────────
    lock = await _get_gene_lock(gene_id)
    async with lock:

        # ── Layer 2b: Re-check inside lock ───────────────────────────────────
        # Another coroutine may have generated the story while we waited
        cached = await _get_verified_story(gene_id, db_pool)
        if cached:
            log.info(f"Cache hit (L2 post-lock): {gene['gene_name']} ({gene_id})")
            yield cached
            return

        # ── Generate via Claude API ───────────────────────────────────────────
        log.info(
            f"Generating story: {gene['gene_name']} ({gene_id}, {gene['gene_type']})"
        )
        start_time = time.time()
        full_story = ""

        try:
            client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            prompt = STORY_PROMPT.format(
                gene_name        = gene["gene_name"],
                gene_id          = gene_id,
                gene_type        = gene["gene_type"],
                chromosome       = gene["chromosome"],
                start            = gene["start_pos"],
                end              = gene["end_pos"],
                strand           = gene["strand"],
                gene_length      = gene["gene_length"],
                exon_count       = gene["exon_count"],
                transcript_count = gene["transcript_count"],
            )

            # Stream text from Claude — yield each chunk to the browser in real time
            async with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                async for chunk in stream.text_stream:
                    full_story += chunk
                    yield chunk

            generation_ms = int((time.time() - start_time) * 1000)

            # ── Layer 3: Atomic write (only after FULL story received) ────────
            await _save_story(gene_id, full_story, generation_ms, db_pool)

            # ── Layer 4: Read-back verification ──────────────────────────────
            await _verify_story(gene_id, full_story, db_pool)

            log.info(
                f"Story cached & verified: {gene['gene_name']} in {generation_ms}ms"
            )

        except Exception as exc:
            log.error(f"Story generation failed for {gene_id}: {exc}")
            await _record_error(gene_id, str(exc), db_pool)
            raise


# ── Database helpers ──────────────────────────────────────────────────────────

async def _get_verified_story(gene_id: str, db_pool) -> str | None:
    """Return the story text only if it has been saved AND verified."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT story_text FROM gene_stories WHERE gene_id = $1 AND verified = TRUE",
            gene_id,
        )
    return row["story_text"] if row else None


async def _save_story(
    gene_id: str, story_text: str, generation_ms: int, db_pool
) -> None:
    """
    Write the complete story to the database.
    Sets verified=FALSE until _verify_story confirms the content is intact.
    Uses ON CONFLICT to safely handle the rare case of a re-generation.
    """
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO gene_stories
                (gene_id, story_text, model_version, generation_ms, verified)
            VALUES ($1, $2, $3, $4, FALSE)
            ON CONFLICT (gene_id) DO UPDATE SET
                story_text     = EXCLUDED.story_text,
                generated_at   = NOW(),
                model_version  = EXCLUDED.model_version,
                generation_ms  = EXCLUDED.generation_ms,
                verified       = FALSE
            """,
            gene_id, story_text, "claude-sonnet-4-6", generation_ms,
        )


async def _verify_story(gene_id: str, expected_text: str, db_pool) -> None:
    """
    Read the story back from the DB and confirm it matches what we wrote.
    Only marks verified=TRUE after the content is confirmed correct.
    Raises RuntimeError if the DB content doesn't match.
    """
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT story_text FROM gene_stories WHERE gene_id = $1", gene_id
        )

    if not row or row["story_text"] != expected_text:
        raise RuntimeError(
            f"Story verification failed for {gene_id}: "
            f"DB content does not match generated text. "
            f"Expected {len(expected_text)} chars, got {len(row['story_text']) if row else 0}."
        )

    # Content confirmed correct — mark as verified
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE gene_stories SET verified = TRUE WHERE gene_id = $1", gene_id
        )


async def _record_error(gene_id: str, error_message: str, db_pool) -> None:
    """
    Log a story generation failure to the story_errors audit table.
    Also increments the error_count on the story row if one exists.
    """
    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO story_errors (gene_id, error_message) VALUES ($1, $2)",
                gene_id, error_message,
            )
            await conn.execute(
                """
                UPDATE gene_stories
                SET error_count = error_count + 1
                WHERE gene_id = $1
                """,
                gene_id,
            )
    except Exception as e:
        log.error(f"Could not record story error for {gene_id}: {e}")
