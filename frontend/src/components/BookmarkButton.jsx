/**
 * BookmarkButton — a ribbon-style toggle that bookmarks the current gene.
 *
 * Reads/writes to localStorage under the key 'gs_bookmarks' (a JSON array
 * of gene_id strings). Renders a filled ribbon when bookmarked.
 *
 * Props:
 *   geneId  — string, the Ensembl gene ID (e.g. 'ENSG00000012048')
 *
 * Usage inside gene-article:
 *   <BookmarkButton geneId={gene.gene_id} />
 *
 * The button is positioned absolutely — make sure .gene-article has
 * `position: relative` (the dark theme CSS already sets this).
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'gs_bookmarks';

function loadBookmarks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveBookmarks(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export default function BookmarkButton({ geneId }) {
  const [bookmarked, setBookmarked] = useState(false);

  // Sync with localStorage whenever geneId changes
  useEffect(() => {
    setBookmarked(loadBookmarks().has(geneId));
  }, [geneId]);

  const toggle = useCallback(() => {
    const bookmarks = loadBookmarks();
    if (bookmarks.has(geneId)) {
      bookmarks.delete(geneId);
    } else {
      bookmarks.add(geneId);
    }
    saveBookmarks(bookmarks);
    setBookmarked(bookmarks.has(geneId));
  }, [geneId]);

  return (
    <button
      className={`bookmark-btn ${bookmarked ? 'bookmarked' : ''}`}
      onClick={toggle}
      title={bookmarked ? 'Remove bookmark' : 'Bookmark this gene'}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this gene'}
      aria-pressed={bookmarked}
    >
      <svg
        width="18" height="22"
        viewBox="0 0 18 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 1h16v20l-8-5-8 5V1z"
          fill={bookmarked ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
