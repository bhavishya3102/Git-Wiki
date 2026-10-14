import { neon } from '@neondatabase/serverless';
import { parseRepoUrl } from './github.js';
import { encrypt, decrypt } from './crypto.js';

let sql;
let ready;

// Connects and creates the tables on first use, like the Pinecone index, so
// the server still boots without DATABASE_URL.
async function db() {
  sql ??= neon(process.env.DATABASE_URL);
  ready ??= createTables().catch((err) => {
    ready = undefined; // let the next request try again
    throw err;
  });
  await ready;
  return sql;
}

async function createTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      github_id  BIGINT UNIQUE NOT NULL,
      login      TEXT NOT NULL,
      name       TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Users only add their own repos, so each repo belongs to exactly one user.
  await sql`
    CREATE TABLE IF NOT EXISTS repos (
      url        TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner      TEXT NOT NULL,
      name       TEXT NOT NULL,
      branch     TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'queued',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Token columns — added after the initial schema, so ALTER not CREATE.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token_enc TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_scopes TEXT`;
}

// Keyed on the GitHub id, so a renamed account keeps its row.
export async function upsertUser(profile, { token, scopes } = {}) {
  const sql = await db();
  if (token && !process.env.TOKEN_ENC_KEY) {
    console.warn('⚠️  TOKEN_ENC_KEY is not set — the GitHub token will NOT be stored. Set it in your environment.');
  }
  const encToken = token && process.env.TOKEN_ENC_KEY
    ? encrypt(token, process.env.TOKEN_ENC_KEY)
    : null;
  const scopeStr = scopes ?? null;
  const [user] = await sql`
    INSERT INTO users (github_id, login, name, avatar_url, github_token_enc, token_scopes)
    VALUES (${profile.id}, ${profile.login}, ${profile.name}, ${profile.avatar_url},
            ${encToken}, ${scopeStr})
    ON CONFLICT (github_id) DO UPDATE
      SET login = EXCLUDED.login, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url,
          github_token_enc = COALESCE(EXCLUDED.github_token_enc, users.github_token_enc),
          token_scopes = COALESCE(EXCLUDED.token_scopes, users.token_scopes)
    RETURNING id, login, name, avatar_url, token_scopes`;
  return user;
}

export async function getUser(id) {
  const sql = await db();
  const [user] = await sql`SELECT id, login, name, avatar_url, token_scopes FROM users WHERE id = ${id}`;
  return user;
}

// Decrypts and returns the user's stored GitHub token; null if missing.
export async function getUserToken(userId) {
  const sql = await db();
  const [row] = await sql`SELECT github_token_enc FROM users WHERE id = ${userId}`;
  if (!row?.github_token_enc || !process.env.TOKEN_ENC_KEY) return null;
  return decrypt(row.github_token_enc, process.env.TOKEN_ENC_KEY);
}

// Re-adding a repo resets it to queued, which is also how a failed index is retried.
export async function saveRepo(userId, { url, owner, name, branch }) {
  const sql = await db();
  await sql`
    INSERT INTO repos (url, user_id, owner, name, branch)
    VALUES (${url}, ${userId}, ${owner}, ${name}, ${branch})
    ON CONFLICT (url) DO UPDATE
      SET branch = EXCLUDED.branch, status = 'queued'
      WHERE repos.user_id = EXCLUDED.user_id`;
}

export async function getRepoForUser(userId, url) {
  const sql = await db();
  const [repo] = await sql`
    SELECT url, owner, name, branch, status FROM repos
    WHERE user_id = ${userId} AND url = ${url}`;
  if (repo) return repo;

  const parsed = parseRepoUrl(url);
  if (!parsed) return repo;

  const [named] = await sql`
    SELECT url, owner, name, branch, status FROM repos
    WHERE user_id = ${userId}
      AND lower(owner) = ${parsed.owner.toLowerCase()}
      AND lower(name) = ${parsed.name.toLowerCase()}`;
  return named;
}

export async function listRepos(userId) {
  const sql = await db();
  return sql`
    SELECT url, owner, name, branch, status FROM repos
    WHERE user_id = ${userId} ORDER BY created_at DESC`;
}

export async function removeRepo(userId, url) {
  const sql = await db();
  await sql`DELETE FROM repos WHERE user_id = ${userId} AND url = ${url}`;
}

export async function markRepoReady(url) {
  const sql = await db();
  await sql`UPDATE repos SET status = 'ready' WHERE url = ${url}`;
}
