# Git-Wiki

Express server with Inngest (background jobs) and Pinecone (vector search).

## Setup

```bash
npm install
cp .env.example .env   # add your PINECONE_API_KEY
```

## Sign-in (GitHub OAuth + Neon)

Users sign in with GitHub and can shelve only **their own public repos**.

1. Create a GitHub OAuth App at <https://github.com/settings/developers> with the
   callback URL `http://localhost:5173/api/auth/github/callback`, and put its
   `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in `.env`.
2. Set `DATABASE_URL` to a Neon connection string. The `users` and `repos`
   tables are created on first use.
3. Set `JWT_SECRET` to a long random string (`openssl rand -hex 32`).

The flow: `/auth/github` redirects to GitHub (no scopes requested) →
GitHub calls back with a `code` → the server trades it for an access token,
reads the user's profile once, upserts them into Neon, and sets an httpOnly
`session` JWT cookie. The GitHub token is not stored — public repos are read
with the server's `GITHUB_TOKEN`.

Every route below except `/health`, `/docs` and the auth routes needs that
cookie, so the `curl` examples need `-b session=<jwt>` from a signed-in browser.

## Run

Two terminals:

```bash
npm run dev       # the Express server on :3000
npm run inngest   # the Inngest Dev Server on :8288
```

## Endpoints

| Route | What it does |
| --- | --- |
| `GET /health` | Liveness check |
| `POST /docs` | `{ "id", "text" }` — emits a `doc/created` event |
| `GET /auth/github` | Starts GitHub sign-in |
| `GET /auth/github/callback` | Saves the user in Neon and sets the `session` cookie |
| `POST /auth/logout` | Clears the `session` cookie |
| `GET /me` | The signed-in user |
| `GET /github/repos` | The signed-in user's public GitHub repos |
| `GET /repos` | The signed-in user's shelved repos, with `status` (`queued` / `ready`) |
| `POST /repos` | `{ "url", "branch" }` — shelves one of *your own* public repos and emits `repo/index.requested` |
| `DELETE /repos?url=...` | Takes a repo off your shelf (its vectors stay in Pinecone) |
| `GET /search?q=...&topK=3` | Embeds the query and searches Pinecone — only your shelved repos |
| `POST /ask` | `{ "question", "repo" }` — answers the question from your indexed repos |
| `/api/inngest` | Where Inngest discovers and runs the functions |

`POST /docs` returns immediately; the `index-document` Inngest function embeds
the text and upserts it into Pinecone in the background. The index is created
on first use.

```bash
curl -X POST localhost:3000/docs -H 'content-type: application/json' \
  -d '{"id":"1","text":"git rebase rewrites commit history"}'

curl 'localhost:3000/search?q=how+do+I+rewrite+history'
```

## Indexing a GitHub repo

`POST /repos` emits `repo/index.requested`. The `index-repo` Inngest function
loads the repo with LangChain's `GithubRepoLoader`, splits it with
`RecursiveCharacterTextSplitter` (1000 chars, 100 overlap), and upserts the
chunks into Pinecone 50 at a time — each batch is its own Inngest step, so a
failed batch retries without re-downloading the repo.

```bash
curl -X POST localhost:3000/repos -H 'content-type: application/json' \
  -d '{"url":"https://github.com/octocat/Hello-World","branch":"master"}'

curl 'localhost:3000/search?q=hello'
```

Set `GITHUB_TOKEN` in `.env` to lift the unauthenticated
GitHub rate limit (60 requests/hour, which a mid-size repo will exhaust).

Note: the loader returns every chunk from a single step, and Inngest caps step
output at 4MB. Large repos need the loading split across steps (e.g. one event
per directory).

## Asking questions about a repo

`POST /ask` is synchronous — retrieval and the answer come back in one response.
It embeds the question, pulls the 6 closest chunks from Pinecone (filtered to
`repo` when given), and asks the model to answer from those chunks only,
citing them as `[1]`, `[2]`. If the chunks do not contain the answer, it says
so rather than guessing.

```bash
curl -X POST localhost:3000/ask -H 'content-type: application/json' \
  -d '{"question":"How does the repo get indexed?","repo":"https://github.com/octocat/Hello-World"}'
```

```json
{
  "answer": "...",
  "sources": [{ "source": "src/inngest/functions.js", "score": 0.82 }]
}
```

Needs `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-4o-mini`.
Omit `repo` to search across everything indexed.

## The reading room (frontend)

A React + shadcn/ui app in [`web/`](web). Three processes:

```bash
npm run dev       # Express API on :3000
npm run inngest   # Inngest Dev Server on :8288
npm run web       # the UI on :5173
```

Vite proxies `/api/*` to the Express server, so there is no CORS setup in dev.
Deploying the UI separately means adding CORS to the API.

Shelve a repository in the left rail, select it, and ask. Every `[n]` in the
answer is a live reference: hover it and the cited passage lifts in the margin,
click it and the margin scrolls to it. The catalogue lives in Neon, per
signed-in user; the shelve form lists your public GitHub repos to pick from.

Two API changes came with it:

- `GET /search` accepts `repo` to filter by repository, which lets the UI check
  whether indexing has finished without spending an LLM call.
- `POST /ask` returns one `sources` entry per cited chunk (`{ n, source, score,
  text }`) instead of one per file, so `[n]` lines up with `sources[n - 1]`.
