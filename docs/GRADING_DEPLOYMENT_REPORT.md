# Grading production deployment — 27 October 2026

**Status: deployed and verified.**

- Production site: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/
- Deployed source: `742b64162c48061af23ce1c1a2ed6e17bed2f9d7`.
- [Successful Pages validation and deployment](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40512191338).
- [Successful Deno checks for both Edge Functions](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40512191239).
- Supabase project: dedicated `ieee-nub-git-lab`, ref `spldzxeqxwicnffnkizm`.
- `assessment-attempt` and `submit-attempt`: **ACTIVE, version 5**, JWT verification and configured import maps retained.

## Scope review and release configuration

Every changed implementation, test and audit file was reviewed before publishing. Runtime edits are restricted to grading graph evidence, shared outcome feedback and task requirement presentation. The Git engine, filesystem, persistence queue, authentication, instructor tools, question types, RPCs, migration files, published definitions and database schema were not changed. Existing browser/database/security tests passed. The review caught an unnecessary two-parent restriction in generic merge-commit rules; it was corrected before release, preserving valid multi-parent merges and adding a regression test. The course-specific optional exercise continues to require its published two-parent divergent histories.

| Source                                          | Deployment required               | Purpose                                                                                 |
| ----------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/assessments/gitHistory.ts`        | Frontend and both Edge Functions  | Actual introductions, changed paths including deletions, strict ancestry and divergence |
| `src/features/assignments/assignment.ts`        | Frontend and both Edge Functions  | Legacy rules, exact message, independent goals checks, bonus validation and evidence    |
| `src/features/assessments/model.ts`             | Frontend and `assessment-attempt` | Generic rule evaluation and shared feedback                                             |
| `src/features/assignments/TaskInstructions.tsx` | Frontend                          | Expected/detected/correction details and whole-task credit explanation                  |
| Tests and documentation                         | Validation/review                 | Regression evidence and technical report                                                |

The existing `.github/workflows/pages.yml` was used without changing its permissions or environment rules: main-branch push, Node 24, dependency install, tests, lint, security audit, both browser suites, production build, Pages artifact, and deployment. The `github-pages` environment remained restricted to main. Its temporary deployment wait resolved without bypassing or editing protection settings. Pages remains workflow-based with HTTPS enforced.

Production repository variables were checked privately: the expected Supabase URL, `/ieee-nub-git-lab/` base path and a public browser key were correct. No service-role key was added to browser configuration. Local production validation used those exact public variables. The existing `edge.yml` passed Deno checks for both affected import graphs. After Pages succeeded, the existing Supabase CLI API bundling workflow deployed exactly the two affected functions. Deployment output explicitly included the new `gitHistory.ts` in each bundle. No config push, secrets update, migration, database reset or prune was performed.

## Verification results

Before release, the following checks passed again:

- **115/115** unit and integration tests in 13 files, including 16 grading-history regression tests.
- **8/8** local browser workflow tests.
- **24/24** connected UI fixture tests, including successful authenticated checkpoint/submission/retry/receipt workflows against test fixtures.
- TypeScript, ESLint and production-configured build.
- Dependency security audit: **zero vulnerabilities**.
- GitHub repeated its validation on the exact deployed source, with both production workflow jobs and both verifier Deno checks successful.

After deployment:

1. The live HTML referenced the expected production asset filenames. All **five** served CSS/JavaScript assets matched the locally built production release by SHA-256. The main asset is `index-DuSuDUnI.js`; it includes the new historical-correction feedback.
2. Both Edge Functions were ACTIVE at version 5 with changed deployed bundle hashes. Their CORS preflights returned 200 with the expected production origin; unauthenticated POST requests returned 401 before any database operation.
3. **Four live browser tests passed** against the actual production website, with no response mocking. Their practice workspace was anonymous and browser-local. A network guard prohibited non-read Supabase calls.
4. Correct focused introductions, goals update, skills branch isolation and fast-forward merge completed every mandatory task and displayed **75/75**. A genuine divergent hobbies/completion merge then displayed **10/10 optional bonus**, keeping mandatory credit at 75.
5. The actual deployed bad-history regression introduced all three files together with the wrong message, then made later updates. It displayed **30/75**, **3 completed / 5 remaining** introductory checks, incomplete strict order, zero Task 3 credit, the original commit's changed paths/message and the safe historical correction hint. Reload preserved the result. The 390px mobile layout had no horizontal overflow and its screenshot was visually reviewed.
6. Terminal commands, file editing, staging, same-size tracked edits, subsequent commits, dirty indicators, progress transitions and refresh recovery passed. The complete practice workflow unlocked all 14 required questions, accepted browser-local answers, restored them after reload and opened Review. Practice submission stayed disabled with the correct sign-in/assessed-attempt explanation.

## Existing records and grading contracts

Read-only count/content checksums were taken before deployment and compared afterward for **all 25 public/private application tables, 363 rows**. Every checksum and row count matched; **no application table changed**. This covers published definitions, student profiles, attempts, progress/checkpoints, answers, snapshots, results, scores and private grading data. Private contents and keys were not logged or published. No production account login/password changes or new assessed attempts were used for verification.

Published assessment versions and attempt-to-version associations remain intact. No finalized grade was recalculated, overwritten or backfilled. The original 75 required practical + 25 written + 10 optional bonus maxima remain. Version 1 keeps its stricter introductory sequence and goal-count/message conditions; version 2 keeps its published any-order introductions and editor preparation rules. Future provisional checks/checkpoints use the corrected evaluator; genuinely invalid history can now lose previously incorrect provisional check credit. Existing stored scores did not change during this release.

## Limits and rollback

A new authenticated production submission was deliberately **not** made: it would create or update production attempt/checkpoint/result records, contrary to the no-database-modification instruction. Successful authenticated submission, private grading and receipt/retry behavior were verified in automated fixtures and GitHub CI; live verification covers practice review/submission gating and deployed Edge authentication/CORS, not a new persisted production submission.

The static deployed assets are verified byte-for-byte, and the live grading regression proves that the frontend actually executes the fix. The Edge deployment receipt confirms that the corrected source was bundled and activated, and Deno/behavior tests cover the shared evaluator. A new authenticated end-to-end official grade write remains outside this read-only production verification.

The previous source revision `b60917fcf028ba3641b38816b150f56e205e342f` is retained in Git and an ignored local source archive for rollback. Supabase CLI's optional pre-release source download refused to extract shared files outside its function directory; that safety check was respected. No extraction bypass was used. A rollback, if necessary, would redeploy the prior Git source to Pages and both functions; it would not roll back or reset the database. No rollback was needed.
