# Recovery production release — 27 October 2026

**Status: migration, both Edge Functions and frontend deployed and verified.**

Production: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/

Release source: `69605cfce9c313985fde456fc979891466b373f3`.

## Review and deployment scope

The existing recovery implementation, migration history, Supabase configuration, Edge import graphs and GitHub Actions workflows were inspected. Changes are limited to policy-controlled attempt recovery, retained-work navigation, introductory commit warnings and related tests/feedback. Grading predicates and published point allocations are unchanged.

Before deployment, all **123 unit/integration tests**, **9 local browser tests**, **27 connected browser fixture tests**, TypeScript, ESLint and the production build passed again. The dependency audit reported **zero vulnerabilities**. The local production build used the same public repository configuration as Pages: the dedicated Supabase URL and `/ieee-nub-git-lab/` base path. No secret key was placed in the frontend.

## Database migration

`20261027140000_safe_attempt_restart.sql` was the only pending migration in both the linked migration history and `db push --dry-run`. Production definitions of the functions it replaces matched the reviewed predecessor migration bodies. Existing status constraints and the absence of the new successor column were verified before applying it.

The migration adds `restarted_to`, permits the retained `restarted` status, installs the policy-controlled RPC and archive guards, and updates state/admin reporting. Existing attempt limits, approval credits, publication windows and deadlines are enforced through the existing `start_assessment` lifecycle. An active assignment restart is transactional: denial rolls back its status transition; a repeated accepted request returns the same successor. Active exams and finalized attempts cannot be reset.

It was applied with the existing Supabase CLI procedure:

```text
supabase db push --linked --project-ref spldzxeqxwicnffnkizm --skip-vault --yes
```

No reset, database recreation, seed, role deployment, vault update, config push or grade backfill was used. The remote migration history subsequently included the new migration. Anonymous execution of the new RPC is denied, authenticated execution is granted, and the archive trigger is enabled.

Before applying it, fingerprints were recorded for all **366 pre-existing application rows across 25 public/private tables**, plus existing Auth users. Immediately afterward every original row fingerprint matched. The comparison excludes only the newly added nullable `restarted_to` field, so adding the schema field does not disguise any change to pre-existing content. Private row contents and credentials were not printed or committed.

## Edge Functions and frontend

Both `assessment-attempt` and `submit-attempt` were deployed through the existing API bundling procedure after the migration. Both are **ACTIVE at version 6**, retaining JWT verification and the configured import map. Upload receipts included the shared evaluator and history utilities. Their existing required environment names were checked without changing secret values. The [Deno verifier workflow](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40544248176) passed.

The frontend uses the existing [Pages workflow](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40544248264). Its first attempt was cancelled after unusually slow Ubuntu dependency downloads; the unchanged workflow was retried on a fresh runner. No test, security check or environment protection was bypassed.

Pages workflow attempt 2 completed successfully, including both browser suites and the deploy job. All five served CSS/JavaScript assets match the exact production build by SHA-256; the main bundle is `index-B7yrCOLN.js`. The bundle includes Restart Attempt, introductory staging warnings and the historical-correction feedback. Both deployed Edge endpoints return the expected production CORS origin (200 preflight) and reject unauthenticated POST requests (401).

## Production acceptance

Nine production acceptance checks passed using two newly created, marked synthetic accounts and three separate test assessments. No real student attempt was used for write tests. Browser checks ran against the actual deployed site without response mocking.

| Production check                             | Verified result                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test account authorization                   | Only the new synthetic instructor received temporary instructor access. The student could not restart another synthetic user's attempt or approve their own retake.                                                                                                                                                                                                   |
| Commit warning and invalid history           | The multi-file staging warning appeared, the valid Git commit still executed, and actual combined introductory history displayed **30/75 with 3/8 checks**. The Edge verifier independently saved 30 practical points and rejected incomplete final submission.                                                                                                       |
| Confirmation, cancellation and policy denial | Confirmation listed the reset scope and preserved records. Cancelling retained work. A limit-denied restart retained the same attempt ID and unsynced local changes.                                                                                                                                                                                                  |
| Approved restart and persistence             | Instructor approval granted one credit; restart consumed it once, produced one fresh attempt at **0/75**, retained the previous server checkpoint and unsynced local edits read only, and survived reload. Replaying the restart returned the same successor. New-attempt autosave consent did not inherit the old consent.                                           |
| Correct Git work and scores                  | Real terminal/editor operations completed focused introductions, tracked goals edits, branch isolation and merging for **75 mandatory practical points**. A genuine divergent hobbies/completion merge earned the separate **10-point bonus**.                                                                                                                        |
| Actual submission and grade preservation     | All 14 required responses restored after reload. Final submission saved nine passing trusted outcomes, **85 practical points** and a receipt. Receipt replay was idempotent. Authorized manual grading awarded the remaining 25 points, and the student saw **110/110**. Restarting that finalized attempt was denied, with its official grade fingerprint unchanged. |
| Active exam restrictions                     | No restart control appeared in the live exam. The restart RPC and early instructor-retake approval were both denied, and refresh retained the original deadline.                                                                                                                                                                                                      |
| Real deadline restriction                    | A separate short-deadline assignment was allowed to pass its actual server deadline. Restart was denied despite another attempt being available, and its attempt count remained one.                                                                                                                                                                                  |

The initial acceptance script tried to read task-result rows as the student and received an empty result. Investigation confirmed that the nine rows and 85-point summary were correctly stored: `task_results` is instructor-only under the existing RLS policy. The harness was corrected to read through the authorized synthetic instructor and resumed from the retained submission. No application or authorization policy was weakened to make the test pass.

All three synthetic assessments were archived after verification. They were hidden outside brief lifecycle operations, and no other student enrolled in them. Temporary synthetic instructor access was verified removed, and both synthetic accounts were disabled. Their attempts, answers, checkpoints, receipt and grading evidence were retained for audit. Desktop confirmation and final student-result screenshots were visually inspected.

After all production acceptance and cleanup, **every pre-existing application row and existing Auth-user fingerprint still matched** the baseline. The comparison identified **zero changed tables**. Existing published assessments, student progress, submissions, scores and instructor records were preserved; additional records belong only to the isolated acceptance tests.

## Rollback and limits

The previous source revision `e42866574d244642fc05e79bc8d6e665da8a32e8` remains in Git and an ignored local source archive. If application rollback is required, redeploy the previous frontend and both Edge Functions while retaining the backward-compatible database additions. Do not drop the new status/link after restart records exist, and do not restore/reset the database over student work.

No unresolved deployment blockers remain. The slow first CI dependency download and the test harness's initial read-role mistake were resolved without changing production grading requirements, bypassing checks or altering real student data. Production aggregate counts now include the deliberately retained synthetic acceptance records.
