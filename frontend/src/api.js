/**
 * API client — all calls to the Gene Story backend go through here.
 *
 * The base URL is empty so calls go to the same host, which means:
 *   - In development: Vite's proxy forwards /api/* to localhost:8000
 *   - In production:  Nginx forwards /api/* to the FastAPI container
 */

const BASE = "/api/v1";

/** Fetch all chromosomes (the chapter list). */
export async function fetchChromosomes() {
  const res = await fetch(`${BASE}/chromosomes`);
  if (!res.ok) throw new Error("Could not load chromosomes");
  return res.json(); // { chromosomes: [...] }
}

/** Fetch a page of genes for a chromosome. */
export async function fetchGenes(chromosome, page = 1, pageSize = 50) {
  const res = await fetch(
    `${BASE}/chromosomes/${chromosome}/genes?page=${page}&page_size=${pageSize}`
  );
  if (!res.ok) throw new Error(`Could not load genes for ${chromosome}`);
  return res.json(); // { genes, total, page, pages }
}

/** Fetch a single gene's full metadata. */
export async function fetchGene(geneId) {
  const res = await fetch(`${BASE}/genes/${geneId}`);
  if (!res.ok) throw new Error(`Gene ${geneId} not found`);
  return res.json();
}

/** Fetch the previous and next genes for navigation. */
export async function fetchNeighbours(geneId) {
  const res = await fetch(`${BASE}/genes/${geneId}/neighbours`);
  if (!res.ok) throw new Error(`Could not load neighbours for ${geneId}`);
  return res.json(); // { prev: {...} | null, next: {...} | null }
}

/** Search genes by name. */
export async function searchGenes(query, geneType = null) {
  const params = new URLSearchParams({ q: query, limit: 20 });
  if (geneType) params.set("gene_type", geneType);
  const res = await fetch(`${BASE}/genes/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json(); // { results: [...] }
}

/** Fetch cytobands for a chromosome (used by the ideogram). */
export async function fetchCytobands(chromosome) {
  const res = await fetch(`${BASE}/chromosomes/${chromosome}/cytobands`);
  if (!res.ok) throw new Error(`Could not load cytobands for ${chromosome}`);
  return res.json(); // { chromosome, bands: [...] }
}

/**
 * Open an SSE stream for a gene story.
 *
 * Returns an EventSource object. The caller should handle:
 *   onmessage(event) — parse event.data as JSON, handle type: "chunk" | "done" | "error"
 *
 * Remember to call source.close() when done.
 */
export function openStoryStream(geneId) {
  return new EventSource(`${BASE}/genes/${geneId}/story/stream`);
}
