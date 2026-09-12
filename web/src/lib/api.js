const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// A full-page navigation, not a fetch — the browser has to visit GitHub.
export const LOGIN_URL = `${BASE}/auth/github`;

export const api = {
  health: () => request('/health'),

  me: () => request('/me'),

  logout: () => request('/auth/logout', { method: 'POST' }),

  // The signed-in user's shelved repos, from Neon.
  repos: () => request('/repos'),

  // The signed-in user's public repos on GitHub — what they may shelve.
  githubRepos: () => request('/github/repos'),

  indexRepo: ({ url, branch }) =>
    request('/repos', { method: 'POST', body: JSON.stringify({ url, branch }) }),

  removeRepo: (url) => request(`/repos?url=${encodeURIComponent(url)}`, { method: 'DELETE' }),

  ask: ({ question, repo }) =>
    request('/ask', { method: 'POST', body: JSON.stringify({ question, repo }) }),

  // Cheap "has anything landed yet?" check — retrieval only, no model call.
  probe: (repo) =>
    request(`/search?q=overview&topK=1&repo=${encodeURIComponent(repo)}`),
};
