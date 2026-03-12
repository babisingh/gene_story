-- Gene Story Database Schema
-- Runs automatically when PostgreSQL container starts for the first time.
--
-- Tables:
--   chromosomes   — one row per chromosome (ch1-22, X, Y, M)
--   cytobands     — G-band data for drawing the chromosome ideogram
--   genes         — one row per gene, with a JSONB properties column for future extensibility
--   gene_stories  — cached LLM-generated stories (with verification fields)
--   story_errors  — audit log of every story generation failure
--   gene_visits   — every time a gene page is loaded (used by integrity monitor)
--   bookmarks     — user-saved gene bookmarks with optional notes


-- ─── Chromosomes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chromosomes (
    name        TEXT PRIMARY KEY,           -- e.g. "chr1", "chrX", "chrM"
    length      INTEGER,                    -- total base pairs
    gene_count  INTEGER DEFAULT 0           -- updated after GTF parsing
);


-- ─── Cytobands (G-band data for ideogram) ─────────────────────────────────────
-- Stain types: gneg (light), gpos25/50/75/100 (increasingly dark),
--              acen (centromere), gvar (variable), stalk
CREATE TABLE IF NOT EXISTS cytobands (
    id          SERIAL PRIMARY KEY,
    chromosome  TEXT REFERENCES chromosomes(name),
    start_pos   INTEGER NOT NULL,
    end_pos     INTEGER NOT NULL,
    band_name   TEXT NOT NULL,              -- e.g. "p36.33"
    stain       TEXT NOT NULL              -- e.g. "gneg", "gpos50", "acen"
);


-- ─── Genes ────────────────────────────────────────────────────────────────────
-- Ordered by chromosome + start_pos so sequential reading works naturally.
-- The properties JSONB column is intentionally open-ended — add anything later
-- (OMIM IDs, UniProt IDs, expression data, etc.) without schema migrations.
CREATE TABLE IF NOT EXISTS genes (
    gene_id             TEXT PRIMARY KEY,   -- Ensembl ID e.g. "ENSG00000012048"
    gene_name           TEXT NOT NULL,      -- e.g. "BRCA1"
    chromosome          TEXT REFERENCES chromosomes(name),
    start_pos           INTEGER NOT NULL,
    end_pos             INTEGER NOT NULL,
    strand              TEXT NOT NULL,      -- "+" or "-"
    gene_type           TEXT NOT NULL,      -- "protein_coding", "lncRNA", etc.
    exon_count          INTEGER DEFAULT 0,
    transcript_count    INTEGER DEFAULT 0,
    gene_length         INTEGER,            -- end_pos - start_pos + 1
    visit_count         INTEGER DEFAULT 0,
    properties          JSONB DEFAULT '{}'  -- open for future enrichment
);


-- ─── Gene Stories ─────────────────────────────────────────────────────────────
-- Four-layer caching guarantee fields:
--   verified     — TRUE only after read-back confirms DB write was correct
--   model_version — tracks which Claude model generated the story
--   generation_ms — performance monitoring
--   error_count  — incremented on each failed generation attempt
CREATE TABLE IF NOT EXISTS gene_stories (
    gene_id         TEXT PRIMARY KEY REFERENCES genes(gene_id),
    story_text      TEXT NOT NULL,
    generated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    model_version   TEXT NOT NULL,
    token_count     INTEGER,
    generation_ms   INTEGER,
    error_count     INTEGER DEFAULT 0
);


-- ─── Story Errors (Audit Log) ─────────────────────────────────────────────────
-- Every generation failure is recorded here.
-- The integrity monitor queries this table to find persistent failures.
CREATE TABLE IF NOT EXISTS story_errors (
    id              SERIAL PRIMARY KEY,
    gene_id         TEXT REFERENCES genes(gene_id),
    error_message   TEXT,
    occurred_at     TIMESTAMP DEFAULT NOW()
);


-- ─── Gene Visits ──────────────────────────────────────────────────────────────
-- Recorded every time a gene story page is loaded.
-- Used by the background integrity monitor to find visited-but-uncached genes.
CREATE TABLE IF NOT EXISTS gene_visits (
    id          SERIAL PRIMARY KEY,
    gene_id     TEXT REFERENCES genes(gene_id),
    visited_at  TIMESTAMP DEFAULT NOW()
);


-- ─── Bookmarks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
    id          SERIAL PRIMARY KEY,
    gene_id     TEXT REFERENCES genes(gene_id),
    note        TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);


-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- These make common queries fast: listing genes per chromosome in order,
-- searching by name, filtering by type.
CREATE INDEX IF NOT EXISTS idx_genes_chromosome_pos  ON genes(chromosome, start_pos);
CREATE INDEX IF NOT EXISTS idx_genes_name            ON genes(gene_name);
CREATE INDEX IF NOT EXISTS idx_genes_type            ON genes(gene_type);
CREATE INDEX IF NOT EXISTS idx_cytobands_chromosome  ON cytobands(chromosome);
CREATE INDEX IF NOT EXISTS idx_gene_visits_gene_id   ON gene_visits(gene_id);
CREATE INDEX IF NOT EXISTS idx_story_errors_gene_id  ON story_errors(gene_id);
CREATE INDEX IF NOT EXISTS idx_stories_verified      ON gene_stories(verified);
