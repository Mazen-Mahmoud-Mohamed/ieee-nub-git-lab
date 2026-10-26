# Implementation report — 26 October 2026

This is the historical initial-build report. The current incremental extension and its resolved authoring/exam limitations are documented in [REFINEMENT_REPORT.md](REFINEMENT_REPORT.md).

## Implemented

The workspace started with only the course PPTX. A new React/TypeScript/Vite/Tailwind application, strict TypeScript configuration, feature modules, tests, PostgreSQL migration/seed, shared verifier, Supabase Edge Function, documentation and GitHub Actions workflows were created. Local Git source control was initialized on `main`; no existing checkout, branch, application, hosted database or repository was overwritten.

The supplied presentation was inspected as a source. Slide 27 completes the merge-direction explanation; slide 28 introduces conflicts. Assignment 01 uses only local fundamentals through merges and plain text files. It contains the four required practical sections (75 points), twelve required written theory questions (25 points), practical reflections and an optional divergent-history bonus (10 points).

## Operational locally

- IEEE-inspired landing page, authentication/profile forms, student dashboard, assignment overview, workspace, theory, review, genuine-receipt confirmation, instructor guards and helpful 404/error handling.
- Dark/light themes, responsive layouts, mobile terminal limitation notice, focus states, labeled controls, reduced-motion support and an editor accessibility label.
- Real isomorphic-git repositories in a virtual filesystem. Working tree, Git index, blobs, trees, commits, refs and HEAD remain separate. Staged content survives later working edits. Fast-forward and clean divergent merges work; conflicts abort without requiring resolution.
- Safe terminal grammar, explicitly supported commands, useful failures, history navigation, completion of known commands, clear/focus controls, correct current directory and branch, bounded supporting activity with likely credential redaction.
- CodeMirror editor/explorer consistency, real commit-parent graph with selectable snapshots, repository-based outcomes, theory unlocking, question navigation/flags, local answer autosave, and versioned IndexedDB recovery/outbox.
- Explicit local backup export/import and manual cloud-checkpoint controls. No background repository upload is included. Final submissions cannot be represented as successful without a backend receipt.

The browser tests complete the practical assignment using the real terminal/editor, demonstrate branch-file isolation, merge, unlock theory, save required answers/reflections, refresh and recover them. The unconfigured local-practice mode correctly disables final submission.

## Implemented, requiring dedicated backend configuration and hosted acceptance

Email-confirmed Supabase authentication; academic profiles; serialized attempt creation; protected manual cloud checkpoints; server object-hash/history/content verification; bounded and rate-limited submissions; atomic idempotent finalization; pending written grading; instructor student search/filter/statistics; real snapshot and timeline inspection; written grading and feedback; grade publication; retake approval; CSV export; assignment visibility/windows/review settings; private question rubrics; accessibility settings; audit logging.

These source paths are implemented and type-checked, but **not represented as verified against hosted Supabase**. The connector failed to reach the account service, and no dedicated project reference or publishable key was supplied. Auth email delivery, hosted RLS advisors, actual PostgREST relationships, deployed Edge authentication/bundling and the connected student → submission → instructor → grade-release journey require staging acceptance. See `TESTING.md`.

## Architecture and database

Static browser frontend → Supabase Auth/Data API for authorized records → authenticated Edge verifier → service-only atomic PostgreSQL finalization. The frontend has no service secret and cannot write trusted scores. GitHub Pages uses hash routing and a configurable base path; no Node server or container deployment is required.

The normalized migration includes profiles, versioned assignments/sections/tasks/questions, enrollments/retakes, attempts, manual drafts, immutable final snapshots, activity, task results, written answers, question grades, grade summaries, settings and audit logs. A private schema stores instructor membership, rubrics/optional future answer keys and submission rate limits. UUID keys, foreign keys, unique attempt/snapshot/idempotency constraints and ownership indexes enforce integrity. Every application table enables RLS.

Instructor authorization uses a privileged private membership table, never editable user metadata. Confirmed email authenticates accounts; a self-reported Student ID does not prove identity. Grading tables are separate from student-editable profile and draft records. Released totals use a security-invoker view backed by owner/instructor RLS.

## Trusted Git validation

