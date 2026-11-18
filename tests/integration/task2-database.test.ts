import { beforeEach, afterEach, expect, it } from 'vitest';
import { managementDatabase, STUDENT, TEACHER } from '../helpers/managementDatabase';
import {
  assertDefinition,
  gradeObjective,
  type Definition,
} from '../../src/features/assessments/model';
import { emptyTask2Outcomes } from '../../src/features/task2/policy';
import { verifyAssessment } from '../../src/features/assessments/verify';
import { createTask2Handler } from '../../supabase/functions/github-task2/handler';
import { randomSecret, sha256 } from '../../supabase/functions/_shared/task2/security';
import {
  decryptGitHubToken,
  encryptGitHubToken,
} from '../../supabase/functions/_shared/task2/oauthTokens';
let h: Awaited<ReturnType<typeof managementDatabase>>;
let d: Definition;
let assessment: string;
let attempt: any;
const OTHER = '10000000-0000-4000-8000-000000000004';
beforeEach(async () => {
  h = await managementDatabase();
  d = await h.rpc(TEACHER, 'task2_template');
  assessment = await h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: d,
    p_publish: true,
  });
  attempt = await h.rpc(STUDENT, 'start_assessment', { p_assessment: assessment });
  await h.db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'other@example.test',now())",
    [OTHER],
  );
});
afterEach(async () => {
  await h.db.close();
});
async function service(name: string, params: Record<string, unknown>) {
  const names = Object.keys(params);
  const values = Object.values(params).map((v) =>
    v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
  );
  return (
    await h.db.query<any>(
      `select public.${name}(${names.map((n, i) => `${n} => $${i + 1}`).join(',')}) result`,
      values,
    )
  ).rows[0].result;
}
const keys = () =>
  Object.fromEntries(d.questions.map((q) => [q.id, { correctAnswers: q.correctAnswers! }]));
