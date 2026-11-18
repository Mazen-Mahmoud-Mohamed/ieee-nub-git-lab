const encoder = new TextEncoder();
export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
export const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(value: string | Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function challenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}
export async function verifyWebhook(secret: string, body: Uint8Array, signature: string | null) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = new Uint8Array(
    signature
      .slice(7)
      .match(/../g)!
      .map((s) => parseInt(s, 16)),
  );
  return crypto.subtle.verify('HMAC', key, bytes, new Uint8Array(body));
}
export async function appJwt(appId: string, privateKey: string, now = Date.now()) {
  if (!/^\d+$/.test(appId)) throw Error('GitHub App configuration unavailable');
  // GitHub downloads a PKCS#1 RSA key. Convert its DER to PKCS#8 for Web Crypto.
  const pkcs1 = privateKey.includes('BEGIN RSA PRIVATE KEY');
  const raw = Uint8Array.from(atob(privateKey.replace(/-----[^-]+-----|\s/g, '')), (c) =>
    c.charCodeAt(0),
  );
  const length = (n: number) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
  const octet = [4, ...length(raw.length), ...raw];
  const prefix = [2, 1, 0, 48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0];
  const body = [...prefix, ...octet];
  const der = pkcs1 ? new Uint8Array([48, ...length(body.length), ...body]) : raw;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const seconds = Math.floor(now / 1000);
  const value =
    base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) +
    '.' +
    base64url(
      encoder.encode(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: appId })),
    );
  return (
    value +
    '.' +
    base64url(
      new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(value))),
    )
  );
}
export async function boundedBody(req: Request | Response, max = 100_000) {
  if (Number(req.headers.get('Content-Length') || 0) > max) throw Error('Payload too large');
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.length;
    if (size > max) {
      await reader.cancel();
      throw Error('Payload too large');
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
