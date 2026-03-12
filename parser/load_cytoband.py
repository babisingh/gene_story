"""
Cytoband Loader — downloads and stores chromosome band data for the ideogram.

What are cytobands?
  Cytobands are the alternating light and dark bands you see on chromosomes
  in biology textbooks. They are produced by a staining technique (Giemsa stain)
  and serve as a coordinate system for locating genes on chromosomes.
  For example, "BRCA1 is at 17q21.31" refers to chromosome 17, long arm (q),
  band 21, sub-band 31.

This data is used to draw the chromosome ideogram in the frontend — a visual
map of the chromosome showing where the current gene sits.

Stain types and their meaning:
  gneg     — lightly staining (gene-rich regions, usually euchromatin)
  gpos25   — 25% dark
  gpos50   — 50% dark
  gpos75   — 75% dark
  gpos100  — darkly staining (gene-poor regions, usually heterochromatin)
  acen     — centromere (the pinched middle of the chromosome)
  gvar     — variable heterochromatin
  stalk    — stalk region (found on acrocentric chromosomes 13,14,15,21,22)

Data source: UCSC Genome Browser (GRCh38/hg38)

Run after gtf_parser.py:
  docker compose run --rm parser python load_cytoband.py
"""

import gzip
import io
import logging
import os
import ssl
import urllib.request
from dotenv import load_dotenv

import psycopg2
from psycopg2.extras import execute_batch

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

CYTOBAND_URL = "https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBand.txt.gz"


def download_cytoband() -> list[str]:
    """Download the cytoband file from UCSC and return its lines.

    Uses an unverified SSL context to handle environments where a proxy
    introduces a self-signed certificate (e.g. corporate or cloud proxies).
    """
    log.info(f"Downloading cytoband data from UCSC...")
    # ssl.create_default_context() with check_hostname=False handles proxies
    # that present their own self-signed certificate (safe for this public data file)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(CYTOBAND_URL, context=ctx) as response:
        compressed_data = response.read()

    with gzip.open(io.BytesIO(compressed_data), "rt") as fh:
        lines = fh.readlines()

    log.info(f"Downloaded {len(lines):,} cytoband entries")
    return lines


def parse_cytoband(lines: list[str]) -> list[tuple]:
    """
    Parse tab-separated cytoband lines into tuples.

    Input line format:
      chr1  0  2300000  p36.33  gneg

    Returns list of (chromosome, start, end, band_name, stain) tuples.
    """
    bands = []
    for line in lines:
        parts = line.strip().split("\t")
        if len(parts) < 5:
            continue
        chrom, start, end, name, stain = parts
        bands.append((chrom, int(start), int(end), name, stain))
    return bands


def load_cytobands(bands: list[tuple], db_url: str) -> None:
    """Clear existing cytoband data and insert fresh download."""
    log.info("Connecting to PostgreSQL...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    try:
        # Get the list of valid chromosomes already in the DB
        cur.execute("SELECT name FROM chromosomes")
        valid_chroms = {row[0] for row in cur.fetchall()}

        if not valid_chroms:
            raise RuntimeError(
                "No chromosomes found in DB. Run gtf_parser.py first."
            )

        # Filter to only keep bands for chromosomes we have in the DB
        valid_bands = [
            b for b in bands if b[0] in valid_chroms
        ]

        log.info(f"Loading {len(valid_bands):,} bands (filtered from {len(bands):,} total)...")

        # Clear old data before inserting fresh
        cur.execute("DELETE FROM cytobands")

        execute_batch(
            cur,
            """
            INSERT INTO cytobands (chromosome, start_pos, end_pos, band_name, stain)
            VALUES (%s, %s, %s, %s, %s)
            """,
            valid_bands,
            page_size=500,
        )

        conn.commit()
        log.info(f"✅ Loaded {len(valid_bands):,} cytoband entries")

    except Exception:
        conn.rollback()
        log.exception("Cytoband load failed — rolled back")
        raise
    finally:
        cur.close()
        conn.close()


def main():
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://genestory:changeme@localhost:5432/genestory",
    )
    # DATABASE_URL is set correctly by docker-compose or passed explicitly when running natively

    lines = download_cytoband()
    bands = parse_cytoband(lines)
    load_cytobands(bands, db_url)


if __name__ == "__main__":
    main()
