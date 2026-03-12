"""
Story routes — serve gene stories, with Server-Sent Events (SSE) streaming.

Endpoints:
  GET /api/v1/genes/{gene_id}/story
    Returns a cached story instantly, or 404 if not yet generated.
    Use this to check if a story exists without triggering generation.

  GET /api/v1/genes/{gene_id}/story/stream
    Streams a story to the browser using Server-Sent Events.
    - If cached: sends the full text in one event, instantly.
    - If not cached: generates via Claude API, streaming each chunk
      as it arrives (typewriter effect in the browser).

What are Server-Sent Events (SSE)?
  SSE is a browser standard for receiving a stream of text events from
  a server over a single HTTP connection. The browser uses EventSource
  to connect and receive 'data: ...' lines as they arrive.
  We use SSE instead of WebSockets because it's simpler (one-way:
  server → browser) and works perfectly for streaming text.
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from story_agent import stream_story

log = logging.getLogger(__name__)
router = APIRouter(tags=["stories"])


@router.get("/genes/{gene_id}/story")
async def get_story(gene_id: str, request: Request):
    """
    Return the cached story for a gene, or 404 if it hasn't been generated yet.

    Does NOT trigger generation — use /story/stream for that.
    Useful for checking cache status or fetching without streaming.
    """
    async with request.app.state.db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT story_text, generated_at, model_version, verified
            FROM gene_stories
            WHERE gene_id = $1 AND verified = TRUE
            """,
            gene_id,
        )

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"No cached story for gene '{gene_id}'. "
                   f"Visit /genes/{gene_id}/story/stream to generate one.",
        )

    return {
        "gene_id":       gene_id,
        "story_text":    row["story_text"],
        "generated_at":  row["generated_at"].isoformat(),
        "model_version": row["model_version"],
        "verified":      row["verified"],
    }


@router.get("/genes/{gene_id}/story/stream")
async def stream_gene_story(gene_id: str, request: Request):
    """
    Stream a gene story to the browser using Server-Sent Events.

    The browser connects with EventSource and receives events:
      data: {"type": "chunk", "text": "..."}   — story text chunk
      data: {"type": "done", "cached": false}  — generation complete
      data: {"type": "error", "message": "..."} — if something went wrong

    The frontend appends each chunk to the display as it arrives,
    creating a typewriter effect for newly generated stories.
    For cached stories the full text arrives in one burst.
    """
    async with request.app.state.db.acquire() as conn:
        gene = await conn.fetchrow(
            """
            SELECT gene_id, gene_name, chromosome, start_pos, end_pos,
                   strand, gene_type, exon_count, transcript_count, gene_length
            FROM genes WHERE gene_id = $1
            """,
            gene_id,
        )

    if not gene:
        raise HTTPException(status_code=404, detail=f"Gene '{gene_id}' not found")

    gene_dict = dict(gene)

    async def event_generator():
        """Yield SSE-formatted events for the story stream."""
        try:
            async for chunk in stream_story(gene_dict, request.app.state.db):
                # Each chunk is sent as a separate SSE event
                data = json.dumps({"type": "chunk", "text": chunk})
                yield f"data: {data}\n\n"

            # Signal to the browser that generation is complete
            done_data = json.dumps({"type": "done"})
            yield f"data: {done_data}\n\n"

        except Exception as exc:
            log.error(f"Streaming error for {gene_id}: {exc}")
            error_data = json.dumps({"type": "error", "message": str(exc)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disables Nginx buffering for SSE
        },
    )
