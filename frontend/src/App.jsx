import { useEffect, useState, useCallback } from "react";
import ChapterList from "./components/ChapterList";
import BookReader from "./components/BookReader";
import SearchBar from "./components/SearchBar";
import { fetchChromosomes } from "./api";

/**
 * App — root component and state orchestrator.
 *
 * Manages:
 *   chromosomes      — list of all chromosomes (loaded once on mount)
 *   activeChromosome — which chromosome chapter is currently open
 *   activeGeneId     — which gene is currently being read
 *
 * Reading position is persisted to localStorage so the user can
 * resume where they left off on their next visit.
 */
export default function App() {
  const [chromosomes, setChromosomes]           = useState([]);
  const [activeChromosome, setActiveChromosome] = useState(null);
  const [activeGeneId, setActiveGeneId]         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);

  // Load chromosome list on first render
  useEffect(() => {
    fetchChromosomes()
      .then((data) => {
        setChromosomes(data.chromosomes);

        // Restore last reading position from localStorage
        const savedGeneId = localStorage.getItem("lastGeneId");
        const savedChrom  = localStorage.getItem("lastChromosome");

        if (savedChrom && savedGeneId) {
          setActiveChromosome(savedChrom);
          setActiveGeneId(savedGeneId);
        } else if (data.chromosomes.length > 0) {
          // Default to the first chromosome
          setActiveChromosome(data.chromosomes[0].name);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // When the user navigates to a gene, save to localStorage
  const handleGeneSelect = useCallback((geneId, chromosome) => {
    setActiveGeneId(geneId);
    setActiveChromosome(chromosome);
    localStorage.setItem("lastGeneId",     geneId);
    localStorage.setItem("lastChromosome", chromosome);
  }, []);

  const handleChromosomeSelect = useCallback((chrom) => {
    setActiveChromosome(chrom);
    setActiveGeneId(null); // will load the first gene of the chapter
    localStorage.setItem("lastChromosome", chrom);
    localStorage.removeItem("lastGeneId");
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-text">Opening Gene Story…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Could not connect to the Gene Story API</h2>
        <p>{error}</p>
        <p>Make sure the API server is running: <code>docker compose up -d</code></p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-title">
          <span className="book-icon">📖</span>
          <span>Gene Story</span>
        </div>
        <SearchBar onGeneSelect={handleGeneSelect} />
      </header>

      {/* ── Main layout: sidebar + reader ───────────────────────────────── */}
      <div className="main-layout">
        <ChapterList
          chromosomes={chromosomes}
          activeChromosome={activeChromosome}
          activeGeneId={activeGeneId}
          onChromosomeSelect={handleChromosomeSelect}
        />

        <main className="reader-area">
          {activeChromosome ? (
            <BookReader
              chromosome={activeChromosome}
              activeGeneId={activeGeneId}
              onGeneSelect={handleGeneSelect}
            />
          ) : (
            <div className="welcome">
              <h1>Welcome to Gene Story</h1>
              <p>Select a chromosome from the left panel to begin reading.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
