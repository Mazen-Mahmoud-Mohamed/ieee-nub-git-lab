# Architecture and database

## Current shared assessment extension

The incremental refinement retains the engine, filesystem, auth, persistence and submission foundations described below. The current application adds immutable `assessment_versions`, instructor-only `assessment_drafts` and `question_bank`, private versioned answer keys and verified checkpoints, and server deadline/revision fields on the existing `attempts` table. The catalog remains named `assignments`, with a shared assignment/exam type. The original validator remains a compatibility rule; new tasks use the safe predefined-rule evaluator in `src/features/assessments/model.ts`.

`useAssessmentRoute` loads the public definition or an owned server-pinned attempt. `useLab` opens an isolated per-user/assessment/version/attempt filesystem and imports matching legacy active work without deletion. Existing workspace/question/review components receive the definition and route base as props. `useAssessmentSession` owns monotonic timer display, explicit autosave consent, serial checkpoint requests, retry envelopes, accepted revisions and read-only finalization. The instructor builder saves drafts and publishes new immutable documents. Student-visible versions exclude objective keys and explanations.

The new `assessment-attempt` endpoint authenticates, loads the pinned private verification context, reuses canonical Git-object inspection, evaluates configured outcomes/objective keys, and calls service-only `accept_assessment_checkpoint`. PostgreSQL locks the attempt and enforces revision, deadline and lifecycle. Expiry atomically freezes the last verified checkpoint; it never accepts a late browser payload. The supplied Supabase Cron SQL calls the service-only expiry function every minute for abandoned attempts. This extends rather than replaces the preserved legacy endpoint and SQL evidence tables.

The detailed source-of-truth for current authoring, scoring, consent, timing and interruption behavior is [ASSESSMENTS_AND_EXAMS.md](ASSESSMENTS_AND_EXAMS.md). Descriptions below of the initial Assignment 01-only contract and manual checkpoint flow are historical context; new assessed attempts use the shared versioned definition and opt-in verified autosave pipeline.

## Application boundary

Static Vite assets run in the browser, with hash routes for GitHub Pages. `src/app/App.tsx` owns authentication, profile and role loading, theme, routes and the per-user lab. Feature modules handle the terminal, filesystem, Git, assignment, theory, submission and instructor views. `src/services` contains backend configuration and IndexedDB persistence.

The browser never runs an OS shell, talks to a Git remote, or holds a service-role key. Terminal text is tokenized into one explicitly supported command. Output is rendered as text in React; arbitrary file contents are not HTML. CodeMirror and terminal share the same `VirtualFS` instance.

## Git and storage

`VirtualFS` supplies a promise-based filesystem adapter to isomorphic-git. Directories and binary Git objects are kept separately from ordinary UTF-8 working files. isomorphic-git creates the real `.git/index`, SHA-1 object database, refs and HEAD. `git.add` writes a staged blob; editing the working file afterward leaves the blob unchanged. `git.commit`, `git.checkout`, `git.merge`, `git.readCommit`, `git.readTree` and `git.statusMatrix` drive behavior and repository inspection.

Version-1 snapshots contain `{version: 1, entries: { absoluteVirtualPath: {kind, data:number[]} }}`. The local envelope adds cwd, virtual global configuration, bounded activity, answers, flags, attempt ID and optional server receipt. IndexedDB stores one active workspace per authenticated user and a separate anonymous practice workspace, plus an outbox keyed by attempt. Retakes reset the active local workspace after the server grants a new attempt; historical final work remains on the server. This is not collaborative multi-tab editing: use one active tab per student/device. Export before switching devices or restoring a backup.

Edits trigger local IndexedDB writes after each state change, without an artificial autosave delay. Cloud checkpoint save and restore are deliberate user actions. Cloud drafts are untrusted recovery data and never treated as grades. Final submission persists its bounded immutable request in the outbox before network transmission. Three retries use increasing delays; repeating the same request is safe. The student can retry later after a persistent failure.

## Assignment model

`assignment.ts` is the versioned executable learning contract. The generated SQL seed gives the backend its public title, objectives, sections, task instructions, points and questions. Regenerate with `node scripts/generate-seed.mjs` when deliberately changing a new version. Do not mutate a validator or question allocation under already-open attempts: create a new version and compatible migration.

Practical points total 75; theory questions total 25 (Q3 has 3 points, others 2). Bonus adds 10. Practical outcomes use committed snapshots, first introductions, goal updates, feature ancestry, merged ancestry and a clean main. The server recomputes them from actual repository objects. Whitespace and case are normalized for course text; identity fields match complete lines. Commit-message quality has a modest mechanical threshold and remains available for human review. Setup commands and observations are supporting activity, not independently provable terminal usage. Two zero-point reflections explain isolation and merge direction/type; written theory remains pending instructor review.

