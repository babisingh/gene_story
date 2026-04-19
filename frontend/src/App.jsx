import { useCallback, useEffect, useState } from 'react';
import BookReader from './components/BookReader';
import ChapterList from './components/ChapterList';
import ChromosomeOverview from './components/ChromosomeOverview';
import SearchBar from './components/SearchBar';
import { fetchChromosomes } from './api';

export default function App() {
  const [chromosomes,      setChromosomes]      = useState([]);
  const [activeChromosome, setActiveChromosome] = useState(null);
  const [activeGeneId,     setActiveGeneId]     = useState(null);
  const [genePosFraction,  setGenePosFraction]  = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);

  useEffect(()=>{
    fetchChromosomes()
      .then(data=>{
        setChromosomes(data.chromosomes);
        const gId=localStorage.getItem('lastGeneId');
        const chr=localStorage.getItem('lastChromosome');
        if(chr&&gId){ setActiveChromosome(chr); setActiveGeneId(gId); }
        else if(data.chromosomes.length>0) setActiveChromosome(data.chromosomes[0].name);
      })
      .catch(err=>setError(err.message))
      .finally(()=>setLoading(false));
  },[]);

  const handleGeneSelect=useCallback((geneId,chromosome)=>{
    setActiveGeneId(geneId); setActiveChromosome(chromosome); setGenePosFraction(null);
    localStorage.setItem('lastGeneId',geneId); localStorage.setItem('lastChromosome',chromosome);
  },[]);

  const handleChromosomeSelect=useCallback(chrom=>{
    setActiveChromosome(chrom); setActiveGeneId(null); setGenePosFraction(null);
    localStorage.setItem('lastChromosome',chrom); localStorage.removeItem('lastGeneId');
  },[]);

  const handleGeneLoad=useCallback(fraction=>{ setGenePosFraction(fraction); },[]);

  const activeChromData=chromosomes.find(c=>c.name===activeChromosome);

  if(loading) return <div className="loading-screen"><div className="loading-text">Opening Gene Story…</div></div>;
  if(error) return <div className="error-screen"><h2>Could not connect to the Gene Story API</h2><p>{error}</p><p>Make sure the API is running: <code>docker compose up -d</code></p></div>;

  return (
    <div className="app-layout">
      <header className="top-bar">
        <div className="top-bar-title"><span className="book-icon">◈</span><span>Gene Story</span></div>
        <SearchBar onGeneSelect={handleGeneSelect}/>
      </header>
      <div className="chr-overview-strip">
        <ChromosomeOverview chromosomes={chromosomes} activeChromosome={activeChromosome}
          genePositionFraction={genePosFraction} onSelect={handleChromosomeSelect}/>
      </div>
      <div className="main-layout">
        <ChapterList chromosomes={chromosomes} activeChromosome={activeChromosome}
          activeGeneId={activeGeneId} onChromosomeSelect={handleChromosomeSelect}/>
        <main className="reader-area">
          {activeChromosome
            ? <BookReader chromosome={activeChromosome} activeGeneId={activeGeneId}
                onGeneSelect={handleGeneSelect} onGeneLoad={handleGeneLoad}
                chromLength={activeChromData?.length}/>
            : <div className="welcome"><h1>Welcome to Gene Story</h1><p>Select a chromosome to begin reading.</p></div>
          }
        </main>
      </div>
    </div>
  );
}
