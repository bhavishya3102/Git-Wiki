const API = 'https://api.github.com';
const GITHUB_URL = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export function parseRepoUrl(input) {
  const match = GITHUB_URL.exec(String(input).trim());
  if (!match) return null;
  const [, owner, name] = match;
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

// Why a repo can't be added, or null when it can: users may only add their
// own public repos.
export function ownRepoError(login, repo) {
  if (!repo) return 'Repository not found on GitHub.';
  if (repo.private) return 'Only public repositories can be added.';
  if (repo.owner.login.toLowerCase() !== login.toLowerCase()) {
    return 'You can only add your own repositories.';
  }
  return null;
}

// Public reads go through the server's GITHUB_TOKEN (when set) for the higher
// rate limit. Resolves to null on 404.
async function gh(path, token = process.env.GITHUB_TOKEN) {
  const res = await fetch(API + path, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'git-wiki',
      ...(token && { authorization: `Bearer ${token}` }),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${path} failed (${res.status})`);
  return res.json();
}

export const getRepo = (owner, name) => gh(`/repos/${owner}/${name}`);

export const listPublicRepos = (login) =>
  gh(`/users/${login}/repos?type=owner&sort=updated&per_page=100`);

// Trades the OAuth callback code for the user's profile. The access token is
// used once here and never stored — public repos don't need it again.
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
  const { access_token, error_description } = await res.json();
  if (!access_token) throw new Error(error_description || 'GitHub did not return an access token');
  return gh('/user', access_token);
}
