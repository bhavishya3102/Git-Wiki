import { ChatOpenAI } from '@langchain/openai';
import { search } from './pinecone.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM = `You answer questions about a code repository.
Use only the numbered context below — do not rely on outside knowledge.
Cite the chunks you used as [1], [2], etc.
If the context does not contain the answer, say so plainly instead of guessing.`;

// Retrieves the most relevant chunks and asks the model to answer from them.
export async function ask(question, { repo, topK = 6 } = {}) {
  const matches = await search(question, topK, repo ? { repo: { $eq: repo } } : undefined);

  if (matches.length === 0) {
    return { answer: 'Nothing is indexed for that repo yet.', sources: [] };
  }

  const context = matches
    .map((m, i) => `[${i + 1}] ${m.metadata.source}\n${m.metadata.text}`)
    .join('\n\n');

  const llm = new ChatOpenAI({ model: MODEL, temperature: 0 });
  const reply = await llm.invoke([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
  ]);

  // Keep one entry per cited chunk so `[n]` in the answer lines up with
  // sources[n - 1], and carry the passage so the UI can show what was cited.
  const sources = matches.map((m, i) => ({
    n: i + 1,
    source: m.metadata.source,
    score: m.score,
    text: m.metadata.text,
  }));

  return { answer: reply.text, sources };
}
