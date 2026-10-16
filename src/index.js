import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions.js';
import { search } from './pinecone.js';
import { ask } from './rag.js';
import { authRouter, requireAuth } from './auth.js';
import { getRepoForUser, getUserToken, listRepos, removeRepo, saveRepo } from './db.js';
import { getRepo, listPublicRepos, listUserRepos, ownRepoError, parseRepoUrl } from './github.js';
import { handleDraftReview, handleInspectPull, handleListPulls, handlePublishReview } from './reviews-http.js';

const app = express();
// Inngest posts step output back to this server. load-and-split for a
// mid-size repo is ~150kb; Express's 100kb default 413s the job as 500.
app.use(express.json({ limit: '4mb' }));
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

// The signed-in user's GitHub repos — public + private when their stored
// token has the `repo` scope; falls back to public-only otherwise.
app.get('/github/repos', requireAuth, async (req, res) => {
  const token = await getUserToken(req.user.id);
  let repos;
  if (token) {
    try {
      repos = await listUserRepos(req.user.login, token);
    } catch (err) {
      console.warn(`listUserRepos failed for ${req.user.login}: ${err.message}`);
    }
  } else {
    console.warn(`No stored token for user ${req.user.login} (id=${req.user.id})`);
  }
  // Always prefer the user's OAuth token on the fallback too — otherwise a
  // shared Render IP hits GitHub's unauthenticated 60/hr limit and every
  // account sees an empty dropdown.
  if (!repos) {
    repos = await listPublicRepos(req.user.login, token);
    if (!repos) {
      console.warn(`listPublicRepos also returned null for ${req.user.login} — possible rate limit`);
      repos = [];
    }
  }
  res.json({
    repos: repos.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      url: r.html_url,
      branch: r.default_branch,
      private: r.private,
    })),
  });
});

app.get('/repos', requireAuth, async (req, res) => {
  res.json({ repos: await listRepos(req.user.id) });
});

// Shelve one of the user's own repos (public or private) and index it.
app.post('/repos', requireAuth, async (req, res) => {
  const { url, branch } = req.body ?? {};
  const parsed = url && parseRepoUrl(url);
  if (!parsed) return res.status(400).json({ error: 'a GitHub repository url is required' });

  const token = await getUserToken(req.user.id);
  const meta = await getRepo(parsed.owner, parsed.name, token);
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
  // userId in the payload so the Inngest function can decrypt the user's
  // token from the DB — the raw token never rides in the event.
  await inngest.send({
    name: 'repo/index.requested',
    data: { url: repo.url, branch: repo.branch, userId: req.user.id },
  });
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

function shelfLookup(userId) {
  return (url) => getRepoForUser(userId, url);
}

function send(res, result) {
  res.status(result.status).json(result.body);
}

app.get('/pulls/inspect', requireAuth, async (req, res, next) => {
  try {
    const token = await getUserToken(req.user.id);
    send(
      res,
      await handleInspectPull({
        url: req.query.url,
        number: req.query.number,
        token,
        getRepoForUser: shelfLookup(req.user.id),
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.get('/pulls', requireAuth, async (req, res, next) => {
  try {
    const token = await getUserToken(req.user.id);
    send(
      res,
      await handleListPulls({
        url: req.query.url,
        token,
        getRepoForUser: shelfLookup(req.user.id),
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.post('/reviews', requireAuth, async (req, res, next) => {
  try {
    const token = await getUserToken(req.user.id);
    send(
      res,
      await handleDraftReview({
        ...(req.body ?? {}),
        token,
        getRepoForUser: shelfLookup(req.user.id),
      }),
    );
  } catch (err) {
    next(err);
  }
});

app.post('/reviews/publish', requireAuth, async (req, res, next) => {
  try {
    const token = await getUserToken(req.user.id);
    send(
      res,
      await handlePublishReview({
        ...(req.body ?? {}),
        token,
        getRepoForUser: shelfLookup(req.user.id),
      }),
    );
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
