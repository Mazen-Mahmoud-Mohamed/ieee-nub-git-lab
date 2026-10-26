# Workspace progress fix — 27 October 2026

## Diagnosis

The exact reported command sequence was reproduced through the real Git engine and published Assignment 01 rules. Git initialization, identity configuration and file creation were actually succeeding in `/IEEE-Git-Task`. The directory and published project path matched. `main` was still unborn: no commit existed, and the three files were empty and untracked.

The existing eight required scored outcomes correctly remained incomplete under the published rules. In particular, the repository outcome requires a committed `main` reference, and the file outcome checks required contents committed on main. The interface presented only whole outcomes, hiding successful preparation and the first-commit condition. This made correct zero-point scoring look broken.

There were also real synchronization defects: editor writes did not inspect Git again, overlapping terminal operations could be silently dropped, file creation bypassed the shared mutation path, and asynchronous work could publish an inspection into a different attempt. Before initialization, inspection omitted configured global identity. These were fixed, rather than treating the report as a cosmetic problem.

## Implementation

- `src/features/assignments/assignment.ts`: exposes granular legacy requirement checks alongside the unchanged scored predicates. Preparation, committed content, focused commits, history order, branch isolation, merge ancestry and clean-tree checks share the existing validator evidence.
- `src/features/assessments/requirements.ts`: derives checks from each published task/rule, including reusable repository, file, branch, commit, message, merge and isolation rules. Dynamic project paths and identity substitutions remain supported. Missing identity, unsupported rules and failed verification receive explicit states.
- `src/features/assessments/model.ts`: caches the legacy evaluation during a rule evaluation. Scoring and published definitions are unchanged.
- `src/hooks/useLab.ts`, `src/services/SerialQueue.ts`: serialize filesystem/editor/Git mutations; inspect and publish one stable snapshot after each operation; serialize IndexedDB saves; queue snapshot capture behind pending work; guard asynchronous results by workspace key and resource generation. Restoring final server evidence immediately locks editing. Metadata, global identity and restored files are retained.
- `src/hooks/useAssessmentSession.ts`: captures stable queued evidence for server saves, includes configuration/current directory in change detection, resets per-attempt signatures, and rejects stale attempt responses. Server deadlines, revision checks, expiry and trusted grading remain authoritative.
- `src/features/assignments/Workspace.tsx`, `TaskInstructions.tsx`, `src/styles/global.css`: display individual checks, scored tasks, required sections and a local score estimate separately. Task steps, required file contents, missing conditions and contextual hints remain visible. The section navigator is compact and horizontally scrollable; current task titles stay visible while scrolling. Terminal height and instruction width can be resized. Editor drafts are protected from older inspection results and new text files can open without stealing terminal input.
- `src/features/terminal/Terminal.tsx`, `src/features/git-engine/engine.ts`: distinguish command success/failure and read-only/state-changing commands; show completion notices only after actual check transitions. Nano/Vim/Notepad fail honestly with directions to the built-in editor. Git inspection exposes configured global identity before initialization.
- `src/features/assessments/SessionBar.tsx`: compact untimed label; timed countdown retained with a synchronization placeholder.
- `src/app/App.tsx`, `src/features/submissions/Review.tsx`, `Checkpoints.tsx`: use project-scoped inspected working files and queued stable evidence for backups/checkpoints/submission.

No migrations, published assessment edits, scoring changes, private answer-key changes or authentication-provider configuration changes were needed. No unrelated Supabase project was modified.

## Regression coverage

- New `tests/integration/workspace-progress.test.ts`: exact reported sequence; global identity before initialization; granular checks with zero scored tasks; editing/staging separation; real commit authorship; restored configuration; dynamic published project/rules; identity/checking states; unrelated-file isolation; nano failure; rapid operations and queue recovery.
- Extended `tests/e2e/local.spec.ts`: displayed requirement states after the exact sequence; missing-first-commit explanation; editor content progress; immediate dirty status; IndexedDB refresh recovery. Existing full Assignment 01 browser flow still covers separate commits, goals update, branch isolation, merge, theory unlock and answer persistence.
- New `tests/browser-fixtures/workspace-sync.spec.ts` and test-only harness: actual `useLab` under concurrent edits/Git/snapshot capture, delayed inspection across attempts, persisted isolation, server evidence restoration and read-only locking. The harness is outside production source and build output.
- Existing browser fixtures continue to cover pinned assessment definitions, independent attempts, server-saved recovery, autosave consent, offline retry, revision conflicts, timer/clock changes, deadline lock, submission receipts, authentication and instructor review.

Local results: TypeScript and lint passed; 88 unit/integration tests passed; 7 local browser tests passed; all 19 connected browser cases passed (the server-restore case was rerun after correcting its fixture to respect repository-local Git identity precedence). Production build passed. Desktop screenshot reviewed; the 390px mobile test asserts no page overflow.

## Deployment

Deployed application commit: `6ad2c9a521fc5609c27988e1e26fc9cbdf108412`.

- [GitHub Pages validation and deployment](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40413143913) passed, including all 88 unit/integration tests, all 7 local browser tests, all 19 connected browser tests, lint, dependency audit and production build.
- [Both server verifier checks](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40413143881) passed.
- Both existing Edge Functions were redeployed to `spldzxeqxwicnffnkizm`; both are ACTIVE at version 3 with JWT verification and import maps enabled. No auth config push, schema migration or unrelated database change was performed.
- [Live staging workspace](https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/#/workspace) verified in a fresh browser against the actual Pages deployment. Three acceptance tests passed: the exact reported sequence and granular checks, editor content/dirty-state/refresh recovery; the full real-Git Assignment 01 practice flow through separate commits, branch isolation, merge, 8/8 scored tasks and theory persistence; mobile instructions with no page overflow and missing-route recovery.
- Screenshots of the deployed workspace were visually reviewed. Live acceptance used isolated local practice browser storage; it did not submit a real student's attempt or claim to reverify owner Google sign-in.

## Limits

Requirement feedback and point totals are local guidance; only trusted server verification produces official grades. An empty repository intentionally does not satisfy the existing first-commit scoring condition. Checks evaluate the current branch and required committed history, so changing branches or reverting files can legitimately change progress. Unsupported rules report inability to verify rather than pretending to pass.

Google OAuth's previously reported `redirect_uri_mismatch` remains a separate provider setup issue; no successful owner Google sign-in or instructor onboarding is claimed by this fix.
