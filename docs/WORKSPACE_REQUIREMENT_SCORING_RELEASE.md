# Workspace, requirement scoring and presentation upload release

28 October 2026. **Implemented locally; not committed, pushed or deployed.** Production data, functions, Storage and account permissions were not changed in this task. The pre-existing untracked `POST_ANTIGRAVITY_RELEASE_VERIFICATION.md` was preserved.

## Audit and desktop/mobile changes

Inspected the deployed workspace in fresh desktop (1440px) and phone (390px) browsers before implementation. Desktop allocated most of its working height to an empty editor, placed the terminal below it, and displayed phone typing helpers. The existing application already had mounted Task / Terminal / Files panels, serialized Git/file operations, local drafts, version-pinned attempts, server checkpoints and policy-controlled restart. Those mechanisms are reused.

- Desktop uses a two-thirds work area and one-third task panel. The terminal defaults to 420px, has a 300–680px size control and the existing focus control. An unopened editor collapses; an opened editor has a bounded area. Terminal output is 14px with a separate location line and a single input/Run row.
- Phone helpers appear only at widths at or below 900px, matching the existing workspace-tab breakpoint. Desktop retains keyboard history and completion.
- Mobile presents only the selected Task, Terminal or Files view. The components stay mounted, preserving input, terminal history, repository state and file drafts. Task actions open the working view directly.
- The global provisional score remains in one summary. The current task shows earned/max and remaining points; technical evidence and full instructions remain optional details.
- Browser checks cover 320, 360, 375, 390, 414, 430, tablet and landscape widths, reduced viewport pressure, 44px controls, editor/history recovery and theme contrast. Chromium and WebKit are emulated browser coverage, not physical-device certification.

## Scoring contract and instructor workflow

Newly created assignments and exams default to `Definition.gradingPolicy: 'requirements-v1'`. Existing legacy drafts can explicitly opt a **newly published version** into independent scoring. Its absence preserves the existing all-or-nothing policy, including its original completion gates and numerical behavior. No seed, existing definition or published version is rewritten.

Each task has an explicit `requirementWeights` map keyed by stable check IDs, for example `task-id:rule-0-content`. Every scored check needs a positive weight with at most two decimal places. The weights must total the existing task maximum exactly. The application never invents an equal split or changes the task maximum. Preparation checks and zero-point informational tasks are unscored. Bonus tasks retain a separate maximum and display; official practical summaries retain the existing convention of including earned bonus points.

For a new assessment, independent scoring is selected by default. For a legacy draft, choose **Independent requirement points + partial submission** and confirm the policy change. Enter every requirement weight using readable labels in Tasks, then explicitly publish a new immutable version. Incomplete or stale weight maps cannot be saved/published. Changing a rule removes weights for obsolete check IDs. The original published version, task maxima, private answer keys, existing attempts and official grades remain intact. The instructor must deliberately choose weights; there is no automatic conversion of production assessments.

The shared check evaluator drives provisional progress and `verifyAssessment`, which inspects the actual snapshot on the server. Earned points are summed per check, rounded in cents for the new policy, and persisted in verified checkpoints. The database finalizer stores earned task points even when a task is incomplete and retains the per-requirement breakdown in `task_results.requirement_results`. Instructor review, official released results and existing summary-based exports use those authoritative points. Student breakdown access requires ownership, grade release and the pinned version's response-review permission. Client-supplied scores cannot call the checkpoint RPC.

For modern compatibility rules, introductory-file content, focused introductions and original messages are nine independent checks in the new policy (including each non-personal introductory message). A combined introduction can earn valid content/message points while losing focus points. Existing legacy versions keep their original composite checks and scores. SQL and TypeScript catalogs are tested together for both compatibility revisions.

## Submission and recovery

The new policy requires `gateTheory=false` and `requireComplete=false`, enforced in TypeScript and database publication validation. Students can navigate Tasks, Questions and Review, and submit incomplete practical work or unanswered questions after confirming that only earned points count. Submission still requires authentication, profile/attempt eligibility, autosave consent, the integrity acknowledgement, an open authorized attempt and a server receipt. Deadlines, exam expiry, finality, attempt limits, restart approval and invalidation are unchanged. Historical versions keep their published gates.

**Fix This Step** opens Files or Terminal for the relevant work. **Check again** reinspects the actual repository through the existing serialized queue; it does not change a passed flag, award points or write Git history. Correcting current file content can restore its points while preserving other work. Introductory history remains tied to the real first commit.

The simulator has a single repository and shared ancestry across the exercise. It has no independent exercise checkpoint with a safe dependency boundary. A per-file history reset would erase or reinterpret later branch/merge evidence. Therefore no fake scoped reset was added. Historical feedback explains this dependency, permits continued work/partial credit, and exposes the existing full **Restart Attempt** fallback. Restart still follows the server's attempt/deadline/exam/approval rules and retains the previous attempt. Practice recovery retains its existing recovery copy.

## Learning sessions

The common form path is title, **PowerPoint Presentation**, **Recorded Lecture**, then Save/Publish. Description, links, order, topics and related assessments remain available in optional sections. Empty student resource sections remain omitted by the existing renderer.

The presentation area accepts one dropped `.pptx` or **Browse Files** (keyboard accessible). It shows the selected filename and MiB size, transfer progress, server-validation state, success/error, and replacement confirmation. Browse selection works in both phone browser engines. Both input paths use the same `uploadPresentation`, structural PPTX validation, 25 MiB limit, existing authorized `learning-material` function and private `learning-presentations` bucket. Replacing/removing a draft reference does not delete retained published files. Google Drive video links remain separate and preserve existing validation, opt-in embedding and fallback behavior.

## Migration safety

