import 'dotenv/config';
import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions.js';
import { search } from './pinecone.js';
import { ask } from './rag.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Hand a document off to Inngest; the background function indexes it.
app.post('/docs', async (req, res) => {
  const { id, text } = req.body ?? {};
  if (!id || !text) return res.status(400).json({ error: 'id and text are required' });

  await inngest.send({ name: 'doc/created', data: { id, text } });
  res.status(202).json({ queued: id });
});

// Kick off a full GitHub repo index in the background.
app.post('/repos', async (req, res) => {
  const { url, branch } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  await inngest.send({ name: 'repo/index.requested', data: { url, branch } });
  res.status(202).json({ queued: url });
});

app.get('/search', async (req, res, next) => {
   const { q, topK, repo } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const filter = repo ? { repo: { $eq: repo } } : undefined;
    res.json({ matches: await search(q, Number(topK) || 3, filter) });
  } catch (err) {
    next(err);
  }
});

// Answers a question using only the indexed repo content.
app.post('/ask', async (req, res, next) => {
  const { question, repo } = req.body ?? {};
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    res.json(await ask(question, { repo }));
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
