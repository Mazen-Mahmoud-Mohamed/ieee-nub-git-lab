# Product simplification and system audit

Historical implementation audit: completed locally before release. The subsequent production rollout is recorded in [PRODUCT_SIMPLIFICATION_DEPLOYMENT.md](PRODUCT_SIMPLIFICATION_DEPLOYMENT.md).

## Findings and changes

The interface repeated task prose, per-check evidence, scores and navigation. Historical failures repeated hashes and path deltas without a useful recovery decision. The reset button appeared before its real policy was known. Every restart error suggested instructor approval, including deadline and network failures. Assessment editing exposed all fields at once. Starting an assessment required explicit autosave consent twice.

The redesign keeps the existing product, Git engine, authentication and assessment lifecycle. It adds short teaching material, one task guide at a time, grouped historical feedback, policy-aware recovery, a real help-request queue and focused instructor editing sections.

## Route and workflow review

| Area                                           | Review and resulting behavior                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing and navigation                         | IEEE NUB identity retained; Learn Git opens short lessons; My learning and practice remain distinct. No assessment context is silently replaced.                                                                                                                                                           |
| `/auth`, `/profile`                            | Existing Google/email registration, confirmation, destination restoration and missing-profile completion retained. Name fields support mixed-language text. Engineering and Computer Science remain the only faculty choices.                                                                              |
| `/dashboard`                                   | Learn → choose assessment → complete work path. Cards summarize task/question counts, points, deadlines, current attempt and earlier attempts. Assignments/exams stay separate.                                                                                                                            |
| `/learn`                                       | Six real short lessons: files/editor, status, staging, commits, branches/switching and merging. Commands stay LTR. Practice CTA starts no assessed attempt.                                                                                                                                                |
| `/overview`, assessment details                | Concise task results and point values; published prose remains available. Limits/timing and explicit online-save permission remain before starting.                                                                                                                                                        |
| Practice and assessed `/workspace`             | Main editor/terminal beside one selected task. Starting state, actions, required text/message, history warning, expected result and whole-task scoring. Task focus persists when visiting Questions and Review, scoped to the workspace key. Mobile Workspace/Tasks views remain.                          |
| `/theory`                                      | Existing question types, required-answer checks, accessibility paste policy and assessment gating retained; simpler guidance and direction-aware prompts.                                                                                                                                                  |
| `/review`, `/confirmation`, assessed `/result` | Short final checklist, required-answer count, provisional practical/bonus distinction, official released grade and response review. Backup export/import retained. Cloud controls appear only for a real authenticated attempt.                                                                            |
| `/instructor`                                  | Action shortcuts, overview counts, students, assignments, exams, question bank, submissions, Grades, Help requests and Settings. Existing pagination, filters, CSV escaping/export, attempt inspection and grade release remain.                                                                           |
| Assessment editor and preview                  | Details, Tasks, Questions and Starting files sections. Plain completion-check names, separate student instructions and point requirements. Section changes preserve edits. Unsupported sections return to Details on format changes. Isolated preview runs actual Git without a student attempt or upload. |
| Instructor help requests                       | Bounded status-filtered queue with the student’s reason, original assessment/attempt, work/history link and optional response. Approve/decline has an explicit confirmation and real RPC; no fake contact button.                                                                                          |
| Unknown routes and permission errors           | Existing recovery page and authenticated instructor guard retained and regression tested.                                                                                                                                                                                                                  |

The task audit used the versioned seed, immutable published-v1 fixture and corrected-v2 definition; remote custom assessment documents were not fetched or rewritten. The learning content is a single-course, source-controlled guide. The current application has no multi-course or lesson database/editor; no nonfunctional Course/Lesson management controls were added. Instructors can manage versioned assessments, practical tasks, questions, students, attempts and grades through existing models.

## Nine-task audit

These are presentation guides, not replacements for published documents or scoring rules. Full original task/section instructions remain available. Custom tasks keep their published titles, instructions, file/message values and rule checks.

