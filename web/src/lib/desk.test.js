import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickReviewVolume, reviewBlockReason, splitPatchLines } from './desk.js';

test('reviewBlockReason asks the reader to pick a volume', () => {
  assert.match(reviewBlockReason(null), /Select a volume/);
});

test('reviewBlockReason blocks a volume still in the bindery', () => {
  assert.match(reviewBlockReason({ status: 'queued', owner: 'a', name: 'b' }), /ready/);
});

test('reviewBlockReason is empty once the volume is shelved', () => {
  assert.equal(reviewBlockReason({ status: 'shelved', owner: 'a', name: 'b' }), null);
});

test('pickReviewVolume keeps an explicit selection', () => {
  const selected = { url: 'https://github.com/a/kept', status: 'shelved' };
  assert.equal(
    pickReviewVolume(selected, [{ url: 'https://github.com/a/other', status: 'shelved' }]),
    selected,
  );
});

test('splitPatchLines tags added, removed, and meta lines', () => {
  assert.deepEqual(splitPatchLines('@@ -1,2 +1,3 @@\n-old\n+new\n context'), [
    { kind: 'meta', text: '@@ -1,2 +1,3 @@' },
    { kind: 'del', text: '-old' },
    { kind: 'add', text: '+new' },
    { kind: 'ctx', text: ' context' },
  ]);
});

test('pickReviewVolume uses the first shelved volume when nothing is selected', () => {
  const queued = { url: 'https://github.com/a/old', status: 'queued' };
  const ready = { url: 'https://github.com/a/ready', status: 'shelved' };
  assert.equal(pickReviewVolume(null, [queued, ready]), ready);
});
