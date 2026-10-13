import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
const { requireAuth, signSession } = await import('./auth.js');

function run(cookies) {
  const req = { cookies };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  requireAuth(req, res, () => (nextCalled = true));
  return { req, res, nextCalled };
}

test('requireAuth lets a valid session through and exposes the user', () => {
  const { req, nextCalled } = run({ session: signSession({ id: 7, login: 'octocat' }) });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 7, login: 'octocat' });
});

test('requireAuth rejects a request with no session cookie', () => {
  const { res, nextCalled } = run({});
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('requireAuth rejects a session signed with another secret', () => {
  const forged = jwt.sign({ sub: '7', login: 'octocat' }, 'not-the-secret');
  const { res, nextCalled } = run({ session: forged });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
