import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from './crypto.js';

// A fixed 32-byte hex key for tests (never use in prod).
const KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('crypto', () => {
  it('round-trips a token', () => {
    const token = 'gho_abc123XYZ';
    const enc = encrypt(token, KEY);
    assert.notEqual(enc, token, 'encrypted form must differ from plaintext');
    assert.equal(decrypt(enc, KEY), token);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const token = 'gho_sametoken';
    const a = encrypt(token, KEY);
    const b = encrypt(token, KEY);
    assert.notEqual(a, b, 'two encryptions of the same value must differ');
    // but both decrypt to the same thing
    assert.equal(decrypt(a, KEY), token);
    assert.equal(decrypt(b, KEY), token);
  });

  it('rejects tampered ciphertext', () => {
    const enc = encrypt('gho_secret', KEY);
    // flip a character in the ciphertext portion (after second colon)
    const parts = enc.split(':');
    parts[2] = 'ff' + parts[2].slice(2);
    assert.throws(() => decrypt(parts.join(':'), KEY));
  });

  it('rejects wrong key', () => {
    const enc = encrypt('gho_secret', KEY);
    const wrongKey = KEY.split('').reverse().join('');
    assert.throws(() => decrypt(enc, wrongKey));
  });
});
