/**
 * SearchBar — jump to any gene by name.
 *
 * Appears in the top bar. As the user types, it queries the API
 * and shows a dropdown of matching genes.
 * Clicking a result navigates to that gene.
 */
import { useEffect, useRef, useState } from "react";
import { searchGenes } from "../api";

export default function SearchBar({ onGeneSelect }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef  = useRef(null);

  // Debounce: wait 300ms after typing stops before querying
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(gene) {
    onGeneSelect(gene.gene_id, gene.chromosome);
    setQuery("");
    setOpen(false);
    setResults([]);
  }

  // Map gene_type to a short readable label
  function typeLabel(geneType) {
    const labels = {
      protein_coding:   "protein",
      lncRNA:           "lncRNA",
      pseudogene:       "pseudo",
      miRNA:            "miRNA",
      snRNA:            "snRNA",
      snoRNA:           "snoRNA",
      rRNA:             "rRNA",
    };
    return labels[geneType] ?? geneType?.replace(/_/g, " ") ?? "";
  }

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        className="search-input"
        type="text"
        placeholder="Search gene…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search for a gene"
      />
      {loading && <span className="search-spinner" aria-hidden="true" />}

      {open && (
        <ul className="search-dropdown" role="listbox">
          {results.map((gene) => (
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
          ))}
        </ul>
      )}
    </div>
  );
}