## Trusted finalization

1. The Edge gateway and `auth.getUser` verify the access token; verified email is required.
2. The function checks the exact configured CORS origin, JSON byte limit, version/UUIDs, owner and assignment version, and a per-user database rate limit.
3. `verify.ts` restores a bounded filesystem. It rejects unsafe repository metadata, packed objects, symlinks and executable tree entries. It decompresses each loose object with a streaming output bound and recomputes SHA-1 over the complete canonical header and body. A tampered object name is not accepted as evidence.
4. The same isomorphic-git inspection traverses the verified objects server-side. Parent relationships and file contents drive grading; client scores, completion booleans and task-result arrays are ignored.
5. Answers and the supporting log are validated independently. A student-authored log is never represented as a verified replay.
6. The service-only SQL RPC locks the attempt and rechecks owner, assignment window/version and status. It inserts snapshots, answers, activity, outcomes, verified practical score and audit record; sets a server timestamp and UUID receipt; and commits as one transaction. Written theory is pending review. The SQL RPC is inaccessible to browser roles.
7. A replay of the same key returns the original receipt, even if the first response was lost. A different key cannot overwrite a finalized attempt.

Integrity is consistency of submitted work and authenticated ownership, not a claim that Git history proves authorship or that copy/paste deterrence prevents cheating.

## Database map

| Entity                                             | Purpose / access                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| profiles                                           | Student name, normalized phone, canonical faculty and preserved academic details; owner writes; instructor can read |
| assignments, assignment_sections, assignment_tasks | Versioned public instructions; visible assignment or instructor read                                                |
| questions                                          | Public question wording, kind, point allocation and options; no answer keys                                         |
| student_enrollments                                | Assignment membership and retake allowance; guarded RPC writes                                                      |
| attempts                                           | Owner, assignment version, immutable final state, server timestamp, receipt, idempotency key                        |
| workspace_drafts                                   | Explicitly saved untrusted recovery envelope; guarded owner RPC                                                     |
| workspace_snapshots                                | Immutable final Git filesystem; owner review policy or instructor                                                   |
| command_events                                     | Bounded supporting activity with sequence and commit checkpoint                                                     |
| task_results                                       | Trusted practical outcome breakdown; instructor only                                                                |
| student_answers                                    | Written answers and reflections; review-setting controlled owner access                                             |
| grading_results                                    | Per-question instructor allocation; instructor only                                                                 |
| grading_summaries                                  | Verified practical score, theory total, feedback and release state                                                  |
| released_results                                   | Security-invoker view of released grade summaries, still subject to ownership RLS                                   |
| audit_logs                                         | Server-written privileged action record; instructor read                                                            |
| app_settings                                       | Non-secret class accessibility and retention settings                                                               |
| private.instructors                                | Privileged role membership; inaccessible through Data API                                                           |
| private.question_rubrics                           | Instructor rubrics / optional future answer keys                                                                    |
| private.rate_limits                                | Bounded submission windows                                                                                          |

All tables use UUID primary keys except stable public question IDs, the singleton settings row, and private lookup keys. Every application table enables RLS, including private tables. Appropriate foreign keys, unique attempt/enrollment indexes and cascade rules protect ownership and lifecycle. Read indexes cover assignments, attempts, students, grading and audit queries. Profiles are normalized separately from submissions; avoid editing academic identity after grading if institutional records require an immutable identity archive.

## Authentication tradeoffs

Confirmed email and password are straightforward for beginners, permit recovery through the institution’s configured Auth flow, and avoid pretending a Student ID authenticates identity. They need SMTP deliverability and strong password/rate-limit configuration. Student IDs are not globally unique because they are self-reported and an institution may issue overlapping identifiers; authenticated user IDs own work. For an official course, the instructor must reconcile enrollment against the university roster or add institutional SSO before treating self-reported academic data as verified.

## Hosting and references

- [isomorphic-git merge API](https://isomorphic-git.org/docs/en/merge)
- [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

No separate backend server is deployed. Supabase manages PostgreSQL, Auth and the verifier runtime; GitHub Pages hosts static assets. There is no Sites hosting dependency.

## Google/profile refinement

The shared auth client uses PKCE. The base URL query carries the callback code; HashRouter carries application routes. `finishAuthCallback` exchanges once and removes callback parameters. An allowlisted session-storage route restores the intended destination. One shared profile screen is used by both providers; Auth email is read-only, and `save_student_profile` derives the owner from `auth.uid()` and preserves legacy academic fields. The start/manual-finalization wrappers reuse the existing assessment policy while adding database completion checks. Submission status transitions capture minimal identity snapshots. `instructor_submissions` checks private instructor membership and joins authoritative Auth email; no frontend Auth user enumeration is used. See [migration/configuration details](GOOGLE_AUTH_AND_PROFILES.md).
