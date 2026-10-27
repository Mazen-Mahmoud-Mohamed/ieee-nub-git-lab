# Student recovery from history mistakes

## Student workflow

The Workspace now offers **Restart Attempt** with an explicit, cancellable confirmation. It lists files, commits, branches, staging, Git identity, terminal activity, answers, flags and provisional progress as work that will not carry into the fresh workspace. Profile details, previous submissions and official grades are preserved.

- Assessed assignments receive a new server-authorized attempt ID and an isolated persistence key. The previous attempt is retained with status `restarted`, its accepted checkpoint remains intact and further edits/submissions are rejected. Unsynced work remains on the original device under the old attempt's key. Previous attempts are linked from My learning, and an archived workspace links to its successor.
- Restart uses the current published assessment and the existing attempt-limit, retake-credit, publication and deadline policies. Archived attempts still count toward the limit. A denial rolls back the entire transaction and leaves the current attempt intact.
- The existing instructor-only **Approve a new retake** action can now authorize recovery for an active assignment. It grants one ordinary retake credit without resetting or submitting the work. Students cannot grant themselves credit.
- Active exams cannot restart or receive early retake approval. Finalized submissions cannot be reset; their existing approved-retake path is preserved. Expired or closed assignments cannot restart.
- Browser-local practice saves a separate IndexedDB recovery copy before recreating the published starter. It clears active answers, flags, Git state and provisional progress, then persists the fresh workspace. It creates no assessed attempt or account changes.
- If the restart response is lost, the original workspace stays locked. Retrying the same request recovers the same successor ID without consuming another attempt. A definite policy rejection refreshes server state before allowing editing again.

Existing review-answer policies still govern server evidence disclosure. No Git history is silently rewritten, and no missing points are awarded.

## Before-commit warnings

When genuinely new introductory files are staged with other changes, the terminal displays a History warning identifying the staged paths and explaining the focused-commit requirement. It explains that later commits cannot split the original introduction. The valid Git command remains executable without another confirmation.

Warnings apply to the published legacy focused-introduction rule. They do not impose restrictions on unrelated custom assessments, ordinary tracked edits, untracked-only files, single focused introductions or recreation of files already present in reachable history.

## Implementation and safety

The existing `start_assessment` RPC resumes active attempts, so it could not directly recover bad active history. The new `restart_assessment` RPC delegates fresh-attempt authorization to that same lifecycle inside a transaction. Ownership, verified profile, active assignment state, deadline and checkpoint revision are checked. Enrollment and attempt locks serialize the transition; replay returns `restarted_to` instead of forking again.

The migration adds the retained-attempt status/link and guards against subsequent changes or grading of archived attempts. It adjusts state retrieval for archives without a checkpoint and excludes restarts from submission counts. It does not delete or backfill snapshots, answers, results, grades or published definitions.

The frontend waits for pending autosave, locks edits and persists old local evidence before requesting the transition. New attempt IDs produce new workspace keys; autosave consent is not carried over. Old checkpoint writes are rejected by the existing finalized-state checks. The existing Git simulator, starter factory, serial queues and IndexedDB mechanisms are reused. Grading predicates and point allocations are unchanged; only historical-recovery feedback changes in the evaluator.

Primary implementation files:

- `supabase/migrations/20261027140000_safe_attempt_restart.sql`: lifecycle RPC, status/link, archive guards, state/report updates and instructor approval extension.
- `src/hooks/useAssessmentSession.ts`: assessed restart, pending-save handling, uncertain-response recovery and stale-tab locking.
- `src/hooks/useLab.ts`: queued practice reset with a separate recovery copy.
- `src/features/assessments/RestartAttempt.tsx`: confirmation, cancellation, errors and keyboard focus.
- Workspace, application routing, dashboard, session/result views and instructor detail: policy-aware controls and retained-history navigation.
- `src/features/terminal/commitWarning.ts` and Terminal: staging warnings independent of command execution.

## Verification

- **123 unit/integration tests passed**, including local PostgreSQL permission and lifecycle tests, denial rollback, approved credit consumption, stale revisions, idempotent retries, exam/deadline/publication restrictions, retained checkpoint and official-grade data, archive grading guards and immutable published versions.
- A fresh real simulated repository can complete the original requirements for **75 mandatory practical points**; the invalid previous repository remains unchanged.
- **9 local browser tests passed**, including a combined introductory commit that executes despite the warning, cancellation, the local recovery copy, fresh progress and reload persistence.
- **27 connected browser fixture tests passed**, including assessed-attempt isolation, cleared new answers, retained read-only old work, denied restarts and recovery after a lost accepted response. The three focused assessed-restart checks passed again after the confirmation refinements.
- TypeScript, ESLint and production build passed. Desktop/mobile confirmation screenshots were inspected; the 390px layout has no horizontal page overflow.

## Release status

Implemented and verified locally. This feature has not been pushed or deployed, and its migration has not been applied to production. Production records remain untouched.

A release must apply the migration before deploying the frontend; otherwise the assessed restart RPC will be unavailable. Redeploy both Edge Functions for the updated shared historical-recovery feedback. Do not reset old attempts, backfill grades, increase attempt limits or grant retakes globally. An assignment with no remaining attempt or approved retake will intentionally require instructor approval.