The verifier restores a bounded version-1 snapshot, rejects unsupported/unsafe metadata and tree modes, decompresses loose objects with size bounds, and independently recomputes canonical SHA-1 object IDs. It traverses commits/trees/parents using isomorphic-git, validates initial separate file introductions and later goal updates, confirms feature ancestry on main, checks actual text and authenticated profile identity, and compares working files directly to the committed main tree in addition to inspecting the supplied index. It calculates practical points on the server; client completion flags and scores are irrelevant. A locked transaction stores evidence and the server receipt once.

## Validation results

- Unit/integration/PostgreSQL checks: **34 passing tests across 4 files** after the final privacy check.
- Playwright: **5 passing browser tests**, including the complete local Assignment 01 flow, editor/terminal recovery, mobile width, incomplete submission and instructor guard.
- ESLint: passed.
- Strict TypeScript and production Vite build: passed. Output is split into application, Git and editor chunks. In a build without backend variables, Vite removes the unused Supabase client code and reports an empty Supabase chunk; this is expected for local practice.
- Deno check of the actual Edge Function import graph: passed.
- Dependency audit: **0 known vulnerabilities** after compatible dependency patches. Packages are pinned and a lockfile is included.
- Embedded PostgreSQL executed the real migration and seed. Security tests checked every application table’s RLS flag, owner isolation, protected instructor/finalization/grade writes, rate limits, idempotent receipts, immutable finalization, approved retakes, grade bounds and private/published result access.
- Git security/reliability checks cover forged object bytes, disallowed metadata, dirty working files with a supplied stale index, staging separation, safe conflict failure, both merge paths, missing files, invalid commands and recovery.

These checks are local evidence, not certification of hosted security, WCAG compliance, SMTP delivery or production load capacity. Exact logs are reproducible with the README commands.

## Deployment status and required setup

No GitHub repository was created or pushed, no Pages site was deployed, no Supabase project was created/modified, and no real student record was uploaded. The existing course PPTX is unchanged. A dedicated production project and GitHub repository must be deliberately configured and staging-tested before student use.

Required frontend variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BASE_PATH`. Required Edge secret: `ALLOWED_ORIGIN`. Supabase supplies its server URL and service-role runtime key; neither secret belongs in frontend variables. The deployment workflow requires the two public backend variables before publishing.

Manual setup: provision dedicated development/production Supabase projects, apply migration and seed, configure email confirmation/SMTP/redirects, authorize the initial instructor by verified UUID, deploy the Edge Function with its import map, set its exact origin, connect a new empty GitHub repository, configure Pages/Actions variables, and execute the hosted acceptance checklist. No invented project IDs, credentials or remote URLs are embedded.

## Known limitations and future improvements

- Hosted authentication, cloud persistence, final submission and instructor grading need the configuration/acceptance above; they are not live in unconfigured local practice.
- Question management currently edits private instructor rubrics. The required twelve written prompts are preserved. Optional MCQ auto-scoring, a general question/assignment creation UI and new trusted validators are future extensions; schema and frontend question rendering already distinguish the specified kinds.
- Server validators currently recognize Assignment 01 version 1. Future assignments require their own versioned validator and seed, not arbitrary client-supplied grading rules.
- Accessibility paste exceptions are class-wide. Per-student accommodations and a roster/SSO enrollment integration are future improvements.
- Filesystem/history/request limits are documented in the README. Packed Git, remotes, conflict resolution, advanced merge strategies and OS shell commands are intentionally outside this course lab.
- Terminal/editor vertical resizing and terminal focus are available; Explorer resizing uses native CSS and is not a full draggable IDE split-grid manager.
- Cloud checkpointing is manual, with explicit disclosed save/restore. Automatic background draft synchronization was rejected by automatic approval review and replaced by this safer local-first flow. Final submission still sends its expressly reviewed data to the configured dedicated project.
- IndexedDB is device/browser-local; there is no multi-tab collaboration or full offline service-worker installation. Export or save a checkpoint before changing devices; cold offline loading is not guaranteed.
- The activity viewer is a supporting timeline and commit snapshot inspector, not a deterministic verified replay. It does not claim to prove human authorship or prevent cheating.
- Retention defaults to a documented manual institutional policy, not an installed destructive cleanup job. GitHub Pages custom security headers require an alternate host or proxy.

Production release should follow the exact staging acceptance and rollback instructions. Additional improvements can add institutional SSO, per-course instructor scopes, per-student accommodations, objective grading for future assignments, richer multi-lane terminal graphs and approved background synchronization.
