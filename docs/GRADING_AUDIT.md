# Auto-grading audit — 27 October 2026

## Reported Task 3 result

A read-only investigation of the saved, verified, in-progress Assignment 01 version 1 checkpoint reproduced **30/75 practical points and 4/8 introductory checks** before the fix. The original commit introduced `about.txt`, `goals.txt` and `notes.txt` together and did not use `Add personal information`. All three introductory contents matched. Later commits with the requested message modified an existing file; they were not introductions.

The three failed focus checks and failed original-message check were correct. The order check was a false positive: inclusive ancestry allowed the same commit to count as three ordered introductions. After the fix the same privately saved evidence produces **30/75 and 3/8**, with order correctly incomplete. The score stays the same because Task 3 never satisfied all its scored conditions. The valid tasks are repository 5, required files 10, goals update 10, and clean main 5.

No actual student snapshot, checkpoint, branch, answer, attempt version or finalized grade was modified. The investigation's private payload remains ignored outside the committed audit. Regression fixtures use fabricated identities and repositories.

## Confirmed defects and fixes

- **Commit selection depended on traversal order.** A head-first `find` could select deletion/recreation or an unrelated branch introduction. `gitHistory.introduction` now uses the earliest unique introduction in the requested ref's reachable graph. Later edits/reintroductions do not replace it. Incomparable introductions are ambiguous and do not receive introductory credit. Timestamps, commit-array order and terminal messages are not used to infer sequence.
- **Focused commits ignored deletions.** Changed paths now use the union of parent/current tree paths, including removed files. Focus requires an actual introduction and exactly one changed path.
- **Order was not strict.** Version 1 requires distinct about → goals → notes ancestors. Its additional-goals commit must also be strictly after notes. The duplicated update predicate was consolidated for scored outcomes and the checklist.
- **Revision 2 could select a later good introduction.** It now applies focus/content/message conditions to the actual first introduction. The quoted personal-information message is checked exactly rather than lowercasing it. The message checklist independently examines the actual introduction, so a combined introduction with the right message does not falsely fail its message check.
- **Revision 2 coupled the goals update to the separate-introduction task.** The independent tracked goals update now compares against the real first goals content, retains the original goals and requires at least two additional goals in a later descriptive commit. A focus or personal-message failure does not incorrectly erase this independent credit. Invalid original goals do not qualify.
- **Some-parent introduction checks misidentified merges.** A file must be absent from all parents to be introduced by a commit. Legacy and generic isolation rules use the shared first-introduction graph evidence; deletion/recreation cannot disguise an inherited root file.
- **Bonus merge checks allowed one parent to satisfy both contributions.** The two parents must genuinely diverge from shared history, separately contribute hobbies and completion-note histories, and produce the required merged content. At least three hobbies must survive the merge. Generic rules requesting a merge commit also require divergent source/receiving parents while retaining support for valid multi-parent merges; ordinary merge rules still accept a valid fast-forward.
- **Feedback obscured evidence and repair limits.** Failed legacy requirements now carry expected/detected evidence and a correction hint. Introductory checks include the short commit ID, message and complete changed-path list. Historical failures explain that later commits do not rewrite introductions and direct students to an instructor-approved correction or fresh attempt. There are no destructive reset instructions or automatic grade increases. The task panel explains whole-task scoring and shows earned/available task credit.

## All nine published tasks

The immutable version 1 document in `tests/fixtures/published-assignment-01-v1.json` and the explicit version 2 contract in `correctedAssignment.ts` were reviewed against the shared validator.

| Task                   |      Points | Required evidence and audited behavior                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             |           5 | Initialized project, configured name and valid email. Version 1 needs a committed main ref; version 2 accepts initialized main before its first commit.                                                                                                                                                                                                              |
| Required files         |          10 | Profile-specific personal information and published goals/notes content. Version 1 scores committed main content; version 2 deliberately accepts the published editor preparation requirement.                                                                                                                                                                       |
| Separate introductions |          10 | True introductory trees/deltas, required content and exact about message. Version 1 requires strict about/goals/notes sequence; version 2 retains its published any-order, focused, descriptive introductions.                                                                                                                                                       |
| Additional goals       |          10 | Committed tracked-file update with required goals retained. Version 1 keeps three initially numbered goals, at least five afterward, at least four reachable commits and original meaningful-message conditions. Version 2 keeps its published bullet/number normalization and two-word message rule. Staging/writing are guidance, not substituted commit evidence. |
| Feature skills         |          10 | `feature/skills` tip contains all three skills and its reachable introduction evidence satisfies the existing contract.                                                                                                                                                                                                                                              |
| Isolation              |          10 | First skills introduction has existing parent history without skills and the applicable meaningful/descriptive message. Receiving a file through a merge is not a new introduction.                                                                                                                                                                                  |
| Merge skills           |          15 | Required committed skills on main and actual feature-tip ancestry. A fast-forward remains valid.                                                                                                                                                                                                                                                                     |
| Clean main             |           5 | Current branch is main, main has a commit and HEAD/index/working statuses agree. Untracked, staged and unstaged changes prevent clean credit.                                                                                                                                                                                                                        |
| Divergent merge bonus  | 10 optional | Separate hobbies/completion histories, genuine divergent two-parent merge, final required contents and hobbies-branch ancestry. Skipping it does not reduce mandatory credit.                                                                                                                                                                                        |

