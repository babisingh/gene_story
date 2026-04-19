"""
Gene Story API — FastAPI Application Entry Point

This file starts the web server and wires everything together:
  - Creates the PostgreSQL connection pool on startup
  - Registers all API route groups
  - Starts the background cache integrity monitor
  - Configures CORS so the frontend can call the API

To run locally (outside Docker):
  uvicorn main:app --reload --port 8000
"""

import asyncio
import logging
import os
import pathlib
from contextlib import asynccontextmanager

import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cache_integrity import run_integrity_monitor
from routes import chromosomes, cytobands, genes, stories

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


async def _init_db(app: FastAPI, db_url: str) -> None:
    """
    Connect to PostgreSQL with retries, apply the schema, and start the
    integrity monitor.  Runs as a background asyncio task so the HTTP server
    can start (and pass Railway's health check) before the database is ready.
    """
    for attempt in range(1, 16):
        try:
            pool = await asyncpg.create_pool(db_url, min_size=2, max_size=10)
            app.state.db = pool
            log.info("Database connection pool ready")
            break
        except Exception as exc:
            delay = min(5 * attempt, 30)
            log.warning(
                f"DB not ready (attempt {attempt}/15): {exc} — retrying in {delay}s"
            )
            await asyncio.sleep(delay)
    else:
        log.error("Database unavailable after 15 attempts — /api/* routes will return 503")
        return

    schema_path = pathlib.Path(__file__).parent / "schema.sql"
    if schema_path.exists():
        try:
            async with app.state.db.acquire() as conn:
                await conn.execute(schema_path.read_text())
            log.info("Schema applied (or already existed)")
        except Exception as exc:
            log.error(f"Schema apply failed: {exc}")

    asyncio.create_task(run_integrity_monitor(app.state.db))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Server lifecycle.  The HTTP server starts immediately so Railway's health
    check gets a response right away.  Database connection happens in the
    background — API routes return 503 until the pool is ready.
    """
    log.info("Starting Gene Story API...")
    app.state.db = None

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        log.error(
            "DATABASE_URL is not set! "
            "On Railway: add a Postgres plugin, then set "
            "DATABASE_URL=${{Postgres.DATABASE_URL}} in the API service variables."
        )
    else:
        # Fire-and-forget: connect in the background so startup is non-blocking
        asyncio.create_task(_init_db(app, db_url))

    yield  # server handles requests here

    if app.state.db:
        await app.state.db.close()
        log.info("Database pool closed")


app = FastAPI(
    title="Gene Story API",
    description=(
        "Explore every gene in the human genome — chromosome by chromosome. "
        "Each gene has a generated story describing its role, expression, and significance."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def db_ready_gate(request: Request, call_next):
    """Return 503 for /api/* routes while the database pool is still connecting."""
    if request.url.path.startswith("/api/") and request.app.state.db is None:
        return JSONResponse(
            {"error": "API starting — database connecting, please retry in a moment"},
            status_code=503,
        )
    return await call_next(request)


# Allow the frontend to call this API.
# allow_origin_regex covers any *.up.railway.app domain so CORS keeps working
# across Railway re-deployments without hardcoding a specific subdomain.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    os.getenv("FRONTEND_URL", ""),  # optional explicit override
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route groups — each file handles a different part of the API
app.include_router(chromosomes.router, prefix="/api/v1")
app.include_router(genes.router,       prefix="/api/v1")
app.include_router(stories.router,     prefix="/api/v1")
app.include_router(cytobands.router,   prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health_check(request: Request):
    """
    Liveness check — always returns HTTP 200 so Railway's health check passes
    immediately on startup.  The 'db' field shows whether the database pool
    is still connecting, connected-but-empty, or populated with gene data.
    """
    if request.app.state.db is None:
        return {"status": "ok", "service": "gene-story-api", "db": "connecting", "counts": {}}
    try:
        row = await request.app.state.db.fetchrow(
            "SELECT (SELECT COUNT(*) FROM chromosomes) AS chrom_count,"
            "       (SELECT COUNT(*) FROM genes)       AS gene_count"
        )
        db_counts = {"chromosomes": int(row["chrom_count"]), "genes": int(row["gene_count"])}
        db_status = "populated" if db_counts["chromosomes"] > 0 else "empty"
    except Exception as exc:
        db_counts = {}
        db_status = f"error: {exc}"
    return {"status": "ok", "service": "gene-story-api", "db": db_status, "counts": db_counts}