const acceptance = (revision = 0, finalize = false) => ({
  p_student: STUDENT,
  p_attempt: attempt.id,
  p_revision: revision,
  p_payload: {
    snapshot: { version: 1, entries: { '/': { kind: 'dir', data: [] } } },
    answers: {},
    events: [],
  },
  p_outcomes: emptyTask2Outcomes(),
  p_grades: gradeObjective(d, {}, keys()),
  p_evidence: {},
  p_finalize: finalize,
  p_key: crypto.randomUUID(),
  p_new_check: false,
});
async function register() {
  await service('task2_connect', {
    p_student: STUDENT,
    p_github: 100,
    p_login: 'isolated-student',
  });
  await service('task2_register', {
    p_student: STUDENT,
    p_attempt: attempt.id,
    p_repository: 200,
    p_full_name: 'isolated-student/fork',
    p_github: 100,
    p_installation: 300,
  });
}
it('keeps the 100+50 contract, all question kinds and private keys within instructor access', async () => {
  expect(() => assertDefinition(d)).not.toThrow();
  expect(new Set(d.questions.map((q) => q.kind)).size).toBe(5);
  expect(d.questions.reduce((n, q) => n + q.points, 0)).toBe(50);
  await expect(h.rpc(STUDENT, 'task2_template')).rejects.toThrow('Instructor');
  const pinned = await h.rpc(STUDENT, 'assessment_state', { p_attempt: attempt.id });
  expect(pinned.definition.questions.every((q: any) => !('correctAnswers' in q))).toBe(true);
  const grades = gradeObjective(
    d,
    Object.fromEntries(d.questions.map((q) => [q.id, q.correctAnswers!.join('\n')])),
    keys(),
  );
  expect(grades.reduce((n, q) => n + q.points, 0)).toBe(50);
  expect(gradeObjective(d, {}, keys()).every((q) => q.points === 0)).toBe(true);
  await expect(
    verifyAssessment(
      d,
      {
        snapshot: { version: 1, entries: { '/': { kind: 'dir', data: [] } } },
        answers: {},
        events: [],
      },
      { full_name: 'Synthetic', department: 'Engineering' },
      keys(),
    ),
  ).rejects.toThrow('GitHub');
});
it('validates source/rubric and pins active attempts to immutable versions', async () => {
  for (const altered of [
    { ...d, practicalSource: undefined },
    { ...d, questions: d.questions.slice(1) },
    { ...d, sections: [{ ...d.sections[0], tasks: d.sections[0].tasks.slice(1) }] },
  ])
    await expect(
      h.rpc(TEACHER, 'save_assessment', { p_id: assessment, p_document: altered, p_publish: true }),
    ).rejects.toThrow();
  const updated = structuredClone(d);
  updated.questions[0].prompt += ' Updated.';
  await h.rpc(TEACHER, 'save_assessment', {
    p_id: assessment,
    p_document: updated,
    p_publish: true,
  });
  const pinned = await h.rpc(STUDENT, 'assessment_state', { p_attempt: attempt.id });
  expect(pinned.assignment_version).toBe(1);
  expect(pinned.definition.questions[0].prompt).toBe(d.questions[0].prompt);
  await expect(
    h.rpc(STUDENT, 'save_assessment', { p_id: assessment, p_document: d, p_publish: true }),
  ).rejects.toThrow();
});
it('binds OAuth state to student, attempt, browser verifier, purpose, TTL and single use', async () => {
  const state = await sha256(randomSecret()),
    proof = await sha256(randomSecret());
  await service('task2_state_begin', {
    p_student: STUDENT,
    p_attempt: attempt.id,
    p_hash: state,
    p_verifier: proof,
    p_purpose: 'oauth',
  });
  const consume = {
    p_student: STUDENT,
    p_attempt: attempt.id,
    p_hash: state,
    p_verifier: proof,
    p_purpose: 'oauth',
  };
  for (const forged of [
    { ...consume, p_student: OTHER },
    { ...consume, p_verifier: 'forged' },
    { ...consume, p_purpose: 'install' },
  ])
    expect(await service('task2_state_consume', forged)).toBe(false);
  expect(await service('task2_state_consume', consume)).toBe(true);
  expect(await service('task2_state_consume', consume)).toBe(false);
  await service('task2_state_begin', {
    p_student: STUDENT,
    p_attempt: attempt.id,
    p_hash: 'stale',
    p_verifier: proof,
    p_purpose: 'oauth',
  });
  await h.db.exec(
    "update private.task2_oauth_states set expires_at=now()-interval '1 second' where state_hash='stale'",
  );
  expect(await service('task2_state_consume', { ...consume, p_hash: 'stale' })).toBe(false);
  await expect(h.rpc(STUDENT, 'task2_state_read', { p_hash: state })).rejects.toThrow();
});
it('prevents browser evidence writes, cross-student reads and repository reassignment', async () => {
  await register();
  await expect(
    h.asUser(
      STUDENT,
      'insert into public.task2_checks(attempt_id,student_id,assignment_version,policy_version,evidence,outcomes) values($1,$2,1,$3,$4,$5)',
      [attempt.id, STUDENT, 'github-task2-v1', '{}', '[]'],
    ),
  ).rejects.toThrow();
  await expect(h.rpc(STUDENT, 'task2_accept', acceptance())).rejects.toThrow();
  expect((await h.asUser(OTHER, 'select * from public.task2_repositories')).rows).toHaveLength(0);
  expect((await h.asUser(TEACHER, 'select * from public.task2_repositories')).rows).toHaveLength(1);
  await expect(
    service('task2_register', {
      p_student: OTHER,
      p_attempt: attempt.id,
      p_repository: 200,
      p_full_name: 'other/fork',
      p_github: 100,
      p_installation: 300,
    }),
  ).rejects.toThrow('owned');
  await expect(
    service('task2_register', {
      p_student: STUDENT,
      p_attempt: attempt.id,
      p_repository: 201,
      p_full_name: 'isolated-student/second',
      p_github: 100,
      p_installation: 300,
    }),
  ).rejects.toThrow('immutable');
});
it('accepts partial submission without GitHub, keeps unanswered theory zero and enforces grade release roles', async () => {
  const args = acceptance(0, true);
  const first = await service('task2_accept', args);
  expect(first.receipt).toBeTruthy();
  expect((await service('task2_accept', args)).receipt).toBe(first.receipt);
  expect(
    (await h.db.query('select * from public.task_results where attempt_id=$1', [attempt.id])).rows,
  ).toHaveLength(14);
  expect(
    (
      await h.asUser(STUDENT, 'select * from public.released_results where attempt_id=$1', [
        attempt.id,
      ])
    ).rows,
  ).toHaveLength(0);
  await expect(
    h.rpc(STUDENT, 'grade_assessment', {
      p_attempt: attempt.id,
      p_grades: [],
      p_feedback: '',
      p_release: true,
    }),
  ).rejects.toThrow();
  await h.rpc(TEACHER, 'grade_assessment', {
    p_attempt: attempt.id,
    p_grades: [],
    p_feedback: 'Partial work reviewed.',
    p_release: true,
  });
  const grade = (
    await h.asUser(STUDENT, 'select * from public.released_results where attempt_id=$1', [
      attempt.id,
    ])
  ).rows[0];
  expect(Number(grade.practical_score)).toBe(0);
  expect(Number(grade.theory_score)).toBe(0);
});
it('recovers corrected points, saves immutable check history and rejects stale revisions atomically', async () => {
  await register();
  const args = acceptance();
  args.p_new_check = true;
  args.p_evidence = {
    policyVersion: 'github-task2-v1',
    repositoryId: 200,
    ownerId: 100,
    mainSha: 'a'.repeat(40),
  };
  args.p_outcomes[0].earned = 8;
  args.p_outcomes[0].passed = true;
  Object.assign(args.p_outcomes[0].requirements[0], { earned: 8, passed: true });
  await service('task2_accept', args);
  await service('task2_accept', args);
  expect((await h.db.query('select * from public.task2_checks')).rows).toHaveLength(1);
  const correction = structuredClone(args);
  correction.p_key = crypto.randomUUID();
  correction.p_revision = 1;
  correction.p_outcomes[2].earned = 10;
  correction.p_outcomes[2].passed = true;
  Object.assign(correction.p_outcomes[2].requirements[0], { earned: 10, passed: true });
  await service('task2_accept', correction);
  await expect(
    service('task2_accept', { ...correction, p_key: crypto.randomUUID() }),
  ).rejects.toThrow('conflict');
  expect((await h.db.query('select * from public.task2_checks')).rows).toHaveLength(2);
  await service('task2_accept', acceptance(2, true));
  const score = (
    await h.db.query<any>(
      'select practical_score from public.grading_summaries where attempt_id=$1',
      [attempt.id],
    )
  ).rows[0];
  expect(Number(score.practical_score)).toBe(18);
});
it('deduplicates signed delivery identities and invalidates revoked installations without awarding marks', async () => {
  await register();
  const envelope = {
    p_delivery: crypto.randomUUID(),
    p_hash: 'test-hash',
    p_event: 'installation',
    p_body: { action: 'deleted', installation: { id: 300 } },
  };
  expect(await service('task2_webhook', envelope)).toBe(true);
  expect(await service('task2_webhook', envelope)).toBe(false);
  expect(await service('task2_webhook', { ...envelope, p_delivery: crypto.randomUUID() })).toBe(
    false,
  );
  expect(
    (await h.db.query<any>('select status from public.task2_repositories')).rows[0].status,
  ).toBe('revoked');
  expect((await h.db.query('select * from public.task2_checks')).rows).toHaveLength(0);
  expect(await service('task2_rate', { p_student: STUDENT, p_action: 'check' })).toBe(true);
  await service('task2_rate', { p_student: STUDENT, p_action: 'check' });
  await service('task2_rate', { p_student: STUDENT, p_action: 'check' });
  expect(await service('task2_rate', { p_student: STUDENT, p_action: 'check' })).toBe(false);
});
it('requires JWT, origin and owned Task 2 context; verifies webhook before touching the database', async () => {
  const calls: string[] = [];
  const admin: any = {
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === 'synthetic' ? { id: STUDENT, email_confirmed_at: 'now' } : null },
      }),
    },
    rpc: async (name: string, args: any) => {
      calls.push(name);
      try {
        return { data: await service(name, args), error: null };
      } catch {
        return { data: null, error: { message: 'not authorized' } };
      }
    },
  };
  const handler = createTask2Handler(admin, {
    supabaseUrl: 'https://project.example',
    allowedOrigin: 'https://lab.example',
    frontendUrl: 'https://lab.example/',
    appId: '',
    clientId: '',
    clientSecret: '',
    privateKey: '',
    appSlug: '',
    webhookSecret: 'synthetic-secret',
  });
  const request = (body: any, headers: any = {}) =>
    handler(
      new Request('https://project.example/functions/v1/github-task2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    );
  expect((await request({ action: 'status', attemptId: attempt.id })).status).toBe(401);
  expect(
    (
      await request(
        { action: 'status', attemptId: attempt.id },
        { Authorization: 'Bearer synthetic', Origin: 'https://evil.example' },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        { action: 'check', attemptId: attempt.id, evidence: { passed: true } },
        { Authorization: 'Bearer synthetic' },
      )
    ).status,
  ).toBe(400);
  const before = calls.length;
  expect(
    (
      await handler(
        new Request('https://project.example/functions/v1/github-task2/webhook', {
          method: 'POST',
          body: '{}',
        }),
      )
    ).status,
  ).toBe(401);
  expect(calls).toHaveLength(before);
  const state = randomSecret();
  const proof = randomSecret();
  await service('task2_state_begin', {
    p_student: STUDENT,
    p_attempt: attempt.id,
    p_hash: await sha256(state),
    p_verifier: await sha256(proof),
    p_purpose: 'oauth',
  });
  const redirect = await handler(
    new Request(
      `https://project.example/functions/v1/github-task2/oauth-callback?state=${state}&code=synthetic-code`,
    ),
  );
  expect(redirect.status).toBe(303);
  expect(redirect.headers.get('Location')).toContain('https://lab.example/#/assessments/');
  expect(redirect.headers.get('Location')).toContain('github_code=synthetic-code');
});
it('completes OAuth with the initiating browser proof and PKCE without returning credentials or answer keys', async () => {
  const network: any[] = [];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const admin: any = {
    auth: { getUser: async () => ({ data: { user: { id: STUDENT, email_confirmed_at: 'now' } } }) },
    from: () => chain,
    rpc: async (name: string, args: any) => {
      try {
        return { data: await service(name, args), error: null };
      } catch {
        return { data: null, error: { message: 'authorization rejected' } };
      }
    },
  };
  const handler = createTask2Handler(
    admin,
    {
      supabaseUrl: 'https://project.example',
      allowedOrigin: 'https://lab.example',
      frontendUrl: 'https://lab.example/',
      appId: '123',
      clientId: 'public-client',
      clientSecret: 'server-client-secret-long-enough-for-test',
      privateKey: 'configured-private-key',
      appSlug: 'task2-isolated',
      webhookSecret: 'test',
    },
    async (url, init) => {
      network.push({ url, init });
      return new Response(
        JSON.stringify(
          String(url).endsWith('/user')
            ? { id: 100, login: 'isolated-student', type: 'User' }
            : { access_token: 'ephemeral-user-token' },
        ),
      );
    },
  );
  const request = (body: any) =>
    handler(
      new Request('https://project.example/functions/v1/github-task2', {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const verifier = randomSecret();
  const begun = await request({ action: 'oauth', attemptId: attempt.id, verifier });
  expect(begun.status).toBe(200);
  const pending = await begun.json();
  expect(new URL(pending.url).searchParams.get('code_challenge_method')).toBe('S256');
  const body = {
    action: 'finish-oauth',
    attemptId: attempt.id,
    state: pending.state,
    verifier,
    code: 'one-use-code',
  };
  expect((await request({ ...body, verifier: randomSecret() })).status).toBe(403);
  expect(network).toHaveLength(0);
  const finished = await request(body);
  expect(finished.status).toBe(200);
  const returned = JSON.stringify(await finished.json());
  expect(returned).not.toContain('token');
  expect(returned).not.toContain('secret');
  expect(returned).not.toContain('correctAnswers');
  expect(new URLSearchParams(network[0].init.body).get('code_verifier')).toBe(verifier);
  expect((await service('task2_connection', { p_student: STUDENT })).github_id).toBe(100);
  const saved = await service('task2_token_read', { p_student: STUDENT });
  expect(saved.access_ciphertext).not.toContain('ephemeral-user-token');
  expect(saved.access_ciphertext).toContain('.');
  expect(
    (await service('task2_connection', { p_student: STUDENT })).access_ciphertext,
  ).toBeUndefined();
  await expect(h.rpc(STUDENT, 'task2_token_read', { p_student: STUDENT })).rejects.toThrow();
  expect((await request(body)).status).toBe(403);
});
it('registers a public personal fork from the connected user without a per-student GitHub App installation', async () => {
  const key = 'server-client-secret-long-enough-for-test';
  await service('task2_connect', {
    p_student: STUDENT,
    p_github: 100,
    p_login: 'isolated-student',
  });
  await service('task2_token_store', {
    p_student: STUDENT,
    p_access: await encryptGitHubToken('temporary-user-access-token', key),
    p_refresh: null,
    p_access_expires: null,
    p_refresh_expires: null,
  });
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const admin: any = {
    auth: { getUser: async () => ({ data: { user: { id: STUDENT, email_confirmed_at: 'now' } } }) },
    from: () => chain,
    rpc: async (name: string, params: any) => {
      try {
        return { data: await service(name, params), error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
  };
  const requests: string[] = [];
  const handler = createTask2Handler(
    admin,
    {
      supabaseUrl: 'https://project.example',
      allowedOrigin: 'https://lab.example',
      frontendUrl: 'https://lab.example/',
      appId: '123',
      clientId: 'test-client',
      clientSecret: key,
      privateKey: '',
      appSlug: '',
      webhookSecret: '',
    },
    async (url) => {
      requests.push(String(url));
      if (String(url) === 'https://github.com/login/oauth/access_token')
        return new Response(
          JSON.stringify({
            access_token: 'rotated-user-access-token',
            refresh_token: 'rotated-refresh-token',
            expires_in: 28_800,
            refresh_token_expires_in: 15_552_000,
          }),
        );
      if (String(url) === 'https://api.github.com/user')
        return new Response(JSON.stringify({ id: 100, login: 'isolated-student', type: 'User' }));
      return new Response(
        JSON.stringify({
          id: 200,
          full_name: 'isolated-student/ieee-nub-git-task2-starter',
          private: false,
          fork: true,
          source: { id: 1462101408 },
          owner: { id: 100, type: 'User' },
          default_branch: 'main',
        }),
      );
    },
  );
  const send = (action: string) =>
    handler(
      new Request('https://project.example/functions/v1/github-task2', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, attemptId: attempt.id }),
      }),
    );
  const initial = await send('status');
  expect(initial.status).toBe(200);
  expect((await initial.json()).connection.authorized).toBe(true);
  const registered = await send('register');
  expect(registered.status).toBe(200);
  expect((await registered.json()).registered).toBe(true);
  expect(requests).toEqual([
    'https://api.github.com/repos/isolated-student/ieee-nub-git-task2-starter',
  ]);
  const record = (await h.db.query<any>('select * from public.task2_repositories')).rows[0];
  expect(record.repository_id).toBe(200);
  expect(record.installation_id).toBeNull();
  await h.db.query(
    `update private.task2_oauth_tokens
     set access_expires_at = now() - interval '1 minute',
         refresh_expires_at = now() + interval '1 day',
         refresh_ciphertext = $1 where student_id = $2`,
    [await encryptGitHubToken('original-refresh-token', key), STUDENT],
  );
  expect((await send('register')).status).toBe(200);
  expect(requests).toContain('https://github.com/login/oauth/access_token');
  expect(requests).toContain('https://api.github.com/user');
  const newRecord = await service('task2_token_read', { p_student: STUDENT });
  expect(await decryptGitHubToken(newRecord.access_ciphertext, key)).toBe(
    'rotated-user-access-token',
  );
});
it('freezes the last accepted checkpoint at expiry and excludes later answers and checks', async () => {
  await service('task2_accept', acceptance());
  await h.db.query("update public.attempts set deadline_at=now()-interval '1 second' where id=$1", [
    attempt.id,
  ]);
  const expired = await service('task2_accept', acceptance(1, true));
  expect(expired.expired).toBe(true);
  const state = await h.rpc(STUDENT, 'assessment_state', { p_attempt: attempt.id });
  expect(state.status).toBe('expired');
  expect(state.checkpoint_revision).toBe(1);
  expect((await h.db.query('select * from public.task2_checks')).rows).toHaveLength(0);
});
