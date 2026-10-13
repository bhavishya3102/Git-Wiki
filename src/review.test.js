import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftReview,
  formatCommentBody,
  parseReviewJson,
  retrieveContext,
  reviewGate,
} from './review.js';

test('reviewGate rejects a repo that is not on the shelf', () => {
  assert.deepEqual(reviewGate(undefined), {
    ok: false,
    status: 403,
    error: 'Shelve that repository first',
  });
});

test('reviewGate blocks a repo that is still being indexed', () => {
  assert.deepEqual(reviewGate({ url: 'https://github.com/a/b', status: 'queued' }), {
    ok: false,
    status: 409,
    error: 'Wait until the shelf is ready before reviewing',
  });
});

test('reviewGate allows a ready shelved repo', () => {
  assert.deepEqual(reviewGate({ url: 'https://github.com/a/b', status: 'ready' }), {
    ok: true,
  });
});

test('retrieveContext prefers same-file chunks then related, and dedupes by id', async () => {
  const calls = [];
  const search = async (query, topK, filter) => {
    calls.push({ query, topK, filter });
    if (filter.source) {
      return [
        { id: 'same', score: 0.4, metadata: { source: 'src/a.js', text: 'same file' } },
      ];
    }
    return [
      { id: 'same', score: 0.9, metadata: { source: 'src/a.js', text: 'same file' } },
      { id: 'other', score: 0.8, metadata: { source: 'src/b.js', text: 'caller' } },
    ];
  };

  const chunks = await retrieveContext(
    'https://github.com/a/b',
    [{ filename: 'src/a.js', patch: '+foo' }],
    { search },
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filter, {
    repo: { $eq: 'https://github.com/a/b' },
    source: { $in: ['src/a.js'] },
  });
  assert.deepEqual(calls[1].filter, { repo: { $eq: 'https://github.com/a/b' } });
  assert.deepEqual(
    chunks.map((c) => c.id),
    ['same', 'other'],
  );
});

test('parseReviewJson reads a fenced object from the model', () => {
  const parsed = parseReviewJson('```json\n{"content":"ok","critical_fixes":["fix"],"suggested_fixes":[]}\n```');
  assert.deepEqual(parsed, {
    content: 'ok',
    critical_fixes: ['fix'],
    suggested_fixes: [],
  });
});

test('formatCommentBody joins sections and notes a truncated review', () => {
  const body = formatCommentBody({
    content: 'Looks mostly fine.',
    critical_fixes: ['src/auth.js still exports the old name'],
    suggested_fixes: ['Add a test for the rename'],
    hitPageLimit: true,
    filesReviewed: 200,
    maxPages: 10,
  });

  assert.match(body, /Looks mostly fine/);
  assert.match(body, /\*\*Critical Changes:\*\*/);
  assert.match(body, /src\/auth\.js still exports the old name/);
  assert.match(body, /\*\*Suggestions:\*\*/);
  assert.match(body, /Add a test for the rename/);
  assert.match(body, /10 page/);
  assert.match(body, /200 files/);
});

test('draftReview returns an empty-change note when GitHub lists no files', async () => {
  const result = await draftReview({
    repoUrl: 'https://github.com/a/b',
    pr: { number: 1, title: 'empty' },
    listFiles: async () => [],
    search: async () => [],
    invoke: async () => {
      throw new Error('LLM should not run');
    },
  });

  assert.equal(result.filesReviewed, 0);
  assert.match(result.body, /No file changes/);
});

test('draftReview pages files, reviews once, then stops on a short page', async () => {
  const pages = [];
  const result = await draftReview({
    repoUrl: 'https://github.com/a/b',
    pr: { number: 3, title: 'rename' },
    listFiles: async (page, perPage) => {
      pages.push({ page, perPage });
      if (page === 1) return [{ filename: 'src/a.js', patch: '+x' }];
      throw new Error('should not fetch page 2');
    },
    search: async () => [],
    invoke: async () => ({
      text: JSON.stringify({
        content: 'Rename looks complete.',
        critical_fixes: [],
        suggested_fixes: ['Add a test'],
      }),
    }),
    perPage: 20,
    maxPages: 10,
  });

  assert.deepEqual(pages, [{ page: 1, perPage: 20 }]);
  assert.equal(result.filesReviewed, 1);
  assert.equal(result.pagesReviewed, 1);
  assert.equal(result.hitPageLimit, false);
  assert.match(result.body, /Rename looks complete/);
  assert.match(result.body, /Add a test/);
});
