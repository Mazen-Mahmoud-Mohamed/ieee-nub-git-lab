# Product simplification production release — 28 October 2026

**Status: database migration and frontend deployed; live acceptance and preservation checks passed.**

Production: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/

Release source: `9a96f9e51d2e6911beed60b707d19bbc37ee457b`.

## Review and safety

The complete pending diff, new files, migration, workflows and production configuration were reviewed. Scope is the shared student/instructor redesign, plain task feedback, real recovery requests, accessible navigation and related tests. No unrelated feature removal or unfinished control was found. A pre-release feedback bug was corrected: missing uncommitted files are no longer described as already-invalid history, while genuinely invalid original content is recognized in both published rule revisions. A regression test covers that distinction. Grading predicates, definition models, published documents and shared server verification remain unchanged.

Preflight verified the dedicated Supabase project `spldzxeqxwicnffnkizm`, repository administrator access for the intended GitHub account, workflow-based Pages hosting and the existing public production variables. The URL points to that project and the base path is `/ieee-nub-git-lab/`. No Athar project was accessed or modified. Credentials and private acceptance records remain outside committed source.

Local verification passed: **134 unit/integration tests**, **11 local browser journeys**, **30 connected browser fixtures**, TypeScript, ESLint, production build and dependency audit (**zero vulnerabilities**). The final local build used the same public production configuration as Pages.

## Database migration

The linked history and dry run showed exactly one pending migration: `20261027150000_attempt_help_requests.sql`. Its dependencies were present in production.

It was applied through the existing CLI procedure:

```text
supabase db push --linked --project-ref spldzxeqxwicnffnkizm --skip-vault --yes
```

Remote history subsequently confirmed all eight local migrations applied. No reset, seed, database recreation, role/config push, vault update or grade backfill was used.

The migration adds a separate request table, queue index, read RLS and four authorized RPCs. It does not rewrite existing assessments, versions, attempts, answers, submissions, snapshots or grades. Direct authenticated insert/update is denied; students can read their own requests; instructor decisions and queue access require instructor authorization; anonymous request execution is denied. The existing policy-controlled restart and retake approval procedures remain authoritative. Approval does not extend deadlines, reset exams or change grades.

Private before/after fingerprints covered **495 pre-existing application rows across 25 tables**, plus existing Auth-user rows and existing database routine definitions. All original fingerprints matched immediately after migration and again after live acceptance/cleanup: **zero changed tables and zero changed existing routines**. All original rows were checked, including previously retained audit/test records. No column was excluded from this comparison.

## Frontend and Edge Functions

The existing [Pages workflow](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40583594629) completed successfully for the release source, including its tests, lint, audit, both browser suites, production build and deploy job. No check or environment protection was bypassed.

The [Deno verifier workflow](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40583594385) also passed. Neither Edge Function nor any shared evaluator dependency changed, so **no Edge Function deployment was performed**. Both existing functions remain ACTIVE at **version 6**, with JWT verification retained. CORS preflight returned 200 for the production origin, and unauthenticated POSTs returned 401.

The live HTML references the release build. Every one of its **five JavaScript/CSS assets matches the production-configured local build by SHA-256**, including `index-d3lScsND.js`. The bundle contains the learning guide, simplified tasks, latest history-feedback correction, policy-aware restart and student/instructor help-request RPCs. Asset equality was verified before and after live acceptance; this was not only a local build check.

## Production acceptance

The final run passed eight groups of live checks against the real website and Supabase backend, with no browser response mocking. Only marked synthetic accounts and dedicated SYSTEM TEST assessments were used for writes.

| Live check                            | Verified result                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in and learning                  | Synthetic student/instructor sign-in and profiles worked; all six learning lessons appeared. Explicit autosave consent before starting carried into that same attempt without a second consent prompt.                                                                                                                                                                                                                      |
| Git history and feedback              | Real terminal/editor operations produced a combined introductory commit. The warning appeared without blocking valid Git. This partial repository earned exactly 20/75 (setup, files and clean state); the server verifier independently saved the same score. Plain feedback explained why later commits cannot split the original commit.                                                                                 |
| Request persistence and authorization | A request survived reload; retry returned the same request. The student could not approve it, another ordinary account could not inspect the attempt/request, and anonymous request execution was denied.                                                                                                                                                                                                                   |
| Approval and restart                  | An authorized synthetic instructor approved through the live request queue. The student saw the reply and available restart. Confirmation/cancel/restart worked at desktop, tablet and mobile widths. The new repository started at 0/75, the old server checkpoint remained unchanged/read only, replay returned the same successor, and refresh preserved fresh state. The new attempt required its own autosave consent. |
| Rejection                             | A second request was declined through the instructor UI. Its reply/status survived student reload; no credit or restart control was granted.                                                                                                                                                                                                                                                                                |
| Correct work and persistence          | All nine unchanged practical requirements were completed through actual Git commands and file edits: focused introductions, goals update, branch isolation, merge, clean state and divergent bonus merge. Required practical points reached 75/75 plus 10/10 bonus and survived reload. Workspace and confirmation layouts had no horizontal overflow at 1440, 768 and 390 pixels.                                          |
| Submission and official grade         | Fourteen required responses were completed. Submission returned a receipt; the production Edge verifier saved nine passing task outcomes and 85 practical points. Authorized grading/release of this synthetic submission produced the expected official 110/100 with the bonus explanation. Restart of the finalized attempt was denied and its official-grade fingerprint remained unchanged.                             |
| Restrictions and instructor layout    | Active exams showed the actual no-restart reason and denied restart/help requests. A separate short-deadline assessment expired by real server time; approval was then denied. Instructor request layouts also passed desktop/tablet/mobile overflow checks. Screenshots of confirmation, workspace, instructor queue and final result were inspected.                                                                      |

Two early harness runs stopped because the test used an outdated start-button label and then failed to refresh an already-open instructor queue. The harness was corrected to use the actual Start / Continue assignment and Refresh requests controls. These were test-harness assumptions, not application failures. Cleanup ran on both stopped runs; the final run reused the positively identified synthetic accounts from the second run. No application authorization, grading rule or production restriction was weakened.

## Cleanup and preservation

Across the stopped and final runs, cleanup was independently verified:

- Six distinct marked synthetic accounts are disabled.
- All five dedicated test assessments are hidden and archived.
- Six synthetic attempts, request decisions, submission and grade evidence are retained for audit.
- Temporary synthetic instructor memberships remaining: zero.
- Pending synthetic help requests remaining: zero.
- Real students enrolled in the test assessments: zero.
- Every pre-existing application/Auth row and existing routine fingerprint still matches the baseline.

No real student record was used for destructive testing. Retained synthetic records can affect aggregate administrative counts; their SYSTEM TEST assessment titles and disabled accounts identify them. They were not deleted to make counters appear unchanged.

## Rollback and limits

If application rollback is necessary, redeploy the prior verified frontend source (`ea1f002`, whose application code is `69605cf`) while retaining the additive request schema and all request records. No Edge rollback is needed for this release. Never reset the production database or delete student work to roll back presentation changes.

No unresolved release blocker remains. Existing product limitations are unchanged: the learning guide is source-controlled rather than a multi-course/lesson CMS; the UI remains English with direction-aware Arabic/English content. Live authentication checks used isolated email/password accounts; a new interactive Google consent flow was not performed. Google configuration was unchanged and its callback/profile regression tests passed in CI. Responsive checks cover the listed widths in Chromium/Edge, not every device or assistive technology.
