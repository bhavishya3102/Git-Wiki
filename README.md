# Git-Wiki

Express server with Inngest (background jobs) and Pinecone (vector search).

## Setup

```bash
npm install
cp .env.example .env   # add your PINECONE_API_KEY
```

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
| `POST /repos` | `{ "url", "branch" }` — emits a `repo/index.requested` event |
| `GET /search?q=...&topK=3` | Embeds the query and searches Pinecone |
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

Set `GITHUB_TOKEN` in `.env` for private repos or to lift the unauthenticated
GitHub rate limit (60 requests/hour, which a mid-size repo will exhaust).

Note: the loader returns every chunk from a single step, and Inngest caps step
output at 4MB. Large repos need the loading split across steps (e.g. one event
per directory).
