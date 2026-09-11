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

export const api = {
  health: () => request('/health'),

  indexRepo: ({ url, branch }) =>
    request('/repos', { method: 'POST', body: JSON.stringify({ url, branch }) }),

  ask: ({ question, repo }) =>
    request('/ask', { method: 'POST', body: JSON.stringify({ question, repo }) }),

  // Cheap "has anything landed yet?" check — retrieval only, no model call.
  probe: (repo) =>
    request(`/search?q=overview&topK=1&repo=${encodeURIComponent(repo)}`),
};

const GITHUB_URL = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export function parseRepo(input) {
  const match = GITHUB_URL.exec(input.trim());
  if (!match) return null;
  const [, owner, name] = match;
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}
