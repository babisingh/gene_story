"""
GTF Parser for GENCODE v49 basic annotation.

What this script does:
  1. Reads the compressed GTF file (gencode.v49.basic.annotation.gtf.gz)
  2. Extracts every gene's metadata: name, type, chromosome, coordinates, strand
  3. Counts how many exons belong to each gene
  4. Counts how many transcripts each gene has
  5. Loads everything into PostgreSQL

GTF file format (tab-separated columns):
  Col 1: chromosome name      (e.g. chr1, chrX)
  Col 2: annotation source    (e.g. HAVANA, ENSEMBL)
  Col 3: feature type         (gene, transcript, exon, CDS, UTR, ...)
  Col 4: start position       (1-based)
  Col 5: end position         (1-based, inclusive)
  Col 6: score                (usually ".")
  Col 7: strand               ("+" or "-")
  Col 8: frame                (0, 1, 2, or ".")
  Col 9: attributes           (key "value"; pairs, space-separated)

Example attribute string:
  gene_id "ENSG00000012048.23"; gene_name "BRCA1"; gene_type "protein_coding";

Run this script once after downloading the GTF file:
  docker compose run --rm parser python gtf_parser.py

Expected runtime: 2-5 minutes depending on hardware.
"""

import gzip
import re
import time
import logging
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Official GRCh38 chromosome lengths — used to populate the chromosomes table
# and to skip non-standard contigs (patches, alternate sequences, etc.)
CHROMOSOME_LENGTHS = {
    "chr1":  248956422, "chr2":  242193529, "chr3":  198295559,
    "chr4":  190214555, "chr5":  181538259, "chr6":  170805979,
    "chr7":  159345973, "chr8":  145138636, "chr9":  138394717,
    "chr10": 133797422, "chr11": 135086622, "chr12": 133275309,
    "chr13": 114364328, "chr14": 107043718, "chr15": 101991189,
    "chr16":  90338345, "chr17":  83257441, "chr18":  80373285,
    "chr19":  58617616, "chr20":  64444167, "chr21":  46709983,
    "chr22":  50818468, "chrX":  156040895, "chrY":   57227415,
    "chrM":      16569,
}


def parse_attributes(attr_string: str) -> dict:
    """
    Parse a GTF attribute string into a plain Python dictionary.

    Input:  'gene_id "ENSG00000012048.23"; gene_name "BRCA1"; gene_type "protein_coding";'
    Output: {'gene_id': 'ENSG00000012048.23', 'gene_name': 'BRCA1', 'gene_type': 'protein_coding'}
    """
    return {
        match.group(1): match.group(2)
        for match in re.finditer(r'(\w+)\s+"([^"]+)"', attr_string)
    }


def strip_version(ensembl_id: str) -> str:
    """
    Remove the version suffix from an Ensembl ID.
    ENSG00000012048.23  →  ENSG00000012048
    """
    return ensembl_id.split(".")[0]


def parse_gtf(gtf_path: Path) -> tuple[dict, dict, dict]:
    """
    Stream through the GTF file and collect:
      - genes:            gene_id → metadata dict
      - exon_counts:      gene_id → number of exon features
      - transcript_counts: gene_id → number of transcript features

    Returns all three dictionaries.
    """
    genes = {}
    exon_counts = {}
    transcript_counts = {}

    log.info(f"Opening GTF file: {gtf_path}")
    open_fn = gzip.open if str(gtf_path).endswith(".gz") else open
    line_num = 0

    with open_fn(gtf_path, "rt") as fh:
        for line in fh:
            # Skip comment/header lines
            if line.startswith("#"):
                continue

            line_num += 1
            if line_num % 500_000 == 0:
                log.info(f"  {line_num:>8,} lines read — {len(genes):,} genes so far")

            parts = line.rstrip("\n").split("\t")
            if len(parts) < 9:
                continue

            chrom   = parts[0]
            feature = parts[2]
            start   = int(parts[3])
            end     = int(parts[4])
            strand  = parts[6]
            attrs   = parse_attributes(parts[8])

            # Skip alternate contigs, patches, and unplaced scaffolds
            if chrom not in CHROMOSOME_LENGTHS:
                continue

            gene_id = strip_version(attrs.get("gene_id", ""))
            if not gene_id:
                continue

            if feature == "gene":
                genes[gene_id] = {
                    "gene_id":          gene_id,
                    "gene_name":        attrs.get("gene_name", gene_id),
                    "chromosome":       chrom,
                    "start_pos":        start,
                    "end_pos":          end,
                    "strand":           strand,
                    "gene_type":        attrs.get("gene_type", "unknown"),
                    "gene_length":      end - start + 1,
                }
                exon_counts.setdefault(gene_id, 0)
                transcript_counts.setdefault(gene_id, 0)

            elif feature == "exon":
                exon_counts[gene_id] = exon_counts.get(gene_id, 0) + 1

            elif feature == "transcript":
                transcript_counts[gene_id] = transcript_counts.get(gene_id, 0) + 1

    log.info(f"Parsing complete — {len(genes):,} genes found in {line_num:,} lines")
    return genes, exon_counts, transcript_counts


