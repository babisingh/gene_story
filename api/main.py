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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cache_integrity import run_integrity_monitor
from routes import chromosomes, cytobands, genes, stories

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code here runs once when the server starts (before handling any requests),
    and once when the server shuts down.
    """
    log.info("Starting Gene Story API...")

    # Create a pool of database connections.
    # A pool means multiple requests can hit the DB at the same time without
    # waiting for each other. min_size=2 keeps 2 connections always open,
    # max_size=10 allows up to 10 simultaneous DB queries.
    app.state.db = await asyncpg.create_pool(
        os.getenv("DATABASE_URL"),
        min_size=2,
        max_size=10,
    )
    log.info("Database connection pool ready")

    # Apply schema if tables don't exist (idempotent — uses CREATE IF NOT EXISTS).
    # This lets the API self-migrate on Railway where init.sql isn't run by postgres entrypoint.
    schema_path = pathlib.Path(__file__).parent / "schema.sql"
    if schema_path.exists():
        schema_sql = schema_path.read_text()
        async with app.state.db.acquire() as conn:
            await conn.execute(schema_sql)
        log.info("Schema applied (or already existed)")

    # Start the background task that checks for missed story caches every hour.
    # asyncio.create_task runs it concurrently without blocking the server.
    asyncio.create_task(run_integrity_monitor(app.state.db))

    yield  # server runs here — handles requests until shutdown

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

# Allow the frontend (different port in development) to call this API.
# In production, tighten this to your actual domain.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    os.getenv("FRONTEND_URL", ""),                      # set on Railway
    "https://frontend-production-6c210.up.railway.app", # Railway frontend domain
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route groups — each file handles a different part of the API
app.include_router(chromosomes.router, prefix="/api/v1")
app.include_router(genes.router,       prefix="/api/v1")
app.include_router(stories.router,     prefix="/api/v1")
app.include_router(cytobands.router,   prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health_check():
    """Simple liveness check — returns OK if the server is running."""
    return {"status": "ok", "service": "gene-story-api"}