New file: `supabase/migrations/20261028030000_requirement_scoring.sql`, following the already released admin and session migrations. Do not replay the earlier migrations.

The transaction adds one nullable result column, two scoring-document validation triggers and a narrowly scoped student read policy. It replaces the private checkpoint/finalizer bodies while retaining ownership checks, locking, idempotency, revision conflicts, deadline finalization, legacy completion checks, audit writes and service-only RPC access. New-policy checkpoints require earned-point evidence from the updated grader. Existing result rows acquire only a null breakdown; there are no UPDATE/DELETE statements targeting historical records and no backfill/regrading operation. No Storage, Auth, instructor or Data Administrator schema changes are included.

The database regression snapshots existing public/private/Auth rows before and after the migration, ignoring only the newly added null result column. Original record contents match. Tests also verify pinned historical attempts, official partial-point persistence, immutable scores after republishing, owner/release RLS, direct-write rejection, deadlines and attempt limits. Production drift, actual locks/runtime and live migration safety still require release-time verification; local PGlite execution is not a production migration.

## Verification

- Unit and database suites: **168 tests in 19 files passed**.
- Desktop browser suite: **12 passed**; connected browser suite: **42 passed**.
- Mobile local suite: **4 passed**; connected Android Chromium/iPhone WebKit: **8 passed**.
- TypeScript and ESLint passed. The production build with `/ieee-nub-git-lab/` passed, and its compiled mobile browser smoke passed (1 test). All three Edge Function dependency graphs passed Deno checks. The dependency audit reported zero vulnerabilities. The diff whitespace check passed. Total browser executions across the successful suites: **67**.
- Upload tests use actual local HTTP transfers and PGlite registration/RLS, validate dropped and browsed files, pause uploads to inspect progress/disabled controls, exercise failed upload/retry, cancel/approve replacement and retain original published files.
- The new scoring browser journey corrects content, rechecks, restores an incomplete state, cancels submission, confirms submission, compares the official database score and reloads the released breakdown. The instructor journey rejects missing weights and publishes a separate scoring version without changing original maxima.
- Local lint excludes only ignored `supabase/.temp/**`, which contains prior private release harnesses and extracted minified artifacts. Clean CI continues to run the unchanged normal lint command.

## Changed areas

- Grading: `assignment.ts`, `assessments/model.ts`, `requirements.ts`, `verify.ts`, `presentation.ts`.
- Student UI: `Workspace.tsx`, `WorkspaceProgress.tsx`, `TaskInstructions.tsx`, `Terminal.tsx`, `Review.tsx`, `AssessmentResult.tsx`, `product.css`.
- Instructor/materials: `AssessmentEditor.tsx`, `SubmissionDetail.tsx`, `LearningContent.tsx`, `SessionMaterials.tsx`.
- Validation: the new requirement-scoring test file, migration-preservation assertions, desktop/connected browser tests and the mobile-connected test selection.
- One new migration and this report. Existing application workflows, upload service, bucket, authentication, Git engine operations and recovery RPCs are reused.

The subsequent [final audit](REQUIREMENT_SCORING_FINAL_AUDIT.md) records the default-policy, exact-decimal, informational-task and pinned-result corrections and the final verification evidence.

## Release sequence — approval required, not executed

1. Obtain approval for this grading-policy release. Review the complete diff and current production schema/function drift. Verify the authenticated Supabase account and dedicated linked project **spldzxeqxwicnffnkizm**; never use Athar. Record a backup and private before-fingerprints of student/assessment/attempt/submission/grade records. Do not log secrets or raw student records.
2. Rehearse this migration and the updated grader in isolated staging with real Supabase Auth/PostgreSQL/Edge runtime. Use the existing linked-project migration procedure: inspect migration history and `supabase db push --linked --dry-run`; the only pending file must be `20261028030000_requirement_scoring.sql`. Stop on unexpected drift or pending migrations. Do not reset, seed or recreate production.
3. Apply that single reviewed migration through the approved deployment procedure, scheduling for the brief exclusive lock needed to add the result column. Verify migration history, private/public function grants, validation triggers, result RLS and unchanged original-row fingerprints.
4. Deploy **assessment-attempt** using `supabase functions deploy assessment-attempt --project-ref spldzxeqxwicnffnkizm`. Its shared scoring dependencies changed. Retain JWT verification, the existing import map, server-side Supabase environment and `ALLOWED_ORIGIN`. The legacy `submit-attempt` endpoint and `learning-material` behavior do not need a deployment for this release; the former remains restricted to its original assignment version. Deno checks still cover all three dependency graphs.
5. After server verification, release the approved frontend through the existing `.github/workflows/pages.yml`. A push to main deploys automatically, so do not push before approval and backend readiness. Keep `/ieee-nub-git-lab/`, the dedicated Supabase URL and existing public browser key in Actions variables. No service credential belongs in the frontend. The Edge workflow validates code; it does not deploy functions.
6. Verify the successful Pages run, deployed source hash and live compiled assets. With separately authorized isolated accounts, test old-version behavior and a newly configured weighted version, corrected/incorrect history, partial receipt and persisted official points, recovery restrictions, instructor help and upload/download retention at desktop/phone widths. Compare original production fingerprints afterward. A local build is not evidence of live deployment.
7. If there is a release problem, retain the additive column, versions, checkpoints, uploads and grades. Stop publication/new starts for affected versions and forward-fix with a compatible grader/frontend. Do not downgrade to an old grader or frontend once weighted attempts exist, recalculate official grades, or drop the migration to perform a rollback.

Physical-device keyboards and real Google Drive recording permissions/playback remain manual checks. No new real recording was supplied; existing test-link limitations remain. No production grading-policy deployment is authorized or claimed by this implementation report.
