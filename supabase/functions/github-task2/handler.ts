import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDefinition,
  gradeObjective,
  sanitizeAnswers,
} from '../../../src/features/assessments/model.ts';
import { TASK2_POLICY, emptyTask2Outcomes } from '../../../src/features/task2/policy.ts';
import {
  appJwt,
  boundedBody,
  challenge,
  randomSecret,
  sha256,
  verifyWebhook,
} from '../_shared/task2/security.ts';
import {
  GitHub,
  GitHubError,
  defaultStudentFork,
  publicStudentFork,
  validateInstallation,
} from '../_shared/task2/github.ts';
import { decryptGitHubToken, encryptGitHubToken } from '../_shared/task2/oauthTokens.ts';
import { gradeTask2 } from '../_shared/task2/grader.ts';
export type Task2Config = {
  supabaseUrl: string;
  allowedOrigin: string;
  frontendUrl: string;
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  appSlug: string;
  webhookSecret: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const secret = /^[A-Za-z0-9_-]{43}$/;
export function createTask2Handler(
  admin: SupabaseClient,
  config: Task2Config,
  fetcher: typeof fetch = fetch,
) {
  const rpc = async (name: string, params: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, params);
    if (error) throw error;
    return data;
  };
  const configured = () => {
    try {
      const frontend = new URL(config.frontendUrl);
      return (
        frontend.origin === config.allowedOrigin &&
        !frontend.hash &&
        !frontend.search &&
        !!config.clientId &&
        config.clientSecret.length >= 24
      );
    } catch {
      return false;
    }
  };
  const endpoint = config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/github-task2';
  const headers = {
    'Access-Control-Allow-Origin': config.allowedOrigin || 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  const response = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  const current = async (attemptId: string) => {
    const [repo, check] = await Promise.all([
      admin.from('task2_repositories').select('*').eq('attempt_id', attemptId).maybeSingle(),
      admin
        .from('task2_checks')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (repo.error || check.error) throw repo.error || check.error;
    return { repository: repo.data, check: check.data };
  };
  type OAuthTokens = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
  };
  const exchange = async (values: URLSearchParams): Promise<OAuthTokens> => {
    const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: values,
    });
    if (!tokenResponse.ok)
      throw new GitHubError(503, 'GitHub authorization is unavailable. Try again later.');
    const token = JSON.parse(new TextDecoder().decode(await boundedBody(tokenResponse, 20_000)));
    if (typeof token.access_token !== 'string' || !token.access_token || token.error)
      throw new GitHubError(401, 'GitHub authorization expired. Reconnect GitHub.');
    return token;
  };
  const expiry = (seconds: unknown) =>
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : null;
  const storeTokens = async (studentId: string, tokens: OAuthTokens) =>
    rpc('task2_token_store', {
      p_student: studentId,
      p_access: await encryptGitHubToken(tokens.access_token!, config.clientSecret),
      p_refresh: tokens.refresh_token
        ? await encryptGitHubToken(tokens.refresh_token, config.clientSecret)
        : null,
      p_access_expires: expiry(tokens.expires_in),
      p_refresh_expires: expiry(tokens.refresh_token_expires_in),
    });
  const studentGitHub = async (studentId: string, expectedGitHubId: number) => {
    const saved = await rpc('task2_token_read', { p_student: studentId });
    if (!saved?.access_ciphertext)
      throw new GitHubError(401, 'Reconnect GitHub once to enable automatic fork verification.');
    let accessToken: string;
    try {
      accessToken = await decryptGitHubToken(saved.access_ciphertext, config.clientSecret);
    } catch {
      throw new GitHubError(401, 'GitHub authorization needs renewal. Reconnect GitHub.');
    }
    if (saved.access_expires_at && Date.parse(saved.access_expires_at) <= Date.now() + 60_000) {
      if (
        !saved.refresh_ciphertext ||
        (saved.refresh_expires_at && Date.parse(saved.refresh_expires_at) <= Date.now())
      )
        throw new GitHubError(401, 'GitHub authorization expired. Reconnect GitHub.');
      let refreshToken: string;
      try {
        refreshToken = await decryptGitHubToken(saved.refresh_ciphertext, config.clientSecret);
      } catch {
        throw new GitHubError(401, 'GitHub authorization needs renewal. Reconnect GitHub.');
      }
      const refreshed = await exchange(
        new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );
      const identity = await new GitHub(refreshed.access_token!, fetcher).request('/user');
      if (identity.id !== expectedGitHubId)
        throw new GitHubError(403, 'GitHub account changed. Ask your instructor for help.');
      await storeTokens(studentId, {
        ...refreshed,
        refresh_token: refreshed.refresh_token || refreshToken,
        refresh_token_expires_in:
          refreshed.refresh_token_expires_in ||
          (saved.refresh_expires_at
            ? Math.floor((Date.parse(saved.refresh_expires_at) - Date.now()) / 1000)
            : undefined),
      });
      accessToken = refreshed.access_token!;
    }
    return new GitHub(accessToken, fetcher);
  };
  return async (req: Request) => {
    const requestId = crypto.randomUUID();
    let requestAction = 'unparsed';
    try {
      const url = new URL(req.url);
      const route = url.pathname.replace(/\/$/, '').split('/').at(-1);
      if (route === 'webhook') {
        if (req.method !== 'POST') return response(405, { error: 'POST required' });
        if (!config.webhookSecret) return response(503, { error: 'Webhook is not configured' });
        const body = await boundedBody(req, 1_000_000);
        if (
          !(await verifyWebhook(config.webhookSecret, body, req.headers.get('x-hub-signature-256')))
        )
          return response(401, { error: 'Invalid webhook signature' });
        const delivery = req.headers.get('x-github-delivery') || '';
        const event = req.headers.get('x-github-event') || '';
        if (!uuid.test(delivery) || !/^[a-z_]{1,60}$/.test(event))
          return response(400, { error: 'Invalid webhook envelope' });
        const accepted = await rpc('task2_webhook', {
          p_delivery: delivery,
          p_hash: await sha256(body),
          p_event: event,
          p_body: JSON.parse(new TextDecoder().decode(body)),
        });
        return response(200, { accepted });
      }
      if (route === 'oauth-callback' || route === 'setup-callback') {
        if (req.method !== 'GET') return response(405, { error: 'GET required' });
        const state = url.searchParams.get('state') || '';
        if (!secret.test(state))
          return response(400, {
            error: 'Invalid or stale authorization state. Reconnect from the lab.',
          });
        const pending = await rpc('task2_state_read', { p_hash: await sha256(state) });
        if (!pending || pending.purpose !== (route === 'oauth-callback' ? 'oauth' : 'install'))
          return response(400, {
            error: 'Invalid or stale authorization state. Reconnect from the lab.',
          });
        const frontend = new URL(config.frontendUrl);
        if (frontend.origin !== config.allowedOrigin || frontend.hash || frontend.search)
          throw Error('Invalid frontend configuration');
        const query = new URLSearchParams({ github_state: state });
        const value = url.searchParams.get(route === 'oauth-callback' ? 'code' : 'installation_id');
        if (!value || value.length > 256)
          return response(400, {
            error:
              'GitHub authorization was cancelled or incomplete. Return to the lab and reconnect.',
          });
        query.set(route === 'oauth-callback' ? 'github_code' : 'github_installation', value);
        // Authorization codes travel only in a fragment to the known static frontend, never in its access logs.
        frontend.hash = `/assessments/${pending.assessmentId}/attempts/${pending.attemptId}/workspace?${query}`;
        return new Response(null, {
          status: 303,
          headers: {
            Location: frontend.toString(),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }
      if (req.headers.get('Origin') && req.headers.get('Origin') !== config.allowedOrigin)
        return response(403, { error: 'Origin is not permitted' });
      if (req.method === 'OPTIONS') return new Response(null, { headers });
      if (req.method !== 'POST' || route !== 'github-task2')
        return response(405, { error: 'POST required' });
      const bearer = req.headers.get('Authorization') || '';
      if (!bearer.startsWith('Bearer ')) return response(401, { error: 'Authentication required' });
      const {
        data: { user },
        error: authError,
      } = await admin.auth.getUser(bearer.slice(7));
      if (authError || !user?.email_confirmed_at)
        return response(401, { error: 'Verified student account required' });
      const payload = JSON.parse(new TextDecoder().decode(await boundedBody(req)));
      requestAction = typeof payload?.action === 'string' ? payload.action : 'unknown';
      const actions = [
        'status',
        'oauth',
        'install',
        'finish-oauth',
        'finish-install',
        'register',
        'check',
        'save',
        'submit',
      ];
      if (
        !actions.includes(payload.action) ||
        !uuid.test(payload.attemptId) ||
        Object.keys(payload).some(
          (k) =>
            ![
              'action',
              'attemptId',
              'state',
              'verifier',
              'code',
              'installationId',
              'fullName',
              'answers',
              'revision',
              'idempotencyKey',
            ].includes(k),
        )
      )
        return response(400, { error: 'Invalid Task 2 request. Client evidence is not accepted.' });
      if (!(await rpc('task2_rate', { p_student: user.id, p_action: payload.action })))
        return response(429, {
          error: 'Too many requests. Wait one minute before checking again.',
        });
      const context = await rpc('assessment_verification_context', {
        p_attempt: payload.attemptId,
        p_student: user.id,
      });
      if (context.definition?.practicalSource !== TASK2_POLICY)
        return response(409, { error: 'This endpoint only accepts real GitHub Task 2 attempts.' });
      assertDefinition(context.definition);
      const connection = await rpc('task2_connection', { p_student: user.id });
      const status = await current(payload.attemptId);
      const userToken =
        payload.action === 'status' && connection && !connection.revoked
          ? await rpc('task2_token_read', { p_student: user.id })
          : null;
      if (payload.action === 'status')
        return response(200, {
          ...status,
          revision: context.attempt.checkpoint_revision,
          receipt: context.attempt.receipt,
          connection: connection
            ? {
                login: connection.login,
                githubId: connection.github_id,
                revoked: connection.revoked,
                authorized: !!userToken?.access_ciphertext && !connection.revoked,
              }
            : null,
          configured: configured(),
        });
      if (context.attempt.status !== 'in_progress') {
        if (
          payload.action === 'submit' &&
          (context.attempt.idempotency_key === payload.idempotencyKey ||
            context.attempt.auto_submitted)
        )
          return response(200, {
            receipt: context.attempt.receipt,
            status: context.attempt.status,
            revision: context.attempt.checkpoint_revision,
          });
        return response(409, { error: 'Attempt is finalized' });
      }
      if (
        ['oauth', 'install', 'finish-oauth', 'finish-install', 'register', 'check'].includes(
          payload.action,
        ) &&
        !configured()
      )
        return response(503, {
          error:
            'GitHub sign-in is temporarily unavailable. Theory and partial submission still work.',
        });
      if (payload.action === 'oauth' || payload.action === 'install') {
        if (!secret.test(payload.verifier))
          return response(400, { error: 'Missing browser authorization proof' });
        if (payload.action === 'install' && (!connection || connection.revoked))
          return response(409, { error: 'Connect your personal GitHub account first.' });
        const state = randomSecret();
        await rpc('task2_state_begin', {
          p_student: user.id,
          p_attempt: payload.attemptId,
          p_hash: await sha256(state),
          p_verifier: await sha256(payload.verifier),
          p_purpose: payload.action,
        });
        const target =
          payload.action === 'oauth'
            ? new URL('https://github.com/login/oauth/authorize')
            : new URL(`https://github.com/apps/${config.appSlug}/installations/new`);
        target.searchParams.set('state', state);
        if (payload.action === 'oauth') {
          target.searchParams.set('client_id', config.clientId);
          target.searchParams.set('redirect_uri', endpoint + '/oauth-callback');
          target.searchParams.set('code_challenge', await challenge(payload.verifier));
          target.searchParams.set('code_challenge_method', 'S256');
        }
        return response(200, { url: target.toString(), state });
      }
      if (payload.action === 'finish-oauth' || payload.action === 'finish-install') {
        if (!secret.test(payload.state) || !secret.test(payload.verifier))
          return response(400, { error: 'Invalid browser authorization proof' });
        const purpose = payload.action === 'finish-oauth' ? 'oauth' : 'install';
        if (
          !(await rpc('task2_state_consume', {
            p_student: user.id,
            p_attempt: payload.attemptId,
            p_hash: await sha256(payload.state),
            p_verifier: await sha256(payload.verifier),
            p_purpose: purpose,
          }))
        )
          return response(403, {
            error:
              'Invalid, stale or already used authorization state. Reconnect from this browser.',
          });
        if (purpose === 'oauth') {
          if (typeof payload.code !== 'string' || payload.code.length > 256)
            throw Error('Invalid authorization code');
          const token = await exchange(
            new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              code: payload.code,
              redirect_uri: endpoint + '/oauth-callback',
              code_verifier: payload.verifier,
            }),
          );
          const identity = await new GitHub(token.access_token!, fetcher).request('/user');
          if (
            !Number.isSafeInteger(identity.id) ||
            identity.type !== 'User' ||
            !/^[\w-]+$/.test(identity.login)
          )
            throw Error('Personal GitHub identity required');
          // User and refresh tokens are AES-GCM encrypted and stored in a private
          // service-role-only table. Tokens are never returned to the browser.
          await rpc('task2_connect', {
            p_student: user.id,
            p_github: identity.id,
            p_login: identity.login,
          });
          await storeTokens(user.id, token);
        } else {
          if (
            !connection ||
            connection.revoked ||
            !Number.isSafeInteger(Number(payload.installationId)) ||
            Number(payload.installationId) <= 0
          )
            throw Error('Invalid installation');
          const installation = await new GitHub(
            await appJwt(config.appId, config.privateKey),
            fetcher,
          ).request(`/app/installations/${Number(payload.installationId)}`);
          validateInstallation(installation, connection.github_id, config.appId);
        }
        return response(200, { connected: true });
      }
      if (payload.action === 'register' || payload.action === 'check') {
        if (!connection || connection.revoked)
          return response(409, { error: 'Connect or reauthorize your GitHub account first.' });
        const fullName =
          (payload.action === 'register' && payload.fullName) ||
          status.repository?.full_name ||
          defaultStudentFork(connection.login);
        const github = await studentGitHub(user.id, connection.github_id);
        let repository;
        try {
          repository = await publicStudentFork(github, fullName, connection.github_id);
        } catch (error) {
          if (error instanceof GitHubError && error.status === 404)
            throw new GitHubError(
              409,
              'Create your public fork first, including both branches, then choose Check My Work.',
            );
          throw error;
        }
        if (status.repository && repository.id !== status.repository.repository_id)
          return response(403, { error: 'Registered repository identity mismatch' });
        // An older attempt can still carry an installation ID. Replace that
        // dependency only after verifying the same pinned numeric fork ID.
        if (
          !status.repository ||
          status.repository.installation_id != null ||
          status.repository.status !== 'verified' ||
          payload.action === 'register'
        ) {
          await rpc('task2_register', {
            p_student: user.id,
            p_attempt: payload.attemptId,
            p_repository: repository.id,
            p_full_name: repository.full_name,
            p_github: connection.github_id,
            p_installation: null,
          });
          if (payload.action === 'register') return response(200, { registered: true });
        }
        const checked = await gradeTask2(github, repository, connection.github_id);
        return await accept(checked.outcomes, checked.evidence, true);
      }
      return await accept(
        status.check?.outcomes || emptyTask2Outcomes(),
        status.check?.evidence || {},
        false,
      );
      async function accept(outcomes: unknown, evidence: unknown, newCheck: boolean) {
        if (
          !uuid.test(payload.idempotencyKey) ||
          !Number.isInteger(payload.revision) ||
          payload.revision < 0
        )
          return response(400, { error: 'A revision and request key are required' });
        const answers = sanitizeAnswers(context.definition, payload.answers);
        const grades = gradeObjective(context.definition, answers, context.keys);
        const result = await rpc('task2_accept', {
          p_student: user!.id,
          p_attempt: payload.attemptId,
          p_revision: payload.revision,
          p_payload: {
            snapshot: { version: 1, entries: { '/': { kind: 'dir', data: [] } } },
            answers,
            events: [],
            cwd: '/',
            config: {},
          },
          p_outcomes: outcomes,
          p_grades: grades,
          p_evidence: evidence,
          p_finalize: payload.action === 'submit',
          p_key: payload.idempotencyKey,
          p_new_check: newCheck,
        });
        return response(200, result);
      }
    } catch (error) {
      if (error instanceof GitHubError)
        return response(error.status === 404 ? 409 : error.status, { error: error.message });
      const message = (error as { message?: string })?.message || '';
      if (message.includes('Checkpoint conflict'))
        return response(409, {
          error: 'Checkpoint conflict: another tab has saved newer work. Reload before continuing.',
        });
      if (message === 'Attempt is finalized') return response(409, { error: message });
      // No credentials, request bodies or raw exception messages are logged.
      // The reference lets staff correlate a failed request with a backend fault.
      console.error('task2-internal-error', {
        reference: requestId,
        action: requestAction,
        category: error instanceof Error ? error.name : 'Unknown',
        code:
          typeof (error as { code?: unknown })?.code === 'string'
            ? String((error as { code: string }).code).slice(0, 12)
            : undefined,
      });
      return response(500, {
        error: `Task 2 verification failed unexpectedly. Ask your instructor to check reference ${requestId}.`,
      });
    }
  };
}
