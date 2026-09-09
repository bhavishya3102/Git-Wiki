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
