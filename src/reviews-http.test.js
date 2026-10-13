import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleListPulls, handleInspectPull, handleDraftReview, handlePublishReview } from './reviews-http.js';

const ready = { url: 'https://github.com/a/b', owner: 'a', name: 'b', status: 'ready' };

test('handleListPulls rejects a missing url', async () => {
  const res = await handleListPulls({ url: '', getRepoForUser: async () => ready });
  assert.equal(res.status, 400);
});

test('handleListPulls forbids a repo that is not on the shelf', async () => {
  const res = await handleListPulls({
    url: 'https://github.com/a/b',
    getRepoForUser: async () => undefined,
  });
  assert.equal(res.status, 403);
});

test('handleListPulls lists pulls while the shelf is still queued', async () => {
  const res = await handleListPulls({
    url: 'https://github.com/a/b',
    getRepoForUser: async () => ({ ...ready, status: 'queued' }),
    listOpenPulls: async () => [{ number: 4, draft: true, title: 'wip' }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.pulls[0].number, 4);
});

test('handleListPulls returns open pulls including drafts for a ready shelf', async () => {
  const res = await handleListPulls({
    url: 'https://github.com/a/b',
    getRepoForUser: async () => ready,
    listOpenPulls: async (owner, name) => {
      assert.equal(owner, 'a');
      assert.equal(name, 'b');
      return [{ number: 4, draft: true, title: 'wip' }];
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.pulls, [{ number: 4, draft: true, title: 'wip' }]);
});

test('handleInspectPull requires a pull number', async () => {
  const res = await handleInspectPull({
    url: 'https://github.com/a/b',
    getRepoForUser: async () => ready,
  });
  assert.equal(res.status, 400);
});

test('handleInspectPull returns stats and every file diff without drafting', async () => {
  let drafted = false;
  const res = await handleInspectPull({
    url: 'https://github.com/a/b',
    number: 1,
    getRepoForUser: async () => ({ ...ready, status: 'queued' }),
    getPullDetail: async () => ({
      number: 1,
      title: 'fix log',
      state: 'open',
      commits: 2,
      additions: 4,
      deletions: 1,
      changedFiles: 1,
    }),
    listPullFiles: async (owner, name, number, page) => {
      assert.equal(number, 1);
      if (page === 1) return [{ filename: 'src/a.js', patch: '+x', additions: 1, deletions: 0 }];
      return [];
    },
    draftReview: async () => {
      drafted = true;
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.pull.commits, 2);
  assert.equal(res.body.files.length, 1);
  assert.equal(res.body.files[0].filename, 'src/a.js');
  assert.equal(res.body.files[0].patch, '+x');
  assert.equal(drafted, false);
});

test('handleDraftReview waits when the shelf is still queued', async () => {
  const res = await handleDraftReview({
    url: 'https://github.com/a/b',
    number: 4,
    getRepoForUser: async () => ({ ...ready, status: 'queued' }),
  });
  assert.equal(res.status, 409);
});

test('handleDraftReview requires a pull number', async () => {
  const res = await handleDraftReview({
    url: 'https://github.com/a/b',
    getRepoForUser: async () => ready,
  });
  assert.equal(res.status, 400);
});

test('handleDraftReview returns a preview and has no comment publisher', async () => {
  const res = await handleDraftReview({
    url: 'https://github.com/a/b',
    number: 4,
    getRepoForUser: async () => ready,
    getPullDetail: async () => ({ number: 4, title: 'wip', state: 'open' }),
    listPullFiles: async () => [{ filename: 'src/a.js', patch: '+x' }],
    draftReview: async () => ({
      content: 'ok',
      critical_fixes: [],
      suggested_fixes: [],
      body: 'ok',
      filesReviewed: 1,
      pagesReviewed: 1,
      hitPageLimit: false,
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.body, 'ok');
  assert.doesNotMatch(handleDraftReview.toString(), /createIssueComment/);
});

test('handlePublishReview posts the supplied body as a new comment', async () => {
  const res = await handlePublishReview({
    url: 'https://github.com/a/b',
    number: 4,
    body: 'Looks good.',
    getRepoForUser: async () => ready,
    createIssueComment: async (owner, name, number, body) => {
      assert.deepEqual([owner, name, number, body], ['a', 'b', 4, 'Looks good.']);
      return { html_url: 'https://github.com/a/b/issues/4#issuecomment-1', id: 1 };
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.comment.url, 'https://github.com/a/b/issues/4#issuecomment-1');
});
