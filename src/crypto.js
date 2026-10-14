import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;        // GCM recommended
const TAG_LEN = 16;       // 128-bit auth tag

function keyBuf(hexKey) {
  const buf = Buffer.from(hexKey, 'hex');
  if (buf.length !== 32) throw new Error('TOKEN_ENC_KEY must be 64 hex chars (32 bytes)');
  return buf;
}

// Returns "iv:authTag:ciphertext" — all hex.
export function encrypt(plaintext, hexKey) {
  const key = keyBuf(hexKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(packed, hexKey) {
  const key = keyBuf(hexKey);
  const [ivHex, tagHex, ctHex] = packed.split(':');
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, 'hex'), { authTagLength: TAG_LEN });
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(ctHex, 'hex', 'utf8') + decipher.final('utf8');
}
