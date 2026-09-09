import { inngest } from './client.js';
import { upsertText } from '../pinecone.js';

// Triggered by `doc/created` events; indexes the document in Pinecone.
export const indexDocument = inngest.createFunction(
  { id: 'index-document', triggers: [{ event: 'doc/created' }] },
  async ({ event, step }) => {
    const { id, text } = event.data;
    return step.run('upsert-to-pinecone', () => upsertText(id, text));
  }
);

export const functions = [indexDocument];
