import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { inngest } from './client.js';
import { upsertText, upsertChunks } from '../pinecone.js';
import { markRepoReady } from '../db.js';

// Triggered by `doc/created` events; indexes the document in Pinecone.
export const indexDocument = inngest.createFunction(
  { id: 'index-document', triggers: [{ event: 'doc/created' }] },
  async ({ event, step }) => {
    const { id, text } = event.data;
    return step.run('upsert-to-pinecone', () => upsertText(id, text));
  }
);

const IGNORE_PATHS = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  '**/*.lock',
  '**/*-lock.json',
  '**/*.png',
  '**/*.jpg',
  '**/*.svg',
  '**/*.ico',
];

const UPSERT_BATCH = 50;

// Triggered by `repo/index.requested` events; loads a GitHub repo with
// LangChain, splits it into chunks, and stores them in Pinecone.
export const indexRepo = inngest.createFunction(
  { id: 'index-repo', triggers: [{ event: 'repo/index.requested' }] },
  async ({ event, step }) => {
    const { url, branch = 'main' } = event.data;

    const chunks = await step.run('load-and-split', async () => {
      const loader = new GithubRepoLoader(url, {
        branch,
        recursive: true,
        unknown: 'warn', // skip binaries instead of throwing
        accessToken: process.env.GITHUB_TOKEN,
        ignorePaths: IGNORE_PATHS,
        maxConcurrency: 3,
      });

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
      });

      const docs = await splitter.splitDocuments(await loader.load());
      return docs.map((doc, i) => ({
        id: `${url}#${doc.metadata.source}#${i}`,
        text: doc.pageContent,
        source: doc.metadata.source,
      }));
    });

    // One step per batch, so a failed batch retries on its own.
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
      const batch = chunks.slice(i, i + UPSERT_BATCH);
      await step.run(`upsert-${i}`, () => upsertChunks(batch, { repo: url, branch }));
    }

    await step.run('mark-ready', () => markRepoReady(url));

    return { repo: url, branch, chunks: chunks.length };
  }
);

export const functions = [indexDocument, indexRepo];
