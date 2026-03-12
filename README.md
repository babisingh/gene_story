# Gene Story

A book-like web application that tells the story of every gene in the human genome — chromosome by chromosome.

Every chromosome is a chapter. Every gene has a story.

## Quick Start

### Prerequisites
- Docker + Docker Compose
- The GENCODE v49 GTF file (download below)
- An Anthropic API key (from [console.anthropic.com](https://console.anthropic.com))

### 1. Configure environment
```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Download the GTF file
```bash
mkdir -p data
wget -P data/ https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.basic.annotation.gtf.gz
```

### 3. Start the database
```bash
docker compose up -d postgres
```

### 4. Load the data (one-time, takes 2-5 minutes)
```bash
docker compose run --rm --profile tools parser python gtf_parser.py
docker compose run --rm --profile tools parser python load_cytoband.py
```

### 5. Start all services
```bash
docker compose up -d
```

### 6. Open the app
- **Frontend:** http://localhost:3000
- **API docs:** http://localhost:8000/docs

---

## How It Works

1. The GTF parser reads the GENCODE annotation file and loads all genes into PostgreSQL
2. The cytoband loader downloads chromosome band data from UCSC for the ideogram
3. When you open a gene, the API generates a story using the Claude API
4. The story is cached in PostgreSQL — every subsequent visit is instant

## Features

- Book-like reading interface with chromosome chapters
- Chromosome ideogram showing exact gene location with G-band colouring
- AI-generated gene stories (streaming typewriter effect for new stories)
- Gene search across all chromosomes
- Keyboard navigation (left/right arrow keys)
- Reading position saved automatically (resumes where you left off)

## Agents

### Code Review Agent
```bash
# Via slash command in Claude Code:
/review api/routes/genes.py

# Or directly:
python agents/review_agent.py api/routes/genes.py
```
Produces a plain-English review saved to `REVIEW_REPORT.md`.

### Architecture Agent
Runs automatically after every git commit and updates `docs/ARCHITECTURE.md`.

Install the git hook once after cloning:
```bash
python agents/setup_hooks.py
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram and documentation.

## API

REST API documented at http://localhost:8000/docs

Key endpoints:
```
GET /api/v1/chromosomes
GET /api/v1/chromosomes/{chr}/genes
GET /api/v1/genes/{gene_id}/story/stream
GET /api/v1/genes/search?q=BRCA1
```