Required practical points remain **75**, written questions **25**, and optional practical bonus **10**. A correct mandatory repository receives 75; with valid bonus it receives 85 practical. Written/manual points are not fabricated or automatically awarded. Final overall maxima remain 100 mandatory / 110 with bonus.

## End-to-end grading and persistence

`GitEngine` operates on real isomorphic-git objects in `VirtualFS`; staging uses the index snapshot, not the latest editor text. `useLab` serializes mutations/inspection/capture and guards against stale inspections across attempts. Existing filesystem timestamp, queue, server-restore, reload and retry behavior was retained and exercised by the existing integration/browser suites.

`requirementProgress` and `outcomesFor` evaluate the latest inspected repository and published rule revision. `verifyAssessment` independently validates the supplied Git object hashes, trees, refs, working data and supported HEAD grammar, then uses the same outcomes evaluator. Command output and client completion flags never award credit. Partial checklist progress does not create fractional task marks. Server checkpoints, submissions, receipt idempotency, private objective keys, manual marks, RLS and immutable published definitions retain their existing pipeline.

Changed implementation:

- `src/features/assessments/gitHistory.ts`: pure graph/reachability/introduction/delta/divergence utilities.
- `src/features/assignments/assignment.ts`: shared legacy evaluation, strict graph evidence, independent goals update, bonus validation and detailed feedback.
- `src/features/assessments/model.ts`: generic rules use the same graph utilities; server outcome feedback uses current requirement hints for both revisions.
- `src/features/assignments/TaskInstructions.tsx`: failed-check evidence and whole-task credit explanation.

## Regression and verification results

Added **16 regression tests** in `tests/integration/grading-history.test.ts` covering requested scenarios A–H: correct mandatory work, combined introductions, wrong exact message, correct final contents with invalid history, later modifications, correct branching/merging, corrections/recreation, and omitted bonus. Additional cases cover deleted/renamed files, deleted paths in focused deltas, ambiguous births, merge-parent introductions, branch switching, empty/untracked/staged state, detached snapshot rejection, restored snapshots, strictly later updates, invalid bonus parents, rendered feedback and repeated trusted grading.

The 30-point regression reproduces the reported pattern using a fabricated student and asserts 3/8 after correction. Correct workflows assert both revisions' exact 75 practical points, every mandatory outcome, zero optional credit, client/server equality and repeat verification equality. Existing tests cover valid 85-point bonus work and persistence/submission/database behavior. One local browser assertion was scoped to the Next step panel because evidence is now also displayed beside individual failed checks.

Completed local checks:

- **115/115** unit/integration tests, 13 files.
- **24/24** connected browser fixture tests, including actual `useLab` queue/reload/server-restore and attempt-switch races.
- **8/8** local browser workflow tests, including full mandatory assignment completion and subsequent tracked edits.
- TypeScript, ESLint and production build passed.
- The actual privately saved version 1 checkpoint was re-evaluated read-only: **30 practical points, 3/8 introductory checks, false introductory-order check**.

## Limits and release status

Published documents, point allocations, existing attempt associations and finalized grades were not rewritten. Different version contracts remain intentional, rather than silently migrating old attempts. Ambiguous independent introductions are conservatively unverified; an instructor can inspect the graph. Static Git snapshots prove content and ancestry but cannot establish the exact moment a branch name was created or prove a student viewed command output. Detached HEAD remains explicitly unsupported by the course grammar and is rejected instead of graded as a normal main repository.

Released and verified on the production site on 27 October 2026 from source `742b64162c48061af23ce1c1a2ed6e17bed2f9d7`. GitHub Pages deployment and verifier CI passed; both affected Edge Functions are ACTIVE at version 5. All five served frontend assets match the production build byte-for-byte. Four live browser practice checks passed, including the 30/75, 3/8 reproduction and correct mandatory/bonus scoring. Read-only checksums across all 25 application tables matched before and after release. No database migration or score backfill was performed. See [production deployment report](GRADING_DEPLOYMENT_REPORT.md) for evidence and verification limits.
