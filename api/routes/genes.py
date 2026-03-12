"""
Gene routes — individual gene data and gene listings per chromosome.

Endpoints:
  GET /api/v1/chromosomes/{chromosome}/genes
    Paginated list of genes on a chromosome, in genomic order (by position).

  GET /api/v1/genes/{gene_id}
    Full metadata for a single gene.

  GET /api/v1/genes/{gene_id}/neighbours
    The previous and next genes on the same chromosome (for book navigation).

  GET /api/v1/genes/search
    Search genes by name across all chromosomes.
"""

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["genes"])


@router.get("/chromosomes/{chromosome}/genes")
async def list_genes(
    chromosome: str,
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=200, description="Genes per page"),
):
    """
    Return genes on a chromosome, ordered by genomic position (start_pos).

    Genes are paginated because some chromosomes have thousands of genes.
    The frontend loads the first page immediately and fetches more as needed.

    Returns:
      genes      — list of gene objects for this page
      total      — total number of genes on this chromosome
      page       — current page number
      page_size  — number of genes per page
      pages      — total number of pages
    """
    offset = (page - 1) * page_size

    async with request.app.state.db.acquire() as conn:
        # Check the chromosome exists
        exists = await conn.fetchval(
            "SELECT 1 FROM chromosomes WHERE name = $1", chromosome
        )
        if not exists:
            raise HTTPException(status_code=404, detail=f"Chromosome '{chromosome}' not found")

        # Count total genes for pagination info
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM genes WHERE chromosome = $1", chromosome
        )

        # Fetch the page of genes, ordered by position
        rows = await conn.fetch(
            """
            SELECT gene_id, gene_name, chromosome, start_pos, end_pos,
                   strand, gene_type, exon_count, transcript_count, gene_length
            FROM genes
            WHERE chromosome = $1
            ORDER BY start_pos
            LIMIT $2 OFFSET $3
            """,
            chromosome, page_size, offset,
        )

    import math
    return {
        "genes":     [dict(r) for r in rows],
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     math.ceil(total / page_size),
    }


@router.get("/genes/search")
async def search_genes(
    request: Request,
    q: str = Query(..., min_length=1, description="Gene name to search for"),
    gene_type: str = Query(None, description="Filter by gene type (e.g. protein_coding)"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Search for genes by name (case-insensitive, partial match).

    Useful for the search bar — lets users jump to any gene by name.
    Optional gene_type filter narrows results to a specific category.
    """
    async with request.app.state.db.acquire() as conn:
        if gene_type:
            rows = await conn.fetch(
                """
                SELECT gene_id, gene_name, chromosome, start_pos, end_pos,
                       strand, gene_type, exon_count, gene_length
                FROM genes
                WHERE gene_name ILIKE $1 AND gene_type = $2
                ORDER BY gene_name
                LIMIT $3
                """,
                f"%{q}%", gene_type, limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT gene_id, gene_name, chromosome, start_pos, end_pos,
                       strand, gene_type, exon_count, gene_length
                FROM genes
                WHERE gene_name ILIKE $1
                ORDER BY gene_name
                LIMIT $2
                """,
                f"%{q}%", limit,
            )

    return {"results": [dict(r) for r in rows], "query": q}


@router.get("/genes/{gene_id}")
async def get_gene(gene_id: str, request: Request):
    """
    Return full metadata for a single gene.

    Also records a visit (used by the integrity monitor to verify
    stories are cached for every gene that gets read).
    """
    async with request.app.state.db.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT gene_id, gene_name, chromosome, start_pos, end_pos,
                   strand, gene_type, exon_count, transcript_count,
                   gene_length, visit_count, properties
            FROM genes
            WHERE gene_id = $1
            """,
            gene_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail=f"Gene '{gene_id}' not found")

        # Record this visit and increment the counter
        await conn.execute(
            "INSERT INTO gene_visits (gene_id) VALUES ($1)", gene_id
        )
        await conn.execute(
            "UPDATE genes SET visit_count = visit_count + 1 WHERE gene_id = $1",
            gene_id,
        )

    return dict(row)


@router.get("/genes/{gene_id}/neighbours")
async def get_neighbours(gene_id: str, request: Request):
    """
    Return the previous and next genes on the same chromosome.

    Used by the book's prev/next navigation buttons.
    Returns null for prev if this is the first gene, null for next if last.
    """
    async with request.app.state.db.acquire() as conn:
        current = await conn.fetchrow(
            "SELECT chromosome, start_pos FROM genes WHERE gene_id = $1", gene_id
        )
        if not current:
            raise HTTPException(status_code=404, detail=f"Gene '{gene_id}' not found")

        chrom     = current["chromosome"]
        start_pos = current["start_pos"]

        prev_gene = await conn.fetchrow(
            """
            SELECT gene_id, gene_name, gene_type, start_pos
            FROM genes
            WHERE chromosome = $1 AND start_pos < $2
            ORDER BY start_pos DESC
            LIMIT 1
            """,
            chrom, start_pos,
        )

        next_gene = await conn.fetchrow(
            """
            SELECT gene_id, gene_name, gene_type, start_pos
            FROM genes
            WHERE chromosome = $1 AND start_pos > $2
            ORDER BY start_pos ASC
            LIMIT 1
            """,
            chrom, start_pos,
        )

    return {
        "prev": dict(prev_gene) if prev_gene else None,
        "next": dict(next_gene) if next_gene else None,
    }
