# Scope refinement report — 26 October 2026

## Preserved and reused

The existing application was inspected before editing, and its 34-test baseline and lint were run. The real Git engine, virtual filesystem/index/object database, editor, terminal, themes, authentication/profile flow, object hashing, original Assignment 01 validator, IndexedDB recovery, supporting timeline, instructor review, CSV export and Pages deployment were retained. The Git engine changed mainly to accept a configured virtual project directory. No original migration or evidence table was removed; the existing submission Edge endpoint remains present.

## Added

- A focused dashboard with separate published Assignments and Exams, descriptions, availability/deadlines, attempt policies, statuses, actions and released results.
- A shared assessment definition and renderer for practical-only, theory-only and mixed content, with optional bonus tasks and starter text files/initialized commits/imported repository snapshots.
- Instructor creation, editing, duplication, publishing/unpublishing, scheduling and archive controls. Sections, tasks and questions can be reordered. Publication creates immutable versions; active attempts remain pinned.
- A safe practical builder for file/content, branch, history, merge and clean-repository conditions. New exercises no longer require React/TypeScript edits. Assignment 01 is kept as the first seeded real assessment with its compatibility rules.
- A question builder for all requested objective/written types and a private reusable question bank with recoverable deletion. Objective keys and explanations are separated from student documents. Objective scoring uses private keys; written responses are instructor graded.
- Per-user/per-assessment/per-version/per-attempt persistence, isolated starter clones, retake isolation and non-destructive legacy-workspace migration.
- Server-started timed attempts, immutable deadlines, monotonic display/recovery, warning thresholds, verified checkpoints, revision conflicts, exact-key retry, read-only expiry and automatic finalization of the last accepted work. A separate Supabase Cron installation script handles abandoned attempts.
- Explicitly disclosed opt-in server autosave per project/attempt/tab session, plus Save now. Uploads remain disabled before the student enables them. Offline late arrivals are excluded. The server, not browser clock/localStorage, decides time eligibility.
- Instructor review/filtering across assessments, pinned-question manual grading, actual practical outcomes, feedback, release and retakes. Extra aggregate UI was reduced to simple in-progress/submitted/graded counts.

No videos, attendance, certificates, payments, messages, forums, gamification, leaderboards, AI tutors, multi-university administration or new permission hierarchies were added. No new runtime dependency or separate backend server was introduced.

## Database and security

`20261026160527_reusable_assessments_and_exams.sql` extends the existing schema with catalog type/version metadata, public immutable versions, instructor-only drafts/bank, private published keys/verified checkpoints, and attempt deadline/revision/auto-submit fields. Existing submissions, answers and grades are retained. A test applies the migration over preexisting submission records and checks their survival. Constraints were expanded only where needed for generic point allocations, question IDs and lifecycle statuses.

RLS covers the new tables. Instructor authoring/review RPCs require the existing private instructor membership check. Student state reads require ownership. Service-only RPCs accept verified checkpoints and provide private grading context; students cannot submit points, extend deadlines or call these functions directly. Old start calls delegate to the same server timing/attempt policy. Snapshot and answer review access uses the attempt's pinned version rather than a newly edited setting.

The new `assessment-attempt` Edge Function reuses canonical object verification and the existing Git engine, evaluates the published safe rules, grades objective answers with private keys, and calls the atomic checkpoint/finalization RPC. At expiry, PostgreSQL freezes accepted data without trusting a late payload. Revisions prevent silent multi-tab overwrites. The recurring expiry job is supplied separately because no remote infrastructure was authorized/configured in this refinement.

## Validation

Actual results: **50 unit/integration/security tests passed across six files; six local browser tests and six connected-UI fixture tests passed; lint, strict TypeScript, production build and Deno checks of both Edge Functions passed. Dependency audit reported zero known vulnerabilities.** Coverage includes the original Git regressions plus multiple assessments, publication/unpublication, version pinning, saved-data migration, isolated workspaces/starters, generic branch-and-merge validation, objective grading, server deadlines, repeated starts, stale tabs, abandoned expiry, late data rejection, attempt limits, ownership, grading and release. Browser suites cover the original full Assignment 01 journey and connected-UI fixtures for authoring, isolated assessments, timer refresh/clock manipulation, accepted checkpoint recovery, interrupted saves, stale-tab rejection and manual exam submission with a final receipt.

The connected-UI suite intercepts local test-only HTTP requests; it is not described as a live Supabase end-to-end test. The embedded PostgreSQL suite runs the actual SQL and authorization logic without Docker. Production Auth/SMTP, deployed gateway/Edge execution, real PostgREST relations, live Cron scheduling and Pages hosting still require the documented dedicated staging acceptance.

## External state and rollout

No production database, remote repository, hosted site, auth setting, Edge deployment or cron installation was changed. The existing Supabase environment and GitHub target remain configuration prerequisites. Roll out by backing up and verifying the dedicated project, applying only the new migration to an existing installation, deploying the new endpoint with the existing import map, installing the expiry schedule, then running the staging checklist before distributing an exam link. Frontend variables remain `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BASE_PATH`; Edge origin remains `ALLOWED_ORIGIN`. No service-role key is exposed to the frontend.

## Practical limits

Class-wide paste accommodations are retained; per-student accommodation management is not added. The scheduler runs every minute, while write rejection is exact at the deadline. Local work is browser/device-specific, and cold fully-offline loading is not promised. Snapshot/request/history bounds are unchanged. This is one focused course instance with student/instructor roles, not a general LMS or multi-tenant university system. Rule validation proves repository-state conditions, not human authorship. A published definition cannot be edited in place; publish a new version instead.
