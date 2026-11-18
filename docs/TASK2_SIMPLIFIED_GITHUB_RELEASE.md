# Task 2: simplified GitHub onboarding — release checklist

## Goal

Students keep the same immutable `github-task2-v1` 100-point practical rubric
and 50-point theory assessment. The first-time experience is:

1. Fork the public starter with **Copy the default branch only** unchecked.
2. Connect their personal GitHub account once.
3. Click **Find My Fork & Check**. The server discovers the conventional fork
   under that GitHub login, registers its numeric identity and checks all 14
   practical criteria.

There is no per-student GitHub App installation, repository settings page,
manual repository path or extra Register button. The four collapsible rubric
stages retain every independent criterion and its evidence.

## Credential and evidence model

- GitHub App user authorization remains bound to the initiating student,
  browser verifier, attempt and single-use state with PKCE. The server verifies
  the GitHub numeric user ID.
- The GitHub _user_ access and refresh tokens are AES-256-GCM encrypted using a
  domain-separated HKDF key derived from the existing **server-only**
  `GITHUB_APP_CLIENT_SECRET`. The ciphertext is kept in
  `private.task2_oauth_tokens`, retrievable only by `service_role` RPCs.
- Tokens are never returned to the frontend, assessment drafts, public
  projections, student status or logs. A revoked App user authorization removes
  the private token row. GitHub user tokens are refreshed on the server when
  nearing expiry. Rotating the App client secret requires affected students
  to reconnect, because old tokens can no longer be decrypted.
- Only **public** personal forks of the pinned starter network are accepted;
  repository ID, numeric owner ID and parent/source ID are verified by the
  GitHub API. The numeric repository identity remains immutable for an attempt.
- The grader still uses authenticated GitHub evidence for branches, commits,
  code, ignores, issues, PRs, reviews and ancestry. Partial submission and
  unknown/unverifiable scoring safeguards are unchanged.
- An unexpected backend failure returns an opaque reference; the log records
  the reference, action, exception category and bounded machine-readable code
  only. It does not record user credentials or raw request data.

## Release order

This change must be validated in staging before production. Do not deploy only
the frontend: the old server expects a repository installation.

1. Back up/check production DB migration history. Apply
   `20261118010000_task2_public_fork_oauth.sql` first. It adds a private token
   table, service-only RPCs and makes `installation_id` nullable; it preserves
   all existing attempts, published versions and evidence.
2. Deploy the updated `github-task2` Edge Function with existing validated
   callback URL and GitHub App OAuth client environment variables. It still
   authenticates every student action using the Supabase JWT inside the
   handler. Confirm the function is deployed with `verify_jwt=false` for the
   public GitHub callback/webhook routes.
3. Deploy the frontend via the existing Pages pipeline. Cached old clients
   must reconnect once to populate the encrypted user token (the pre-upgrade
   identity alone has no token to refresh).
4. With an isolated _student_ account, fork the starter including both
   branches, connect, verify auto-discovery, receive partial scores, fix work,
   recheck and submit. Confirm the instructor sees the immutable evidence and
   that other students cannot register this repository.
5. Test token expiry/refresh, revoked OAuth, private/non-fork repositories,
   incorrect account, expired attempts, stale revisions, retry/idempotency,
   API errors and mobile layout. Then enable students to use the new release.

## Local verification

```shell
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npx playwright test --config playwright.fixture.config.ts tests/browser-fixtures/task2.spec.ts
```

The browser fixture config additionally supports
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing system browser. A complete
signed-in GitHub/OAuth smoke test requires production-equivalent GitHub App
credentials and cannot be replaced by mocked unit or browser tests.

## Rollback and scope

Keep the legacy `finish-install` endpoint temporarily for older in-flight
browser sessions. Do not remove or rewrite existing rubric versions, scored
checks, submission receipts, GitHub links or published answers. If validation
fails, stop the frontend release and restore the previously deployed function
while preserving the additive migration for a later safe rollout.
