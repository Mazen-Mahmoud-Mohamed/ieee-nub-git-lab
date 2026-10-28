# Independent requirement scoring — final local audit

28 October 2026. **No production deployment, database operation, publication, account change or permission change was performed.** All database mutations below were executed against isolated local PGlite fixtures. Existing local work and the earlier release verification report were preserved.

## Requested checks

| Check                                     | Audit result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Independent requirement credit         | Passed for custom rules and both Git Fundamentals compatibility revisions. Each scored check earns its configured weight independently; bonus remains separate. None/one/several/all, wrong history with valid content, deterministic rechecks and authoritative snapshot evaluation are covered. Informational zero-point tasks earn no points.                                                                                                                                                                    |
| 2. Easy instructor weight configuration   | Passed in actual browser interactions. Inputs use readable requirement labels, display the assigned/task total, and report errors with the task title. The complete nine-task Git Fundamentals rubric was configured and published without entering or displaying internal check IDs in the weight controls. Test weights are explicit instructor choices, not an automatic production conversion or an equal-split default.                                                                                        |
| 3. Default for new assessments            | **Fixed.** Newly created assignments and exams now default to `requirements-v1`. New practical tasks require explicit weights. The immutable compatibility template explicitly uses the legacy constructor; existing documents without a discriminator retain legacy scoring. Historical test fixtures explicitly declare that policy. An instructor can still deliberately choose legacy scoring for a draft.                                                                                                      |
| 4. Republish Git Fundamentals safely      | Passed with all original task maxima retained: 75 practical, 25 theory and 10 bonus. A new weighted publication leaves version 1, its private keys, an active version-1 attempt, a prior finalized attempt, its receipt, written answer, task result and released official grade unchanged. A version-2 attempt submits incomplete work, gets a receipt and releases the same earned practical points. Browser coverage also publishes the full rubric using only labeled fields.                                   |
| 5. Exact weight sums and decimals         | **Fixed and verified.** Weights and practical task maxima must have at most two decimal places; every positive-point scored check needs a positive weight and the exact cent sum must equal its task maximum. TypeScript no longer accepts tiny extra decimals that PostgreSQL rejects. Decimal sums across practical, theory, bonus, result views and exports avoid binary floating-point noise; existing finer question precision is retained. SQL validates exact numeric totals independently.                  |
| 6. Versioned scores and receipts          | **Fixed and verified.** Provisional progress and the server share the check evaluator. Verified checkpoints, final task results and official summaries store earned partial credit. Dashboard grade denominators now use the attempt's pinned definition, not the latest publication. Released-result requests are bound to the attempt/policy and ignore late responses from another attempt. Instructor totals and CSV totals use exact decimal addition. Ownership, release and response-review RLS still apply. |
| 7. Incomplete submission                  | Passed in the database, desktop browser and both phone browser engines. The new policy permits incomplete tasks and unanswered questions after the explicit unfinished-work confirmation. The actual server returns the receipt and authoritative score. Cancel keeps the work open.                                                                                                                                                                                                                                |
| 8. Completion gates                       | Passed. New-policy publication requires `gateTheory=false` and `requireComplete=false`, enforced in both TypeScript and database triggers. Next Task, Questions, Review and Submit do not require task completion under that policy. Authentication, profile eligibility, consent, own-work acknowledgement, deadlines, exam expiry, finality, invalidation, attempt limits and restart approval remain enforced. Older versions retain their actual published completion gates.                                    |
| 9. Correction without losing other credit | Passed with real file edits and reinspection. Changing a failed content check restores its points without deleting file-existence, branch or bonus credit. An authoritative recheck also retains unrelated earned points when that content becomes incorrect again. Introductory history remains tied to the real original commit; no success flag, history rewrite or fabricated point award was added.                                                                                                            |
| 10. Desktop/mobile cleanliness            | Passed in executed browser tests. Desktop retains the two-thirds work area, large terminal, collapsed unopened editor and hidden phone helpers. Mobile retains mounted Task / Terminal / Files views and working drafts/input/history. Widths 320, 360, 375, 390, 414 and 430, tablet and landscape are checked for overflow; full instructor weight forms were also checked at 320, 390, 768 and 1440. Physical mobile keyboards remain a manual release check.                                                    |

## Additional fixes from this audit

- Task completion for a weighted version follows its explicitly scored checklist; a legacy aggregate validator cannot leave a fully earned rubric marked incomplete.
- Zero-point informational tasks no longer require impossible positive weights or count as scored tasks in the new-policy summary. They remain visibly unscored and are not falsely marked complete.
- Released grade and requirement-breakdown responses are loaded together and associated with the current attempt/policy. A deliberately delayed response is tested across a switch between two results.
- The pending migration now has a 5-second lock timeout and 60-second statement timeout inside its transaction. Lock contention fails atomically instead of waiting indefinitely; no historical data is backfilled or regraded.

## Executed verification