| Task                                | Required result and presentation clarification                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project setup · 5                   | Name/email, project folder and main initialization. Version 1 points depend on committed main history; guide explicitly permits proceeding to Task 3. Version 2 supports setup before committing.                                                                                                                           |
| Required files · 10                 | about.txt personal details, three original goals and notes.txt course text shown directly. Creating/editing is distinguished from staging/committing. Version 1 requires committed main files; version 2 accepts valid draft text.                                                                                          |
| Separate introductions · 10         | Each file first appears in its own focused change. Exact about message `Add personal information` appears before acting. Version 1 order about → goals → notes and meaningful messages are explicit; version 2 allows any order and requires two-word starting messages. Original text must be correct in the first commit. |
| Goals update · 10                   | Keep original goals and add two. Version 1 original exactly three numbered goals, later five numbered goals after notes, four main commits and meaningful starting/update messages remain. Version 2 preserves original normalized goals and adds two in a later tracked-file update.                                       |
| Skills branch · 10                  | Create/switch feature/skills, write the three named skills, stage and commit. Descriptive first-message guidance also prepares for the isolation requirement.                                                                                                                                                               |
| Branch isolation · 10               | Switch to main and back to observe the file difference; first skills introduction follows an existing parent without that file and uses the version’s required meaningful message. No fabricated switching-event points.                                                                                                    |
| Merge · 15                          | Switch to main before merging feature/skills. Required skills and feature ancestry must be on main; fast-forward remains valid.                                                                                                                                                                                             |
| Clean main · 5                      | Return to main and check status; no staged, unstaged or untracked changes.                                                                                                                                                                                                                                                  |
| Optional divergent merge · 10 bonus | Separate hobbies and completion-note branch histories, three hobby lines, exact completion note and genuine two-parent merge. Optional work does not block required work.                                                                                                                                                   |

Required practical 75 + theory 25, with up to 10 bonus, is unchanged. Every task’s points require all its scored conditions. Preparation rows and partially completed checklist rows do not award partial task points. Published v1 and corrected v2 versions remain pinned to existing attempts. The grader, shared history algorithms, definition models and server verifier were not changed.

## Feedback and recovery

- Combined first introductions produce one explanation naming the files and explaining that a later commit cannot split the original commit.
- Wrong original messages/content/order and invalid original goals receive history-specific explanations; no suggested later commit falsely claims to repair them.
- Introductory checks are grouped by file, while every original check and detected/expected evidence remains in optional technical details.
- Exact text/messages, order and warnings stay visible before risky actions. Existing terminal warnings still allow valid Git commands.
- Help checks server policy before offering any operation. It distinguishes exhausted attempts, deadline, active exam, closed assessment, incomplete profile, finalized work and a previously restarted attempt.
- Allowed restart confirms new starter state, loss of carried-over files/commits/answers/progress, retention of the previous attempt and official grades, current published version, limits and deadlines.
- A limit-bound student can request another attempt once for that attempt. Retries return the same request. Pending, approved and declined statuses/replies survive reload.
- Instructor approval reuses `approve_retake`; it grants one credit only if the attempt limit still blocks starting. If a newer published policy already permits restarting, approval adds no unnecessary credit. A stale/closed/expired request cannot be approved.
- Rejection adds no credit. A rejected request cannot be repeatedly recreated; instructors retain their existing authorized policy controls.
- Restart, autosave, stale-tab and finalization protections remain authoritative on the server. The first explicit autosave consent now carries into that attempt; a fresh restarted attempt still needs its own consent.

## Database and security

New migration: `supabase/migrations/20261027150000_attempt_help_requests.sql`.

It adds one request table, its queue index, read RLS and four RPCs: `attempt_recovery_state`, `request_attempt_help`, `resolve_attempt_help`, `instructor_help_requests`. It does not rewrite existing tables, published definitions, attempts, answers, snapshots, grades or instructor memberships. No reset, truncate, drop or data backfill is required.

Students can read only their own requests; instructors can read the queue. Anonymous access is revoked. Authenticated users cannot directly insert/update request rows. RPCs use explicit identity/ownership or instructor authorization and an empty search path. Messages/replies are bounded; the queue paginates. Requests/responses are audited. Mutations use the same assignment → enrollment → attempt lock order as the existing lifecycle, followed by the request lock. Restart eligibility is rechecked when approving and again by the existing restart/start transaction.

A PostgreSQL integration regression snapshots every existing public/private/auth table immediately before and after this migration and compares every row. Additional tests preserve legacy submissions and grades, enforce request privacy, reject unauthorized decisions/direct writes, prevent duplicate approval/credit, and enforce deadline/exam/closed/finalized restrictions.

## Verification

Verification was run against the final local implementation. Browser fixtures intercept Auth/Data/Edge traffic on localhost; these are not production tests or real Google OAuth authorization. PGlite executes the actual migrations/RPCs with synthetic roles and records. Local browser tests run the real repository simulator and persistence code. The final sequential verification completed successfully on 27 October 2026.

- `npm test`: 133 tests passed across 15 unit/integration files.
- `npm run test:e2e`: 11 local browser journeys passed.
- `npm run test:e2e:fixtures`: 30 passed, including approval/rejection, retained work, all question types, autosave/refresh, stale tabs, exam timing, submission, profile/OAuth callback handling, authoring/preview/publish, instructor review/filter/export.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- Responsive/visual: desktop/mobile workspace, 390px instructor editor and mixed Arabic/English task preview inspected. Tablet layouts and core text contrast (at least 4.5:1 in dark/light themes) passed.
- Accessibility scope: semantic form labels/headings, keyboard confirmation focus/Escape, working skip navigation without a route change, native disclosures, visible focus, status/error announcements, reduced motion and core text-color contrast. This is not a full screen-reader or WCAG conformance audit.

