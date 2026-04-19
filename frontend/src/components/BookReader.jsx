/**
 * BookReader — the main reading area.
 *
 * Shows:
 *   1. Chromosome ideogram at the top (gene position marker)
 *   2. Gene header: name, type badge, coordinates
 *   3. Streaming story text (typewriter effect for new stories)
 *   4. Previous / Next navigation buttons
 *
 * Story streaming:
 *   When a gene is opened, this component opens an SSE connection to
 *   /api/v1/genes/{id}/story/stream. The server either sends the cached
 *   story in one burst, or streams it live from Claude chunk by chunk.
 *   Each chunk is appended to the display as it arrives.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCytobands, fetchGene, fetchGenes, fetchNeighbours, openStoryStream } from "../api";
import ChromosomeIdeogram from "./ChromosomeIdeogram";
import BookmarkButton from "./BookmarkButton";

// Human-readable labels for gene types
const GENE_TYPE_LABELS = {
  protein_coding:                    "Protein-coding",
  lncRNA:                            "Long non-coding RNA",
  pseudogene:                        "Pseudogene",
  transcribed_unprocessed_pseudogene:"Pseudogene",
  processed_pseudogene:              "Pseudogene",
  unprocessed_pseudogene:            "Pseudogene",
  miRNA:                             "microRNA",
  snRNA:                             "Small nuclear RNA",
  snoRNA:                            "Small nucleolar RNA",
  rRNA:                              "Ribosomal RNA",
  misc_RNA:                          "Miscellaneous RNA",
  TEC:                               "To be experimentally confirmed",
};

export default function BookReader({ chromosome, activeGeneId, onGeneSelect, onGeneLoad, chromLength }) {
  const [gene,       setGene]       = useState(null);
  const [story,      setStory]      = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [neighbours, setNeighbours] = useState({ prev: null, next: null });
  const [bands,      setBands]      = useState([]);
  const [chromInfo,  setChromInfo]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const streamRef = useRef(null); // holds the active EventSource

  // ── Load chromosome cytobands once per chromosome ──────────────────────────
  useEffect(() => {
    fetchCytobands(chromosome)
      .then((data) => setBands(data.bands))
      .catch(() => setBands([]));
  }, [chromosome]);

  // ── Load the first gene when chromosome changes and no gene is selected ─────
  useEffect(() => {
    if (activeGeneId) return; // a specific gene is already selected

    fetchGenes(chromosome, 1, 1)
      .then((data) => {
        if (data.genes.length > 0) {
          setChromInfo({ total: data.total });
          onGeneSelect(data.genes[0].gene_id, chromosome);
        }
      })
      .catch((err) => setError(err.message));
  }, [chromosome, activeGeneId, onGeneSelect]);

  // ── Load gene + stream story whenever the active gene changes ──────────────
  useEffect(() => {
    if (!activeGeneId) return;

    // Close any existing stream
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }

    setLoading(true);
    setStory("");
    setError(null);
    setStreaming(false);

    // Fetch gene metadata and neighbours in parallel
    Promise.all([
      fetchGene(activeGeneId),
      fetchNeighbours(activeGeneId),
    ])
      .then(([geneData, neighbourData]) => {
        setGene(geneData);
        if (onGeneLoad && chromLength && geneData.start_pos != null) {
          onGeneLoad(geneData.start_pos / chromLength);
        }
        setNeighbours(neighbourData);
        setLoading(false);

        // Open SSE stream for the story
        setStreaming(true);
        const source = openStoryStream(activeGeneId);
        streamRef.current = source;

        source.onmessage = (event) => {
          const msg = JSON.parse(event.data);

          if (msg.type === "chunk") {
            setStory((prev) => prev + msg.text);
          } else if (msg.type === "done") {
            setStreaming(false);
            source.close();
            streamRef.current = null;
          } else if (msg.type === "error") {
            setError(`Story generation failed: ${msg.message}`);
            setStreaming(false);
            source.close();
            streamRef.current = null;
          }
        };

        source.onerror = () => {
          setError("Lost connection to the story stream. Please try refreshing.");
          setStreaming(false);
          source.close();
          streamRef.current = null;
        };
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    // Cleanup: close stream if component unmounts or gene changes
    return () => {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, [activeGeneId]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goToPrev = useCallback(() => {
    if (neighbours.prev) onGeneSelect(neighbours.prev.gene_id, chromosome);
  }, [neighbours.prev, chromosome, onGeneSelect]);

  const goToNext = useCallback(() => {
    if (neighbours.next) onGeneSelect(neighbours.next.gene_id, chromosome);
  }, [neighbours.next, chromosome, onGeneSelect]);

  // Keyboard navigation: arrow keys
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === "INPUT") return; // don't capture while in search
      if (e.key === "ArrowLeft")  goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToPrev, goToNext]);

  // ── Chromosome display name ─────────────────────────────────────────────────
  function chromDisplay(name) {
    if (name === "chrM") return "Mitochondrial DNA";
    return `Chromosome ${name.replace("chr", "")}`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="reader-error">
        <p>{error}</p>
        <button onClick={() => setError(null)}>Try again</button>
      </div>
    );
  }

  return (
    <div className="book-reader">

      {/* ── Chapter heading ─────────────────────────────────────────── */}
      <div className="chapter-heading">
        <span className="chapter-label">Chapter</span>
        <h2 className="chapter-title">{chromDisplay(chromosome)}</h2>
      </div>

      {/* ── Chromosome ideogram ─────────────────────────────────────── */}
      {gene && bands.length > 0 && (
        <ChromosomeIdeogram
          bands={bands}
          chromLength={gene.end_pos + 1000000} // approximate; will be refined
          gene={gene}
        />
      )}

      {/* ── Gene content ────────────────────────────────────────────── */}
      {loading ? (
        <div className="reader-loading">
          <div className="loading-pulse" />
          <span>Loading gene…</span>
        </div>
      ) : gene ? (
        <div className="book-wrap">
        <article className="gene-article">
          <BookmarkButton geneId={gene.gene_id} />

          {/* Gene header */}
          <header className="gene-header">
            <div className="gene-title-row">
              <h1 className="gene-name">{gene.gene_name}</h1>
              <span className={`gene-type-badge type-${gene.gene_type}`}>
                {GENE_TYPE_LABELS[gene.gene_type] ?? gene.gene_type}
              </span>
            </div>
            <div className="gene-meta">
              <span>{chromDisplay(chromosome)}</span>
              <span className="meta-sep">·</span>
              <span>{gene.start_pos?.toLocaleString()} – {gene.end_pos?.toLocaleString()}</span>
              <span className="meta-sep">·</span>
              <span>{gene.strand === "+" ? "Forward strand" : "Reverse strand"}</span>
              <span className="meta-sep">·</span>
              <span>{gene.exon_count} exons</span>
              <span className="meta-sep">·</span>
              <span>{gene.gene_length?.toLocaleString()} bp</span>
            </div>
          </header>

          {/* Story text */}
          <div className="story-text">
            {story ? (
              <>
                {story.split("\n\n").map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
                {streaming && <span className="cursor-blink" aria-hidden="true">▍</span>}
              </>
            ) : streaming ? (
              <div className="story-generating">
                <span className="cursor-blink" aria-hidden="true">▍</span>
                <span className="generating-label">Writing gene story…</span>
              </div>
            ) : (
              <p className="story-empty">No story available for this gene.</p>
            )}
          </div>

          {/* Ensembl ID footnote */}
          <footer className="gene-footer">
            <span className="ensembl-id">Ensembl: {gene.gene_id}</span>
            {gene.transcript_count > 0 && (
              <span className="transcript-count">
                {gene.transcript_count} transcript{gene.transcript_count !== 1 ? "s" : ""}
              </span>
            )}
          </footer>
        </article>
        </div>
      ) : null}

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="book-nav">
        <button
          className="nav-btn nav-prev"
          onClick={goToPrev}
          disabled={!neighbours.prev}
          title={neighbours.prev ? `← ${neighbours.prev.gene_name}` : "First gene"}
        >
          {neighbours.prev ? (
            <>← <span className="nav-gene-name">{neighbours.prev.gene_name}</span></>
          ) : (
            "← First gene"
          )}
        </button>

        <button
          className="nav-btn nav-next"
          onClick={goToNext}
          disabled={!neighbours.next}
          title={neighbours.next ? `${neighbours.next.gene_name} →` : "Last gene"}
        >
          {neighbours.next ? (
            <><span className="nav-gene-name">{neighbours.next.gene_name}</span> →</>
          ) : (
            "Last gene →"
          )}
        </button>
      </nav>
    </div>
  );
}