- **168 unit/database tests in 19 files passed**, including the original-row migration snapshot and complete republishing/official-grade preservation checks.
- **12 desktop browser tests passed**.
- **42 connected local browser tests passed**, including default new-assessment authoring, full Git Fundamentals weighting, pinned dashboard maxima, delayed released-result responses and partial submission.
- Android Chromium/iPhone WebKit: **4 local and 8 connected tests passed**.
- TypeScript and ESLint passed. The production build with `/ieee-nub-git-lab/` and its compiled browser smoke (1 test) passed. The dependency audit found zero vulnerabilities. All three Deno dependency checks and the diff whitespace check passed. Total executed browser checks across the successful suites: **67**.
- All three function dependency graphs are checked; only `assessment-attempt` requires redeployment for the new scoring behavior.

The local lint command excludes ignored `supabase/.temp/**` because it contains private release harnesses and extracted minified deployment artifacts from earlier work. Clean CI still runs its unchanged normal lint command.

## Exact safe deployment sequence — future actions only

**Explicit release approval is required before any production operation below.** The repository remains uncommitted and unpushed in this task. A push/merge to main automatically triggers Pages, so it must occur after backend acceptance.

1. **Pin and validate the reviewed release.** Commit the explicitly reviewed pending implementation on a review branch, preserving unrelated local work. Record its source hash. Pass the existing PR validation workflow without merging to main. Verify that production has not drifted from the migration/function assumptions. Confirm migration and Edge permissions in the dedicated Supabase account, and GitHub repository/Pages deployment permission. Stop for missing access; do not switch to another organization or reuse unrelated credentials.
2. **Verify the exact production target and preserve a baseline.** Confirm the linked project is `spldzxeqxwicnffnkizm`, in the IEEE organization, and verify the remote project identity using the authenticated account. Do not use Athar. Obtain the approved backup and private fingerprints of the original assessment versions/keys, enrollments, attempts, submissions, snapshots, task results, grading summaries, Auth/profile and instructor records. Do not print tokens, secrets or raw student records. Rehearse the migration and grader on an isolated staging copy with the actual Supabase PostgreSQL/Auth/Edge runtime.
3. **Preview migration history.** From the reviewed checkout run:

   ```powershell
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

   The only pending migration must be `20261028030000_requirement_scoring.sql`. The previously applied admin (`20261028010000`) and learning-session (`20261028020000`) migrations must already be recorded. Stop on any other pending file, wrong target or drift. Do not reset, seed, recreate, repair history speculatively or replay older migrations.

4. **Apply the single approved migration.** With the verified project and backup in place:

   ```powershell
   supabase db push --linked
   supabase migration list --linked
   ```

   Stop immediately on a timeout or error, and inspect migration history before considering a retry. Confirm the new nullable result column, validation triggers, scoped result RLS and unchanged private/public function grants. Compare original-row fingerprints, ignoring only the intentionally added null result column on old task results. There must be no historical score, receipt or definition change.

5. **Deploy the authoritative grader before the frontend.** From the same reviewed release checkout:

   ```powershell
   supabase functions deploy assessment-attempt --project-ref spldzxeqxwicnffnkizm
   supabase functions list --project-ref spldzxeqxwicnffnkizm
   ```

   Retain `verify_jwt=true`, the existing import map and server-side Supabase credentials. Verify the existing `ALLOWED_ORIGIN=https://mazen-mahmoud-mohamed.github.io`, allowed/disallowed CORS behavior, unauthorized rejection and authenticated checkpoint/submit behavior. No new environment secret is required. Do not put service credentials in the frontend. The legacy `submit-attempt` endpoint still serves its original version using unchanged legacy defaults; `learning-material` behavior is unchanged. Neither needs redeployment for this release.

6. **Release the approved frontend through the existing Pages workflow.** Confirm the repository variables still point to the dedicated Supabase project and use the existing public browser key and `/ieee-nub-git-lab/` base path. Merge/push the reviewed release to `main` only after migration/grader acceptance. Let `.github/workflows/pages.yml` run its tests/build and deploy jobs; do not bypass CI or perform a parallel manual upload. Record the actual successful run, deployed main hash and Pages environment result. The Edge workflow performs validation, not function deployment.
7. **Verify the actual live artifact and isolated workflows.** Match the deployed page/asset names and bytes to the successful Actions artifact and source hash. On the production URL, use separately authorized isolated accounts/data to check an old pinned attempt, a new default-policy assessment, explicit weights, decimal partial credit, correction/recheck, unfinished confirmation/cancellation, a real submission receipt, instructor release, the pinned dashboard denominator and released breakdown. Verify restart restrictions, help requests, mobile tabs and retained PPTX downloads. Never test destructively on real student records. Compare the original production fingerprints again.
8. **Publish upgraded course content only as an explicit instructor action.** Deploying the software does not convert Git Fundamentals. Have the instructor review/configure the full rubric and explicitly publish a new weighted version when approved. Its existing active attempts and official grades keep their old version/policy. The illustrative test weights are not automatically applied to production.
9. **Report actual release evidence or stop at the failing gate.** Do not declare deployment successful from a local build, a queued Pages run or a successful function upload alone. If a rollback is needed after weighted attempts exist, retain the additive schema and compatible grader; stop new publication/starts for affected versions and forward-fix. Do not drop scoring data, downgrade to a grader that cannot read weighted versions, reset attempts or recalculate official grades.

Production credentials, remote schema drift, real-runtime migration locks and deployed asset checks have not been exercised by this local audit. They are explicit gates for the later approved release. Real Google Drive recording permissions/playback and physical-device keyboards retain their earlier manual-check limitations.
