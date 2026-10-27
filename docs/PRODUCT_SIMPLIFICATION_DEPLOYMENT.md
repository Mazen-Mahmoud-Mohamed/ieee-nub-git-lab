# Product simplification production release — 28 October 2026

Status: migration applied; frontend pipeline and live acceptance pending.

Production: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/

The full diff was reviewed. Scope is the shared student/instructor redesign, plain task feedback, real recovery requests, accessible navigation and related tests. A pre-release feedback bug was corrected: missing uncommitted files are no longer described as already-invalid history; committed invalid content is recognized in both published rule revisions. No grading predicate or published document was changed.

Preflight verified the dedicated Supabase project `spldzxeqxwicnffnkizm`, repository administrator access, workflow-based Pages hosting and the existing public production configuration. No Athar project was accessed. The only pending migration was `20261027150000_attempt_help_requests.sql`.

The additive migration was applied using the existing CLI procedure, with explicit project reference and `--skip-vault`. No reset, seed, role/config push, data backfill or Edge deployment was performed. The new table has read RLS and no direct authenticated insert/update permission; anonymous request RPC execution is denied. Existing restart/approval functions are reused.

Private before/after fingerprints confirm all 495 pre-existing application rows across 25 tables, existing Auth-user rows and existing database routine definitions were preserved after migration. Acceptance data will be newly created, marked and isolated; production student records will not be used for write tests.

Local verification passed: 134 unit/integration tests, 11 local browser journeys, 30 connected browser fixtures, TypeScript, ESLint, production build and dependency audit (zero vulnerabilities). The final build used the repository's public Supabase configuration and `/ieee-nub-git-lab/` base path.

No Edge Function source or dependency changed, so the existing deployed functions will be retained.

CI run, deployed asset verification, isolated production acceptance, cleanup and final preservation checks will be recorded here after completion. No frontend deployment success is claimed yet.
