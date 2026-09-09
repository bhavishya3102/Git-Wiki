import 'dotenv/config';
import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions.js';
import { search } from './pinecone.js';

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

app.get('/search', async (req, res, next) => {
  const { q, topK } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    res.json({ matches: await search(q, Number(topK) || 3) });
  } catch (err) {
    next(err);
  }
});

app.use('/api/inngest', serve({ client: inngest, functions }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
