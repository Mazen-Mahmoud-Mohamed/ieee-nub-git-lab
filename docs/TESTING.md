# Testing and release acceptance

The current refinement adds reusable assessments and server-timed exams. Run `npm run test:e2e:fixtures` in addition to the original browser suite. The new local-only UI fixtures cover the authoring interface, per-assessment workspace isolation, opt-in accepted autosaves, refresh/clock manipulation, deadline locking, server-frozen answers, network failures and stale tabs. The embedded PostgreSQL suite runs both migrations and additionally checks existing-data preservation, immutable versions, publication, private keys, attempt limits, exact deadline rejection, abandoned expiry and grading/release. See [ASSESSMENTS_AND_EXAMS.md](ASSESSMENTS_AND_EXAMS.md) for the policy.

For a hosted release, apply the additive migration to the dedicated staging project, deploy `assessment-attempt`, and install/check `supabase/exam-expiry-schedule.sql`. Verify an exam abandoned before its deadline is finalized by the actual scheduled job, without reopening a browser. Attempt a late save and confirm the earlier accepted answers/score remain unchanged. Complete an instructor-created assignment and exam through actual Auth, Edge, Data API and released-result screens. These live infrastructure checks remain unperformed locally.

## Reproducible local checks

```sh
npm ci
npm run lint
npm test
npm run build
npm audit
npm run test:e2e
```

Use Node.js 24. On Windows the Playwright configuration uses the installed Microsoft Edge channel; on Linux/macOS run `npx playwright install chromium` first. Vitest in restrictive Windows sandboxes can fail before loading tests because temporary files cannot be renamed: rerun with the required local filesystem permission rather than misreporting this as a Git behavior failure.

To check the Edge runtime with installed Deno 2:

```sh
deno check --import-map supabase/functions/submit-attempt/import_map.json supabase/functions/submit-attempt/index.ts
```

The embedded PostgreSQL integration suite uses PGlite, creates synthetic `auth.uid()`/role functions and disposable users, then runs the actual migration and generated seed. This validates PostgreSQL syntax, RLS and RPC logic without a remote database or Docker. It does not emulate Supabase Auth, PostgREST relationships, SMTP, the Edge gateway, or hosted JWT signing.

## Automated coverage

- Tokenizer: quoted messages, redirection, unsafe chaining/substitution, unclosed quotes and size limits.
- Filesystem: virtual boundaries, directory operations, malformed snapshots, size bounds.
- Git: failed add outside repository, missing files, untracked/staged/unstaged states, staged snapshots surviving edits, empty/unconfigured commits, branch isolation, fast-forward merge, nonconflicting divergent merge, safe conflict abort, dirty-switch protection, staged deletion, versioned snapshot recovery.
- Assignment: required history and content, correct identity, score totals, optional bonus, forged object bytes, unsupported repository metadata, bounded answers/reflections.
- Persistence: isolated user IndexedDB keys, autosaved written answers/flags, retained idempotent submission outbox.
- Database: owner-only profile changes/reads, one active attempt, protected instructor RPCs, service-only finalization, immutable finalized attempts, duplicate request receipt, controlled retakes, per-question grade bounds, unpublished grade privacy, owner-only published results.
- Playwright: actual terminal and editor workflow, Git commit creation and refresh recovery, unsupported commands, blocked incomplete submission, mobile viewport without horizontal overflow, helpful 404, instructor access guard, full Assignment 01 practical sequence, branch-file isolation, theory unlock and autosave across refresh.

## Dedicated staging acceptance — required before teaching

These checks are **not claimed to have run against a hosted project**. Provision a dedicated staging project and separate test email accounts; do not use real student submissions as test fixtures.

1. Apply migration/seed and verify every public application table has RLS, explicit grants and the intended ownership policy. Run Supabase security/performance advisors. Confirm the private schema is absent from exposed schemas.
2. Register a synthetic student, receive the confirmation email, and verify an unconfirmed account cannot start or submit an assessed attempt. Verify login, logout, password policy and session expiration. Test institutional SMTP before a class registration burst.
3. Complete a profile and start the assignment twice concurrently; both starts should return the same active attempt. Verify a hidden, future or expired assignment is denied by both start and finalization.
4. Complete the actual practical and theory workflow, including both reflections. Save a cloud checkpoint deliberately, clear only that test account's local workspace, and restore it. Confirm no upload occurs before clicking save/submit.
5. Submit; verify a server-generated UUID receipt, submission timestamp, immutable snapshot, separate answers and pending written grading. Turn off the network after transmission and retry the identical stored payload/key; confirm the same receipt and no duplicate rows.
6. Authenticate a second synthetic student and request the first student's profile, attempt, draft, snapshot, activity, answers and result IDs directly through the Data API. Every private record must be absent/denied. Try changing final status, scores, ownership and instructor metadata directly; all privileged mutations must fail.
7. Modify only client progress/score flags; the server result must remain repository-derived. Flip an object byte, change an object filename, forge a clean index over dirty working files, inject packed objects/symlinks/alternates, omit a parent, or oversize the request/object. Each must be rejected without finalizing the attempt.
8. Replay a final request using another student's token or a different key; it must fail. Exercise the 8/minute rate limit and exact origin rule. Verify gateway JWT rejection without relying only on CORS.
9. Authorize a staging instructor through privileged SQL. Confirm another student cannot invoke instructor RPCs. Inspect actual snapshots, branch graph, answers and the clearly labeled activity timeline. Grade within question bounds, save a private draft grade and confirm no student score leaks. Publish and confirm only the correct student sees totals and feedback.
10. Export CSV with synthetic names starting `=`, `+`, `-`, or `@`; verify formula neutralization in the institution's spreadsheet software. Approve a retake and verify the next attempt is distinct, starts empty and leaves the first server snapshot unchanged.
11. Test keyboard-only navigation, focus visibility, CodeMirror/terminal labels, screen reader announcements, light/dark themes, reduced motion and class paste accommodation with actual assistive technology. Local automated checks are not a WCAG certification.
12. Build with production public variables and the final Pages base path. Deploy through the workflow, then verify deep hash links, authentication redirect, exact CORS origin, complete submission/review/grade release, and the actual public URL. Record this separately from local checks.

## Rollback

Keep an artifact and commit SHA for each release. For a frontend regression, redeploy a previously validated commit through Pages. Revert a changed Edge Function by deploying its previous source with the matching verifier version. Do not roll back by disabling RLS or trusting frontend scores. Database changes require reviewed forward migrations, tested backups and an explicit retention plan; never drop submission tables to recover a frontend build.
