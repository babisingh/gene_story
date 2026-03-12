"""
Chromosome routes — the "chapters" of the Gene Story book.

Endpoints:
  GET /api/v1/chromosomes
    Returns all chromosomes with their name, length, and gene count.
    The frontend uses this to build the chapter list in the left panel.
"""

from fastapi import APIRouter, Request

router = APIRouter(tags=["chromosomes"])

# Canonical display order for chromosomes (numeric first, then X, Y, M)
CHROMOSOME_ORDER = (
    [f"chr{i}" for i in range(1, 23)] + ["chrX", "chrY", "chrM"]
)


@router.get("/chromosomes")
async def list_chromosomes(request: Request):
    """
    Return all chromosomes sorted in the standard order (chr1 → chr22, X, Y, M).

    Each entry includes:
      name       — e.g. "chr1"
      length     — total base pairs
      gene_count — number of genes on this chromosome
    """
    async with request.app.state.db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT name, length, gene_count FROM chromosomes ORDER BY name"
        )

    # Sort in biological order (chr1, chr2, ..., chr22, chrX, chrY, chrM)
    order_map = {name: i for i, name in enumerate(CHROMOSOME_ORDER)}
    chromosomes = sorted(
        [dict(r) for r in rows],
        key=lambda c: order_map.get(c["name"], 999),
    )

    return {"chromosomes": chromosomes}
