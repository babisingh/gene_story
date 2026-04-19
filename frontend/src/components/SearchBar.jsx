import { useCallback, useEffect, useRef, useState } from 'react';
import { searchGenes } from '../api';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const typeLabel = t => ({protein_coding:'protein',lncRNA:'lncRNA',pseudogene:'pseudo',processed_pseudogene:'pseudo',unprocessed_pseudogene:'pseudo',transcribed_unprocessed_pseudogene:'pseudo',miRNA:'miRNA',snRNA:'snRNA',snoRNA:'snoRNA',rRNA:'rRNA'}[t]??t?.replace(/_/g,' ')?? '');

export default function SearchBar({ onGeneSelect }) {
  const [query,  setQuery]  = useState('');
  const [results,setResults]= useState([]);
  const [open,   setOpen]   = useState(false);
  const [loading,setLoading]= useState(false);
  const [letter, setLetter] = useState(null);
  const debounce = useRef(null);
  const wrapper  = useRef(null);

  useEffect(()=>{
    if(debounce.current) clearTimeout(debounce.current);
    if(query.trim()) setLetter(null);
    if(query.trim().length<2){ if(!letter){setResults([]);setOpen(false);} return; }
    debounce.current=setTimeout(async()=>{
      setLoading(true);
      try{ const d=await searchGenes(query.trim()); setResults(d.results); setOpen(d.results.length>0); }
      catch{ setResults([]); } finally{ setLoading(false); }
    },300);
  },[query]);

  useEffect(()=>{
    if(!letter) return;
    (async()=>{ setLoading(true);
      try{ const d=await searchGenes(letter);
        setResults(d.results.filter(g=>g.gene_name?.toUpperCase().startsWith(letter)));
        setOpen(true); }
      catch{ setResults([]); } finally{ setLoading(false); }
    })();
  },[letter]);

  useEffect(()=>{
    const h=e=>{ if(wrapper.current&&!wrapper.current.contains(e.target)){setOpen(false);setLetter(null);} };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  const select=g=>{ onGeneSelect(g.gene_id,g.chromosome); setQuery(''); setLetter(null); setOpen(false); setResults([]); };
  const clickLetter=useCallback(l=>{ setQuery(''); setLetter(p=>p===l?null:l); },[]);

  return (
    <div className="search-wrapper" ref={wrapper}>
      <input className="search-input" type="text"
        placeholder={letter?`Genes starting with "${letter}"…`:'Search gene…'}
        value={query} onChange={e=>setQuery(e.target.value)}
        onFocus={()=>{ if(results.length>0||letter) setOpen(true); }}
        aria-label="Search for a gene"/>
      {loading&&<span className="search-spinner" aria-hidden="true"/>}
      {open&&(
        <ul className="search-dropdown" role="listbox">
          {!query.trim()&&(
            <li role="presentation">
              <div className="search-alpha-bar">
                {ALPHA.map(l=>(
                  <button key={l} className={`search-alpha-btn${letter===l?' active':''}`}
                    onClick={()=>clickLetter(l)} tabIndex={-1}>{l}</button>
                ))}
              </div>
            </li>
          )}
          {results.length===0&&!loading
            ? <li className="search-result" style={{justifyContent:'center',color:'var(--text-faint)',fontStyle:'italic',fontSize:'13px'}}>
                {letter?`No genes starting with "${letter}"`:'No results'}
              </li>
            : results.map(g=>(
              <li key={g.gene_id} className="search-result" role="option" onClick={()=>select(g)}>
                <span className="search-result-name">{g.gene_name}</span>
                <span className="search-result-meta">
                  <span className="search-result-chrom">{g.chromosome}</span>
                  <span className="search-result-type">{typeLabel(g.gene_type)}</span>
                </span>
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}
