const API = 'https://api.github.com';
const GITHUB_URL = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export function parseRepoUrl(input) {
  const match = GITHUB_URL.exec(String(input).trim());
  if (!match) return null;
  const [, owner, name] = match;
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

// Why a repo can't be added, or null when it can: users may only add their
// own repos (public or private).
export function ownRepoError(login, repo) {
  if (!repo) return 'Repository not found on GitHub.';
  if (repo.owner.login.toLowerCase() !== login.toLowerCase()) {
    return 'You can only add your own repositories.';
  }
  return null;
}

export function mapPull(pull) {
  return {
    number: pull.number,
    title: pull.title,
    state: pull.state,
    draft: Boolean(pull.draft),
    url: pull.html_url,
    updatedAt: pull.updated_at,
    author: pull.user?.login ?? null,
  };
}

export function mapPullDetail(pull) {
  return {
    ...mapPull(pull),
    body: pull.body ?? null,
    commits: pull.commits ?? 0,
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFiles: pull.changed_files ?? 0,
    head: { sha: pull.head?.sha, ref: pull.head?.ref },
  };
}

export async function collectAllPullFiles(listPage, { perPage = 100 } = {}) {
  const files = [];
  for (let page = 1; ; page++) {
    const batch = await listPage(page, perPage);
    files.push(...batch);
    if (batch.length < perPage) break;
  }
  return files;
}

export function mapPullFile(file) {
  return {
    filename: file.filename,
    status: file.status,
    changes: file.changes,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
    previous_filename: file.previous_filename ?? null,
  };
}

// Public reads go through the server's GITHUB_TOKEN (when set) for the higher
// rate limit. Resolves to null on 404.
async function gh(path, { token = process.env.GITHUB_TOKEN, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'git-wiki',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body && { 'content-type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`GitHub ${path} failed (${res.status})`);
  if (res.status === 204) return null;
  return res.json();
}

export const getRepo = (owner, name, token) =>
  gh(`/repos/${owner}/${name}`, { token });

export async function listOpenPulls(owner, name, token) {
  const pulls = (await gh(`/repos/${owner}/${name}/pulls?state=open&per_page=100`, { token })) ?? [];
  return pulls.map(mapPull);
}

export async function getPull(owner, name, number, token) {
  const pull = await gh(`/repos/${owner}/${name}/pulls/${number}`, { token });
  return pull && mapPull({ ...pull, html_url: pull.html_url });
}

export async function getPullDetail(owner, name, number, token) {
  const pull = await gh(`/repos/${owner}/${name}/pulls/${number}`, { token });
  return pull && mapPullDetail(pull);
}

export async function listPullFiles(owner, name, number, page = 1, perPage = 20, token) {
  const files =
    (await gh(`/repos/${owner}/${name}/pulls/${number}/files?per_page=${perPage}&page=${page}`, { token })) ?? [];
  return files.map(mapPullFile);
}

export async function createIssueComment(owner, name, number, body, token) {
  return gh(`/repos/${owner}/${name}/issues/${number}/comments`, {
    token,
    method: 'POST',
    body: { body },
  });
}

// Lists both public and private repos when called with the user's own token.
export const listUserRepos = (login, token) =>
  gh(`/user/repos?type=owner&sort=updated&per_page=100&affiliation=owner`, { token });

// Fallback for unauthenticated listing (public repos only).
export const listPublicRepos = (login) =>
  gh(`/users/${login}/repos?type=owner&sort=updated&per_page=100`);

// Trades the OAuth callback code for the user's profile, token and granted
// scopes. The token is stored encrypted in the DB for per-user API calls.
export async function fetchUserFromCode(code, redirectUri) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const { access_token, scope, error_description } = await res.json();
  if (!access_token) throw new Error(error_description || 'GitHub did not return an access token');
  const profile = await gh('/user', { token: access_token });
  return { profile, token: access_token, scopes: scope ?? '' };
}