The full unit command intermittently exceeded a pre-existing five-second WASM database startup timeout when many workers competed with browser/build jobs. Unit-test workers are now bounded to two; assertions and timeouts are unchanged.

## Files changed

- `docs/PRODUCT_SIMPLIFICATION_AUDIT.md`
- `src/app/App.tsx`
- `src/features/assessments/AssessmentResult.tsx`
- `src/features/assessments/CourseDashboard.tsx`
- `src/features/assessments/LearningGuide.tsx`
- `src/features/assessments/RestartAttempt.tsx`
- `src/features/assessments/SessionBar.tsx`
- `src/features/assessments/presentation.ts`
- `src/features/assessments/recoveryPresentation.ts`
- `src/features/assignments/TaskInstructions.tsx`
- `src/features/assignments/Workspace.tsx`
- `src/features/auth/Auth.tsx`
- `src/features/instructor/AdminPages.tsx`
- `src/features/instructor/AssessmentEditor.tsx`
- `src/features/instructor/HelpRequests.tsx`
- `src/features/instructor/Instructor.tsx`
- `src/features/questions/Assessment.tsx`
- `src/features/submissions/Checkpoints.tsx`
- `src/features/submissions/Review.tsx`
- `src/features/terminal/Terminal.tsx`
- `src/hooks/useAssessmentSession.ts`
- `src/main.tsx`
- `src/styles/product.css`
- `supabase/migrations/20261027150000_attempt_help_requests.sql`
- `tests/browser-fixtures/course.spec.ts`
- `tests/e2e/local.spec.ts`
- `tests/integration/assessments-db.test.ts`
- `tests/integration/grading-history.test.ts`
- `tests/integration/presentation.test.ts`
- `vite.config.ts`

`src/styles/product.css` supplies shared spacing, typography, responsive layout, text direction, focus-friendly controls and theme contrast overrides. Existing page-specific styles and working systems are reused. `presentation.ts` is a pure guide/feedback layer; `recoveryPresentation.ts` keeps restriction wording consistent. `vite.config.ts` changes only test worker concurrency.

## Release requirements

No deployment, database operation against Supabase, production test data, commit or push was performed in this task. The local production build is a compilation check, not a published release. The compiled app entry is `dist/assets/index-BaIVyj8j.js`; this identifies only the local artifact.

1. Verify the authenticated Supabase account and linked target is the dedicated IEEE project `spldzxeqxwicnffnkizm`; inspect `supabase migration list --linked`. Do not use Athar or reuse another project's credentials.
2. Review `supabase db push --linked --dry-run`. The expected new pending migration is `20261027150000_attempt_help_requests.sql`, after the existing safe-restart migration. Resolve any unexpected drift before applying anything.
3. Apply the reviewed additive migration using the existing privileged migration procedure (`supabase db push --linked`). Never reset/recreate the database. Verify the new RPCs and row-level privacy with isolated accounts and compare preserved production records.
4. Release the frontend through `.github/workflows/pages.yml`. A push to main automatically runs tests/lint/audit/browser checks, builds with the existing Supabase public configuration and repository base path, and publishes GitHub Pages. Apply the database migration first: without it recovery fails closed as unavailable and the instructor queue cannot load.
5. No Edge Function deployment is required by this diff: neither function, its dependencies nor shared scoring logic changed. `.github/workflows/edge.yml` remains the existing Deno verifier check; it is not an automatic function deployment job.
6. After a release, verify the deployed artifact and student/instructor request, response, restart, retained-history, grading and submission flows with isolated accounts. Record the exact CI run/commit, migration status and live observations before claiming deployment success.

For a UI rollback, redeploy the prior verified frontend. Keep the additive table and request records; do not drop or delete them. Old clients remain compatible with the new schema.

## Limits and remaining work

- This change is local. Production migration and live acceptance have not been performed for this release.
- Lesson authoring/multiple courses are not modeled by the existing backend; the real learning guide is source-controlled. Existing assessment/task/question administration is fully retained.
- UI language remains English. Direction-aware written content and isolated LTR commands/code support mixed Arabic/English content; a full Arabic UI translation is not claimed.
- Accessibility checks cover the specified controls, focus, core text colors and responsive journeys, not every assistive technology/browser combination.
- Recovery requests apply to an in-progress assignment blocked by attempt limits. They do not ask for deadline extensions, exam resets or grade changes. Existing instructor policies control those situations.
- Previous unsynced work remains on the original device according to existing persistence policy; it is not represented as having been saved online.
