import { Pinecone } from '@pinecone-database/pinecone';

const INDEX_NAME = process.env.PINECONE_INDEX || 'git-wiki';
const EMBED_MODEL = 'multilingual-e5-large';
const DIMENSION = 1024;

// Built on first use so the server still boots without a Pinecone key.
let client;
function pinecone() {
  return (client ??= new Pinecone({ apiKey: process.env.PINECONE_API_KEY }));
}

// Creates the index on first use; Pinecone waits until it is ready.
export async function getIndex() {
  const pc = pinecone();
  const { indexes = [] } = await pc.listIndexes();
  if (!indexes.some((i) => i.name === INDEX_NAME)) {
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      waitUntilReady: true,
    });
  }
  return pc.index(INDEX_NAME);
}

async function embed(texts, inputType) {
  const res = await pinecone().inference.embed({
    model: EMBED_MODEL,
    inputs: texts,
    parameters: { inputType, truncate: 'END' },
  });
  return res.data.map((d) => d.values);
}

export async function upsertText(id, text) {
  const index = await getIndex();
  const [values] = await embed([text], 'passage');
  await index.upsert([{ id, values, metadata: { text } }]);
  return { id };
}

export async function search(query, topK = 3) {
  const index = await getIndex();
  const [values] = await embed([query], 'query');
  const { matches } = await index.query({ vector: values, topK, includeMetadata: true });
  return matches;
}

// Embeds and upserts a batch of chunks. Keep batches under the embedding
// model's 96-input limit.
export async function upsertChunks(chunks, metadata = {}) {
  const index = await getIndex();
  const values = await embed(
    chunks.map((c) => c.text),
    'passage'
  );
  await index.upsert(
    chunks.map((c, i) => ({
      id: c.id,
      values: values[i],
      metadata: { ...metadata, source: c.source, text: c.text },
    }))
  );
  return { upserted: chunks.length };
}
