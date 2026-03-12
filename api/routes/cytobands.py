"""
Cytoband routes — serve chromosome band data for the ideogram.

Endpoints:
  GET /api/v1/chromosomes/{chromosome}/cytobands
    Returns all cytogenetic bands for a chromosome, in order.
    The frontend uses this data to draw the chromosome ideogram —
    the visual map showing where the current gene sits.
"""

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(tags=["cytobands"])


@router.get("/chromosomes/{chromosome}/cytobands")
async def get_cytobands(chromosome: str, request: Request):
    """
    Return all cytogenetic bands for a chromosome, ordered by position.

    Each band has:
      chromosome — e.g. "chr17"
      start_pos  — start coordinate in base pairs
      end_pos    — end coordinate in base pairs
      band_name  — e.g. "q21.31" (arm + region + band + sub-band)
      stain      — one of: gneg, gpos25, gpos50, gpos75, gpos100, acen, gvar, stalk

    The frontend uses stain to determine colour (darker = more heterochromatin).
    The acen stain marks the centromere.
    """
    async with request.app.state.db.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM chromosomes WHERE name = $1", chromosome
        )
        if not exists:
            raise HTTPException(
                status_code=404, detail=f"Chromosome '{chromosome}' not found"
            )

        rows = await conn.fetch(
            """
            SELECT chromosome, start_pos, end_pos, band_name, stain
            FROM cytobands
            WHERE chromosome = $1
            ORDER BY start_pos
            """,
            chromosome,
        )

    return {
        "chromosome": chromosome,
        "bands":      [dict(r) for r in rows],
    }
