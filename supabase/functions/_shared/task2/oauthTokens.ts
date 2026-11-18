import { base64url } from './security.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The existing server-only GitHub App client secret is the root key. Domain separation
// prevents OAuth token encryption from reusing the client secret as a raw AES key.
async function encryptionKey(clientSecret: string) {
  if (clientSecret.length < 24) throw Error('GitHub token encryption is not configured');
  const root = await crypto.subtle.importKey('raw', encoder.encode(clientSecret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('IEEE NUB Git Lab Task 2'),
      info: encoder.encode('GitHub user access and refresh tokens v1'),
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid encrypted GitHub token');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  );
}

export async function encryptGitHubToken(value: string, clientSecret: string) {
  if (!value || value.length > 4096) throw Error('Invalid GitHub token');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      await encryptionKey(clientSecret),
      encoder.encode(value),
    ),
  );
  return `${base64url(nonce)}.${base64url(ciphertext)}`;
}

export async function decryptGitHubToken(value: string, clientSecret: string) {
  const pieces = value?.split('.');
  if (pieces?.length !== 2) throw Error('Invalid encrypted GitHub token');
  const nonce = decode(pieces[0]);
  if (nonce.length !== 12) throw Error('Invalid encrypted GitHub token');
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      await encryptionKey(clientSecret),
      decode(pieces[1]),
    ),
  );
}
