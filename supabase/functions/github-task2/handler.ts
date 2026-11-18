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
  installedRepository,
  validateInstallation,
} from '../_shared/task2/github.ts';
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
        !!config.webhookSecret &&
        !!(
          config.appId &&
          config.clientId &&
          config.clientSecret &&
          config.privateKey &&
          /^[\w-]+$/.test(config.appSlug)
        )
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
  return async (req: Request) => {
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
          error: 'GitHub App setup is pending. You can answer theory and submit partial work.',
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
          const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(12_000),
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              code: payload.code,
              redirect_uri: endpoint + '/oauth-callback',
              code_verifier: payload.verifier,
            }),
          });
          if (!tokenResponse.ok) throw Error('GitHub authorization unavailable');
          const token = JSON.parse(
            new TextDecoder().decode(await boundedBody(tokenResponse, 20_000)),
          );
          if (typeof token.access_token !== 'string' || token.error)
            throw new GitHubError(403, 'GitHub authorization expired. Connect again.');
          const identity = await new GitHub(token.access_token, fetcher).request('/user');
          if (
            !Number.isSafeInteger(identity.id) ||
            identity.type !== 'User' ||
            !/^[\w-]+$/.test(identity.login)
          )
            throw Error('Personal GitHub identity required');
          // The user token is discarded here. No OAuth or installation token is stored or sent to the browser.
          await rpc('task2_connect', {
            p_student: user.id,
            p_github: identity.id,
            p_login: identity.login,
          });
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
          payload.action === 'register' ? payload.fullName : status.repository?.full_name;
        if (typeof fullName !== 'string')
          return response(400, { error: 'Register your own fork first.' });
        const verified = await installedRepository(config, fullName, connection.github_id, fetcher);
        if (status.repository && verified.repo.id !== status.repository.repository_id)
          return response(403, { error: 'Registered repository identity mismatch' });
        if (payload.action === 'register') {
          await rpc('task2_register', {
            p_student: user.id,
            p_attempt: payload.attemptId,
            p_repository: verified.repo.id,
            p_full_name: verified.repo.full_name,
            p_github: connection.github_id,
            p_installation: verified.installation.id,
          });
          return response(200, { registered: true });
        }
        const checked = await gradeTask2(verified.api, verified.repo, connection.github_id);
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
      return response(400, {
        error: 'Task 2 request could not be verified. Check your connection and try again.',
      });
    }
  };
}