def load_to_db(
    genes: dict,
    exon_counts: dict,
    transcript_counts: dict,
    db_url: str,
) -> None:
    """
    Insert chromosomes and genes into PostgreSQL.
    Uses ON CONFLICT DO UPDATE so re-running this script is safe.
    """
    log.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    try:
        # ── Chromosomes ────────────────────────────────────────────────────────
        log.info("Inserting chromosomes...")
        execute_batch(
            cur,
            """
            INSERT INTO chromosomes (name, length)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE SET length = EXCLUDED.length
            """,
            list(CHROMOSOME_LENGTHS.items()),
        )

        # ── Genes ──────────────────────────────────────────────────────────────
        log.info(f"Inserting {len(genes):,} genes...")
        rows = [
            (
                g["gene_id"],
                g["gene_name"],
                g["chromosome"],
                g["start_pos"],
                g["end_pos"],
                g["strand"],
                g["gene_type"],
                exon_counts.get(g["gene_id"], 0),
                transcript_counts.get(g["gene_id"], 0),
                g["gene_length"],
            )
            for g in genes.values()
        ]

        execute_batch(
            cur,
            """
            INSERT INTO genes
                (gene_id, gene_name, chromosome, start_pos, end_pos,
                 strand, gene_type, exon_count, transcript_count, gene_length)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (gene_id) DO UPDATE SET
                gene_name        = EXCLUDED.gene_name,
                exon_count       = EXCLUDED.exon_count,
                transcript_count = EXCLUDED.transcript_count,
                gene_length      = EXCLUDED.gene_length
            """,
            rows,
            page_size=1000,
        )

        # ── Update chromosome gene counts ──────────────────────────────────────
        log.info("Updating chromosome gene counts...")
        cur.execute("""
            UPDATE chromosomes c
            SET gene_count = (
                SELECT COUNT(*) FROM genes g WHERE g.chromosome = c.name
            )
        """)

        conn.commit()
        log.info("✅ All data loaded successfully")

    except Exception:
        conn.rollback()
        log.exception("Database load failed — rolled back")
        raise
    finally:
        cur.close()
        conn.close()


def main():
    # Find the GTF file — works both inside Docker (/app/data) and locally
    candidates = [
        Path("/app/data/gencode.v49.basic.annotation.gtf.gz"),
        Path("/home/user/gene_story/data/gencode.v49.basic.annotation.gtf.gz"),
    ]
    gtf_path = next((p for p in candidates if p.exists()), None)
    if not gtf_path:
        raise FileNotFoundError(
            "GTF file not found. Download it first:\n"
            "  wget -P data/ https://ftp.ebi.ac.uk/pub/databases/gencode/"
            "Gencode_human/release_49/gencode.v49.basic.annotation.gtf.gz"
        )

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://genestory:changeme@localhost:5432/genestory",
    )
    # When running outside Docker, the host is localhost, not 'postgres'
    db_url = db_url.replace("@postgres:", "@localhost:")

    total_start = time.time()

    log.info("═" * 50)
    log.info("Gene Story — GTF Parser")
    log.info("═" * 50)

    genes, exon_counts, transcript_counts = parse_gtf(gtf_path)
    load_to_db(genes, exon_counts, transcript_counts, db_url)

    elapsed = time.time() - total_start
    log.info(f"Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
