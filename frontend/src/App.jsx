/**
 * App.jsx — updated to include ChromosomeOverview strip and bookmark support.
 *
 * Changes from original:
 *   1. Imports ChromosomeOverview
 *   2. Tracks genePositionFraction (for the overview gene marker)
 *   3. Passes onGeneLoad callback to BookReader
 *   4. Renders <ChromosomeOverview> in a strip between top-bar and main-layout
 */
import { useCallback, useEffect, useState } from 'react';
import BookReader from './components/BookReader';
import ChapterList from './components/ChapterList';
import ChromosomeOverview from './components/ChromosomeOverview';
import SearchBar from './components/SearchBar';
import { fetchChromosomes } from './api';

export default function App() {
  const [chromosomes,       setChromosomes]       = useState([]);
  const [activeChromosome,  setActiveChromosome]  = useState(null);
  const [activeGeneId,      setActiveGeneId]      = useState(null);
  const [genePosFraction,   setGenePosFraction]   = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState(null);

  // Load chromosome list on first render
  useEffect(() => {
    fetchChromosomes()
      .then((data) => {
        setChromosomes(data.chromosomes);

        const savedGeneId = localStorage.getItem('lastGeneId');
        const savedChrom  = localStorage.getItem('lastChromosome');

        if (savedChrom && savedGeneId) {
          setActiveChromosome(savedChrom);
          setActiveGeneId(savedGeneId);
        } else if (data.chromosomes.length > 0) {
          setActiveChromosome(data.chromosomes[0].name);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleGeneSelect = useCallback((geneId, chromosome) => {
    setActiveGeneId(geneId);
    setActiveChromosome(chromosome);
    setGenePosFraction(null); // reset until BookReader reports back
    localStorage.setItem('lastGeneId',     geneId);
    localStorage.setItem('lastChromosome', chromosome);
  }, []);

  const handleChromosomeSelect = useCallback((chrom) => {
    setActiveChromosome(chrom);
    setActiveGeneId(null);
    setGenePosFraction(null);
    localStorage.setItem('lastChromosome', chrom);
    localStorage.removeItem('lastGeneId');
  }, []);

  /**
   * Called by BookReader once the gene and chromosome length are known.
   * fraction = gene.start_pos / chromosome.length  (0–1)
   */
  const handleGeneLoad = useCallback((fraction) => {
    setGenePosFraction(fraction);
  }, []);

  // Find the length of the active chromosome (for BookReader)
  const activeChromData = chromosomes.find(c => c.name === activeChromosome);

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

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-title">
          <span className="book-icon">◈</span>
          <span>Gene Story</span>
        </div>
        <SearchBar onGeneSelect={handleGeneSelect} />
      </header>

      {/* ── All-chromosomes overview strip ──────────────────────────── */}
      <div className="chr-overview-strip">
        <ChromosomeOverview
          chromosomes={chromosomes}
          activeChromosome={activeChromosome}
          genePositionFraction={genePosFraction}
          onSelect={handleChromosomeSelect}
        />
      </div>

      {/* ── Main layout: sidebar + reader ───────────────────────────── */}
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
              onGeneLoad={handleGeneLoad}
              chromLength={activeChromData?.length}
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
