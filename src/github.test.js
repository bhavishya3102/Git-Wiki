import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRepoUrl,
  ownRepoError,
  mapPull,
  mapPullDetail,
  mapPullFile,
  collectAllPullFiles,
  USER_REPOS_PATH,
  publicReposPath,
} from './github.js';

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

test('ownRepoError accepts a private repo owned by the user', () => {
  assert.equal(ownRepoError('octocat', { private: true, owner: { login: 'octocat' } }), null);
});

test('ownRepoError rejects a repo GitHub could not find', () => {
  assert.match(ownRepoError('octocat', null), /not found/);
});

test('mapPull keeps draft open PRs and trims the payload for the desk', () => {
  assert.deepEqual(
    mapPull({
      number: 4,
      title: 'Rename controller',
      state: 'open',
      draft: true,
      html_url: 'https://github.com/a/b/pull/4',
      updated_at: '2026-09-30T00:00:00Z',
      user: { login: 'octocat' },
      body: 'long body we do not ship to the list',
    }),
    {
      number: 4,
      title: 'Rename controller',
      state: 'open',
      draft: true,
      url: 'https://github.com/a/b/pull/4',
      updatedAt: '2026-09-30T00:00:00Z',
      author: 'octocat',
    },
  );
});

test('mapPullDetail adds commit and change counts for the inspect pane', () => {
  assert.deepEqual(
    mapPullDetail({
      number: 1,
      title: 'fix log',
      state: 'open',
      draft: false,
      html_url: 'https://github.com/a/b/pull/1',
      updated_at: '2026-08-27T00:00:00Z',
      user: { login: 'octocat' },
      body: 'fixes a typo',
      commits: 2,
      additions: 4,
      deletions: 1,
      changed_files: 1,
      head: { sha: 'abc', ref: 'fix' },
    }),
    {
      number: 1,
      title: 'fix log',
      state: 'open',
      draft: false,
      url: 'https://github.com/a/b/pull/1',
      updatedAt: '2026-08-27T00:00:00Z',
      author: 'octocat',
      body: 'fixes a typo',
      commits: 2,
      additions: 4,
      deletions: 1,
      changedFiles: 1,
      head: { sha: 'abc', ref: 'fix' },
    },
  );
});

test('collectAllPullFiles walks every GitHub files page', async () => {
  const files = await collectAllPullFiles(
    async (page, perPage) => {
      if (page === 1) return [{ filename: 'a.js', patch: '+a' }, { filename: 'b.js', patch: '+b' }];
      if (page === 2) return [{ filename: 'c.js', patch: '+c' }];
      throw new Error('too far');
    },
    { perPage: 2 },
  );
  assert.deepEqual(
    files.map((f) => f.filename),
    ['a.js', 'b.js', 'c.js'],
  );
});

test('mapPullFile keeps the fields the reviewer needs', () => {
  assert.deepEqual(
    mapPullFile({
      filename: 'src/a.js',
      status: 'modified',
      changes: 3,
      additions: 2,
      deletions: 1,
      patch: '+x',
      previous_filename: null,
      sha: 'deadbeef',
    }),
    {
      filename: 'src/a.js',
      status: 'modified',
      changes: 3,
      additions: 2,
      deletions: 1,
      patch: '+x',
      previous_filename: null,
    },
  );
});

test('USER_REPOS_PATH does not combine type with affiliation (GitHub 422)', () => {
  assert.match(USER_REPOS_PATH, /affiliation=owner/);
  assert.doesNotMatch(USER_REPOS_PATH, /[?&]type=/);
});

test('publicReposPath lists a user public repos by type=owner only', () => {
  assert.equal(
    publicReposPath('octocat'),
    '/users/octocat/repos?type=owner&sort=updated&per_page=100',
  );
});
