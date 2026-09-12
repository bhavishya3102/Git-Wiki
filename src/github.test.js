import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoUrl, ownRepoError } from './github.js';

test('parseRepoUrl normalises a GitHub URL', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/octocat/Hello-World.git/'), {
    owner: 'octocat',
    name: 'Hello-World',
    url: 'https://github.com/octocat/Hello-World',
  });
});

test('parseRepoUrl rejects anything that is not a repo URL', () => {
  assert.equal(parseRepoUrl('https://gitlab.com/octocat/Hello-World'), null);
  assert.equal(parseRepoUrl('https://github.com/octocat'), null);
  assert.equal(parseRepoUrl(''), null);
});

test('ownRepoError accepts a public repo owned by the user', () => {
  assert.equal(ownRepoError('OctoCat', { private: false, owner: { login: 'octocat' } }), null);
});

test('ownRepoError rejects a repo owned by someone else', () => {
  assert.match(ownRepoError('octocat', { private: false, owner: { login: 'facebook' } }), /your own/);
});

test('ownRepoError rejects a private repo', () => {
  assert.match(ownRepoError('octocat', { private: true, owner: { login: 'octocat' } }), /public/);
});

test('ownRepoError rejects a repo GitHub could not find', () => {
  assert.match(ownRepoError('octocat', null), /not found/);
});
