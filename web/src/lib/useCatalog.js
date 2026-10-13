import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// Neon marks a repo 'ready' once indexing finishes; the UI calls that shelved.
const toItem = (repo) => ({ ...repo, status: repo.status === 'ready' ? 'shelved' : 'queued' });

/** The signed-in user's shelf of repos, kept in Neon. */
export function useCatalog() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api
      .repos()
      .then(({ repos }) => setItems(repos.map(toItem)))
      .catch((error) => toast.error('Could not load your catalogue', { description: error.message }));
  }, []);

  const add = useCallback((entry) => {
    setItems((prev) => [toItem(entry), ...prev.filter((i) => i.url !== entry.url)]);
  }, []);

  const setStatus = useCallback((url, status) => {
    setItems((prev) => prev.map((i) => (i.url === url ? { ...i, status } : i)));
  }, []);

  const remove = useCallback((url) => {
    setItems((prev) => prev.filter((i) => i.url !== url));
    api
      .removeRepo(url)
      .catch((error) => toast.error('Could not remove that repository', { description: error.message }));
  }, []);

  return { items, add, setStatus, remove };
}
