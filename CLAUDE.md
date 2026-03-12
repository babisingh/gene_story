# Gene Story — Claude Code Instructions

This file tells Claude Code how to work in this project.

## Project Overview

Gene Story is a book-like web application that reads genomic annotation data
(GENCODE v49 GTF file) and generates AI-written stories for every human gene,
organized as chromosome chapters.

## Key Commands

### Start the application
```bash
docker compose up -d
```

### Run the GTF parser (one-time, after downloading the GTF file)
```bash
docker compose run --rm --profile tools parser python gtf_parser.py
docker compose run --rm --profile tools parser python load_cytoband.py
```

### View API logs
```bash
docker compose logs -f api
```

### Code review (slash command)
```
/review <file_path>
```
Example: `/review api/routes/genes.py`

### Install the architecture agent git hook
```bash
python agents/setup_hooks.py
```

## Architecture

- `parser/`   — one-time data loading scripts (GTF, cytobands)
- `api/`      — FastAPI backend (Python)
- `frontend/` — React frontend (served by Nginx)
- `agents/`   — review agent and architecture agent
- `docs/`     — ARCHITECTURE.md (auto-maintained by architecture agent)
- `db/`       — PostgreSQL schema (init.sql)

Full architecture details: see `docs/ARCHITECTURE.md`

## Important Patterns

### Story caching (api/story_agent.py)
Stories use a four-layer guarantee — do not modify caching logic without
reading the docstring at the top of story_agent.py carefully.

### Database extensibility
The `genes` table has a `properties JSONB` column for future data.
Add new gene properties like this:
```python
await conn.execute(
    "UPDATE genes SET properties = properties || $1 WHERE gene_id = $2",
    json.dumps({"new_field": value}), gene_id
)
```

### Gene navigation
Genes are ordered by `start_pos` within each chromosome.
The prev/next navigation uses `start_pos` for ordering.

## Environment

All secrets are in `.env` (never committed). See `.env.example` for the template.
The Anthropic API key is used only in `api/story_agent.py` and `agents/*.py`.
