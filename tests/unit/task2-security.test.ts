import { expect, it } from 'vitest';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import {
  appJwt,
  challenge,
  randomSecret,
  verifyWebhook,
} from '../../supabase/functions/_shared/task2/security';
import {
  GitHub,
  defaultStudentFork,
  publicStudentFork,
  validateInstallation,
  validateRepository,
} from '../../supabase/functions/_shared/task2/github';
import {
  decryptGitHubToken,
  encryptGitHubToken,
} from '../../supabase/functions/_shared/task2/oauthTokens';
import { TASK2_STARTER } from '../../src/features/task2/policy';
it('uses random state and the S256 PKCE standard vector', async () => {
  expect(randomSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(randomSecret()).not.toBe(randomSecret());
  expect(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wWFOEjXk')).toHaveLength(43);
  expect(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
it('verifies the official GitHub HMAC vector and rejects tampering', async () => {
  const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  expect(
    await verifyWebhook(
      "It's a Secret to Everybody",
      new TextEncoder().encode('Hello, World!'),
      signature,
    ),
  ).toBe(true);
  expect(
    await verifyWebhook(
      "It's a Secret to Everybody",
      new TextEncoder().encode('Hello, World! '),
      signature,
    ),
  ).toBe(false);
  expect(await verifyWebhook('secret', new Uint8Array(), null)).toBe(false);
});
it('signs bounded GitHub App JWTs using both supported PEM key formats', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
  for (const type of ['pkcs1', 'pkcs8'] as const) {
    const jwt = await appJwt(
      '123',
      privateKey.export({ format: 'pem', type }).toString(),
      1_000_000,
    );
    const [head, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: 940,
      exp: 1540,
      iss: '123',
    });
    const key = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        Buffer.from(signature, 'base64url'),
        new TextEncoder().encode(head + '.' + payload),
      ),
    ).toBe(true);
  }
});
it('rejects other owners, organizations, nonforks and the instructor starter', () => {
  const repo = {
    id: 20,
    full_name: 'student/fork',
    owner: { id: 10, type: 'User' },
    fork: true,
    source: { id: TASK2_STARTER.repositoryId },
    default_branch: 'main',
  };
  expect(() => validateRepository(repo, 10)).not.toThrow();
  for (const value of [
    { ...repo, owner: { id: 11, type: 'User' } },
    { ...repo, id: TASK2_STARTER.repositoryId },
    { ...repo, fork: false },
    { ...repo, owner: { id: 10, type: 'Organization' } },
    { ...repo, source: { id: 99 } },
  ])
    expect(() => validateRepository(value, 10)).toThrow();
});
it('requires the intended App, selected repository access and read-only permissions', () => {
  const installation = {
    id: 3,
    app_id: 2,
    account: { id: 10, type: 'User' },
    repository_selection: 'selected',
    permissions: { contents: 'read', issues: 'read', pull_requests: 'read', metadata: 'read' },
  };
  expect(() => validateInstallation(installation, 10, '2')).not.toThrow();
  for (const value of [
    { ...installation, app_id: 5 },
    { ...installation, repository_selection: 'all' },
    { ...installation, suspended_at: 'now' },
    { ...installation, permissions: { ...installation.permissions, contents: 'write' } },
    { ...installation, permissions: { metadata: 'read' } },
    { ...installation, permissions: { ...installation.permissions, actions: 'read' } },
  ])
    expect(() => validateInstallation(value, 10, '2')).toThrow();
});
it('rejects truncated lists and uses fixed-host API requests without redirects', async () => {
  const calls: any[] = [];
  const api = new GitHub('server-only', async (url, init) => {
    calls.push({ url, init });
    return new Response('[]', { headers: { Link: '<next>; rel="next"' } });
  });
  await expect(api.request('/repos/student/fork/issues')).rejects.toThrow('page limit');
  expect(calls[0].init.redirect).toBe('error');
  expect(calls[0].url).toBe('https://api.github.com/repos/student/fork/issues');
  await expect(api.request('//evil.example')).rejects.toThrow();
});
it('encrypts GitHub user credentials with randomized authenticated encryption', async () => {
  const key = 'long-enough-server-only-github-client-secret';
  const original = 'ghu_sensitive-credential-test';
  const first = await encryptGitHubToken(original, key);
  const second = await encryptGitHubToken(original, key);
  expect(first).not.toBe(second);
  expect(first).not.toContain(original);
  expect(await decryptGitHubToken(first, key)).toBe(original);
  await expect(decryptGitHubToken(first, 'different-client-secret-for-testing')).rejects.toThrow();
  const broken = first.slice(0, -2) + 'AA';
  await expect(decryptGitHubToken(broken, key)).rejects.toThrow();
});
it('verifies public starter forks using the authorized user, without App installation', async () => {
  const name = defaultStudentFork('maazzen');
  expect(name).toBe('maazzen/ieee-nub-git-task2-starter');
  const repo = {
    id: 234,
    full_name: name,
    owner: { id: 100, type: 'User' },
    fork: true,
    source: { id: TASK2_STARTER.repositoryId },
    default_branch: 'main',
    private: false,
  };
  const api = new GitHub('user-token', async () => new Response(JSON.stringify(repo)));
  expect((await publicStudentFork(api, name, 100)).id).toBe(234);
  await expect(publicStudentFork(api, name, 101)).rejects.toThrow('personal fork');
  const privateApi = new GitHub(
    'user-token',
    async () => new Response(JSON.stringify({ ...repo, private: true })),
  );
  await expect(publicStudentFork(privateApi, name, 100)).rejects.toThrow('public');
});
