import { useCallback, useEffect, useState } from 'react';

const KEY = 'git-wiki.catalog';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** The shelf of repos this browser has accessioned. */
export function useCatalog() {
  const [items, setItems] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* private mode — the catalogue just won't persist */
    }
  }, [items]);

  const add = useCallback((entry) => {
    setItems((prev) => [
      { ...entry, accessionedAt: Date.now(), status: 'queued' },
      ...prev.filter((i) => i.url !== entry.url),
    ]);
  }, []);

  const setStatus = useCallback((url, status) => {
    setItems((prev) => prev.map((i) => (i.url === url ? { ...i, status } : i)));
  }, []);

  const remove = useCallback((url) => {
    setItems((prev) => prev.filter((i) => i.url !== url));
  }, []);

  return { items, add, setStatus, remove };
}
