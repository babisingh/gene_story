/**
 * SearchBar — jump to any gene by name or symbol.
 *
 * Enhanced version of the original SearchBar with an A–Z alphabet filter.
 * When the dropdown is open and the query is empty, a row of letter buttons
 * appears at the top — clicking one filters results to genes starting with
 * that letter (uses the gene_name field from search results).
 *
 * Drop-in replacement for frontend/src/components/SearchBar.jsx.
 * No API changes required — uses the same searchGenes() helper.
 *
 * Props:
 *   onGeneSelect(geneId, chromosome) — called when user picks a gene
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchGenes } from '../api';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Gene types mapped to short labels for the badge
function typeLabel(geneType) {
  const labels = {
    protein_coding:   'protein',
    lncRNA:           'lncRNA',
    pseudogene:       'pseudo',
    processed_pseudogene: 'pseudo',
    unprocessed_pseudogene: 'pseudo',
    transcribed_unprocessed_pseudogene: 'pseudo',
    miRNA:            'miRNA',
    snRNA:            'snRNA',
    snoRNA:           'snoRNA',
    rRNA:             'rRNA',
  };
  return labels[geneType] ?? geneType?.replace(/_/g, ' ') ?? '';
}

export default function SearchBar({ onGeneSelect }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [open,         setOpen]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [letterFilter, setLetterFilter] = useState(null);

  const debounceRef = useRef(null);
  const wrapperRef  = useRef(null);

  // ── Fetch on query change (debounced 300 ms) ────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Clear letter filter whenever the user types
    if (query.trim()) setLetterFilter(null);

    if (query.trim().length < 2) {
      if (!letterFilter) {
        setResults([]);
        setOpen(false);
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchGenes(query.trim());
        setResults(data.results);
        setOpen(data.results.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  // ── Fetch on letter filter change ───────────────────────────────────────
  useEffect(() => {
    if (!letterFilter) return;

    const fetchLetter = async () => {
      setLoading(true);
      try {
        // Search for the letter — most APIs support prefix search
        const data = await searchGenes(letterFilter);
        const filtered = data.results.filter(g =>
          g.gene_name?.toUpperCase().startsWith(letterFilter)
        );
        setResults(filtered);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLetter();
  }, [letterFilter]);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setLetterFilter(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (gene) => {
    onGeneSelect(gene.gene_id, gene.chromosome);
    setQuery('');
    setLetterFilter(null);
    setOpen(false);
    setResults([]);
  };

  const handleLetterClick = useCallback((letter) => {
    setQuery('');
    setLetterFilter(prev => prev === letter ? null : letter);
  }, []);

  const showAlphaBar = open && !query.trim();

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        className="search-input"
        type="text"
        placeholder={letterFilter ? `Genes starting with "${letterFilter}"…` : 'Search gene…'}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0 || letterFilter) setOpen(true); }}
        aria-label="Search for a gene"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {loading && <span className="search-spinner" aria-hidden="true" />}

      {open && (
        <ul
          className="search-dropdown"
          role="listbox"
          aria-label="Gene search results"
        >
          {/* ── A–Z alphabet filter ───────────────────────────────── */}
          {showAlphaBar && (
            <li role="presentation">
              <div className="search-alpha-bar">
                {ALPHABET.map(letter => (
                  <button
                    key={letter}
                    className={`search-alpha-btn ${letterFilter === letter ? 'active' : ''}`}
                    onClick={() => handleLetterClick(letter)}
                    tabIndex={-1}
                    aria-label={`Filter genes starting with ${letter}`}
                    aria-pressed={letterFilter === letter}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </li>
          )}

          {/* ── Results ──────────────────────────────────────────── */}
          {results.length === 0 && !loading ? (
            <li className="search-result" style={{ justifyContent: 'center', color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '13px' }}>
              {letterFilter
                ? `No genes starting with "${letterFilter}"`
                : 'No results found'}
            </li>
          ) : (
            results.map(gene => (
              <li
                key={gene.gene_id}
                className="search-result"
                role="option"
                onClick={() => handleSelect(gene)}
              >
                <span className="search-result-name">{gene.gene_name}</span>
                <span className="search-result-meta">
                  <span className="search-result-chrom">{gene.chromosome}</span>
                  <span className="search-result-type">{typeLabel(gene.gene_type)}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
