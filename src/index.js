import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions.js';
import { search } from './pinecone.js';
import { ask } from './rag.js';
import { authRouter, requireAuth } from './auth.js';
import { listRepos, removeRepo, saveRepo } from './db.js';
import { getRepo, listPublicRepos, ownRepoError, parseRepoUrl } from './github.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Hand a document off to Inngest; the background function indexes it.
app.post('/docs', async (req, res) => {
  const { id, text } = req.body ?? {};
  if (!id || !text) return res.status(400).json({ error: 'id and text are required' });

  await inngest.send({ name: 'doc/created', data: { id, text } });
  res.status(202).json({ queued: id });
});

// Pinecone filter scoped to the user's own shelved repos — just `repo` when
// given. Null when there is nothing of theirs to search.
async function repoFilter(userId, repo) {
  const urls = (await listRepos(userId)).map((r) => r.url);
  if (repo) return urls.includes(repo) ? { repo: { $eq: repo } } : null;
  return urls.length ? { repo: { $in: urls } } : null;
}

// The signed-in user's public GitHub repos — the only ones they may shelve.
app.get('/github/repos', requireAuth, async (req, res) => {
  const repos = (await listPublicRepos(req.user.login)) ?? [];
  res.json({
    repos: repos.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      url: r.html_url,
      branch: r.default_branch,
    })),
  });
});

app.get('/repos', requireAuth, async (req, res) => {
  res.json({ repos: await listRepos(req.user.id) });
});

// Shelve one of the user's own public repos and index it in the background.
app.post('/repos', requireAuth, async (req, res) => {
  const { url, branch } = req.body ?? {};
  const parsed = url && parseRepoUrl(url);
  if (!parsed) return res.status(400).json({ error: 'a GitHub repository url is required' });

  const meta = await getRepo(parsed.owner, parsed.name);
  const error = ownRepoError(req.user.login, meta);
  if (error) return res.status(403).json({ error });

  // GitHub's own casing, so the same repo always gets the same Pinecone key.
  const repo = {
    url: meta.html_url,
    owner: meta.owner.login,
    name: meta.name,
    branch: branch || meta.default_branch,
  };
  await saveRepo(req.user.id, repo);
  await inngest.send({ name: 'repo/index.requested', data: { url: repo.url, branch: repo.branch } });
  res.status(202).json({ queued: repo.url, repo: { ...repo, status: 'queued' } });
});

// Takes the repo off the user's shelf. Its vectors stay in Pinecone.
app.delete('/repos', requireAuth, async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: 'url is required' });
  await removeRepo(req.user.id, req.query.url);
  res.status(204).end();
});

app.get('/search', requireAuth, async (req, res, next) => {
   const { q, topK, repo } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const filter = await repoFilter(req.user.id, repo);
    if (!filter) return res.json({ matches: [] });
    res.json({ matches: await search(q, Number(topK) || 3, filter) });
  } catch (err) {
    next(err);
  }
});

// Answers a question using only the user's indexed repo content.
app.post('/ask', requireAuth, async (req, res, next) => {
  const { question, repo } = req.body ?? {};
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const filter = await repoFilter(req.user.id, repo);
    if (!filter) return res.status(403).json({ error: 'Shelve that repository first' });
    res.json(await ask(question, { filter }));
  } catch (err) {
    next(err);
  }
});

app.use('/api/inngest', serve({ client: inngest, functions }));

// Keep failures as JSON rather than Express's default HTML page.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
