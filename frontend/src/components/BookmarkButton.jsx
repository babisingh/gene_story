import { useCallback, useEffect, useState } from 'react';
const KEY = 'gs_bookmarks';
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY)||'[]')); } catch { return new Set(); } };
const save = s => localStorage.setItem(KEY, JSON.stringify([...s]));

export default function BookmarkButton({ geneId }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(load().has(geneId)); }, [geneId]);
  const toggle = useCallback(() => {
    const s = load();
    s.has(geneId) ? s.delete(geneId) : s.add(geneId);
    save(s); setOn(s.has(geneId));
  }, [geneId]);
  return (
    <button className={`bookmark-btn ${on?'bookmarked':''}`} onClick={toggle}
      title={on?'Remove bookmark':'Bookmark this gene'} aria-pressed={on}>
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <path d="M1 1h16v20l-8-5-8 5V1z" fill={on?'currentColor':'none'}
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
