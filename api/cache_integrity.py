"""
Cache Integrity Monitor — Layer 4 background safety net.

This module runs a background task that wakes up every hour and checks
whether any gene that has been visited is missing a verified cached story.

Why is this needed?
  In normal operation the four-layer guarantee in story_agent.py ensures
  every visited gene gets a cached story. But hardware failures, power cuts,
  or unexpected process kills can happen between the API call completing and
  the DB write finishing. This monitor finds and reports those gaps.

  For each gap found, it logs a warning. In a future version it could
  automatically trigger re-generation, but for now logging is sufficient
  because the next user visit will naturally regenerate the missing story.

It also reports any story generation errors from the past hour.
"""

import asyncio
import logging

log = logging.getLogger(__name__)


async def run_integrity_monitor(db_pool, interval_seconds: int = 3600) -> None:
    """
    Run the integrity check on a repeating schedule.

    Started as an asyncio background task in main.py's lifespan function.
    Runs forever until the process stops.

    Args:
        db_pool:          asyncpg connection pool
        interval_seconds: how often to run the check (default: every hour)
    """
    log.info(f"Cache integrity monitor started — runs every {interval_seconds}s")

    while True:
        # Wait first, then check — the initial population takes time
        await asyncio.sleep(interval_seconds)
        try:
            await _check_integrity(db_pool)
        except Exception:
            log.exception("Integrity check encountered an error")


async def _check_integrity(db_pool) -> None:
    """
    Query the database for:
      1. Genes that have been visited but have no verified story
      2. Story generation errors from the past hour

    Logs a warning for each problem found.
    """
    async with db_pool.acquire() as conn:

        # Find genes that were visited but have no verified story
        gaps = await conn.fetch(
            """
            SELECT DISTINCT g.gene_id, g.gene_name, g.gene_type, g.chromosome
            FROM genes g
            INNER JOIN gene_visits gv ON g.gene_id = gv.gene_id
            LEFT JOIN gene_stories gs ON g.gene_id = gs.gene_id
            WHERE gs.story_text IS NULL
               OR gs.verified   = FALSE
            ORDER BY g.chromosome, g.gene_name
            """
        )

        # Find errors from the past hour
        recent_errors = await conn.fetch(
            """
            SELECT se.gene_id, g.gene_name, se.error_message, se.occurred_at
            FROM story_errors se
            JOIN genes g ON se.gene_id = g.gene_id
            WHERE se.occurred_at > NOW() - INTERVAL '1 hour'
            ORDER BY se.occurred_at DESC
            """
        )

    if gaps:
        log.warning(
            f"Integrity check: {len(gaps)} visited gene(s) missing a verified story:"
        )
        for gap in gaps:
            log.warning(
                f"  ⚠  {gap['gene_name']} ({gap['gene_id']}, "
                f"{gap['gene_type']}, {gap['chromosome']})"
            )
    else:
        log.info("Integrity check ✅ — all visited genes have verified stories")

    if recent_errors:
        log.warning(f"Story generation errors in the last hour: {len(recent_errors)}")
        for err in recent_errors:
            log.warning(
                f"  ✗ {err['gene_name']} at {err['occurred_at']}: {err['error_message']}"
            )
