# Assessment definitions, timing and interruption policy

## Version and workspace model

The existing `assignments` table is retained as the shared assessment catalog. Its `type` is `assignment` or `exam`. `assessment_drafts` holds instructor-only editable JSON; `assessment_versions` holds immutable public definitions. `private.assessment_keys` holds objective answer keys and explanations separately. A published version is inserted, never edited. Attempts retain `(assignment_id, assignment_version)`, the server start time and a captured deadline. Editing availability or duration in a later version does not change those fields.

Catalog lifecycle is Draft → Published, with Open/Closed derived from availability, followed by optional Archived. Unpublishing blocks new starts but preserves access to an owned historical attempt. Submitted work is never deleted when definitions or reusable bank questions change. Existing attempts, snapshots, written answers and grades survive the additive migration.

IndexedDB keys are `assessment:<user>:<assessment>:v<version>:<attempt>`. Starting another assessment or an approved retake cannot reuse a different attempt's files, Git index, refs, history or answers. A matching legacy per-user active attempt is copied into its new key without deleting the old record. Starter files/repositories are cloned into a fresh filesystem per attempt.

## Safe practical rules

Each task has a title, instructions, points, bonus flag and a bounded list of rules. Every rule must pass for that task to earn its points. Task, section and question ordering is stored in the definition. The builder exposes:

| Rule       | Verified state                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| repository | Initialization, optional current branch and clean working files                                                    |
| file       | `.txt` file on a branch or in working files; existence, normalized exact/contained text, or minimum nonempty lines |
| branch     | Required named branch reference exists                                                                             |
| commits    | Minimum reachable commit count for a branch                                                                        |
| message    | Expected text in a reachable commit message                                                                        |
| merged     | Source branch tip is an ancestor of the receiving tip; optional actual joining merge commit                        |
| isolation  | File introduction after a parent without that file in the feature history                                          |
| legacy     | Named, fixed Assignment 01 compatibility outcome                                                                   |

Expected text can substitute `{{name}}` and `{{department}}` from the authenticated profile. No regex interpreter, JavaScript expression, SQL fragment, shell script, or arbitrary instructor code is evaluated. Git history is internally consistent evidence, not proof that a human personally typed each command or that a branch had a particular name at an earlier instant.

For the example “feature/login → login.txt → commit → merge into main”, add file-on-main, required-branch, minimum-commits and merged-source-to-target rules. A source-defined special case is unnecessary. Original Assignment 01 uses its fixed compatibility checks to preserve the detailed separate-introduction and goal-update requirements.

## Questions and scoring

Question kinds include single choice, multiple select, true/false, short answer, long answer, scenario and terminal-output interpretation. Written kinds always require manual grading regardless of an omitted/false manual flag. Objective kinds are automatically graded unless the instructor explicitly requires manual review. Multiple select uses exact set equality, with no partial credit. Unanswered objective questions receive zero. Required questions can gate manual submission; expiry always accepts partial work.

Keys and explanations are stripped from published student documents. The new Edge endpoint retrieves keys through a service-only verification context, never through a student response. Practical scores and objective scores are computed from verified evidence. Manual grading is bounded to the pinned question's point allocation. The total is verified practical points plus objective and manual theory points; optional bonus is added on top of the normal maximum. Results remain private until released. Immediate release applies only if no manual grading remains.

## Server deadline and expiry

`start_assessment` locks enrollment, checks confirmed identity/profile, publication/window, attempt count and retake allowance, and either returns the existing active attempt or creates one. Deadline is the earliest of the exam's start plus duration, assessment availability end, and optional deadline. Start/deadline are database timestamps; no browser-supplied time is accepted. The old `start_attempt` RPC delegates to the same policy so it cannot create an untimed exam.

The visible timer derives remaining time from server timestamps and `performance.now()`. Refresh requests the same attempt; a new tab cannot restart the duration. Periodic server reads correct drift or sleep. Even if a student tampers with display state, every accepted checkpoint rechecks the deadline with `clock_timestamp()` after obtaining the attempt lock. Work whose verification completes after the deadline is discarded; the server finalizes the previously accepted checkpoint instead.

After explicit per-project/per-attempt autosave consent, the browser sends changed work at 15-second intervals, or immediately when Save now is clicked. The Edge Function validates bounds, canonical Git-object hashes, repository relationships, question IDs/options and private objective grading. Only its service role can store a verified checkpoint. Checkpoints carry an expected revision and an idempotency key. Repeated requests with the same key return the existing revision; a stale revision from a second tab fails and pauses editing rather than overwriting newer work.

At expiry, the database atomically copies the last accepted verified checkpoint into final snapshot, answer, outcome, activity and grading rows, generates the receipt, and marks the attempt expired/auto-submitted. Written answers remain for instructor review. This also happens on the returning student's state request or a late checkpoint call. To handle abandoned tabs, install `supabase/exam-expiry-schedule.sql`: Supabase Cron invokes the service-only expiry function every minute. Scheduler delay affects receipt-generation latency, not the acceptance deadline. The expiry SQL and cron job require no separate application server or HTTP credential.

## Interruptions and multiple tabs

- Local IndexedDB saves remain available through ordinary refreshes. Browser storage is not a backup; export before clearing it or changing devices.
- Consent is off by default. Enable server autosave promptly inside the attempt. Without an accepted checkpoint, an abandoned expired exam has no submitted student work and scores zero on automated evidence. The disclosure identifies the configured project and coursework fields transmitted. Consent does not grant instructor privileges or permit use of another project.
- An already-open workspace can continue locally through a brief interruption. Save failures are visibly reported and transient requests are retried. Only a checkpoint accepted before the server deadline counts. No automatic late-work grace or clock-based extension is granted.
- Final manual submission retains its exact envelope and idempotency key for retry after a lost response. It cannot create duplicate final attempts. After a finalization receipt, the workspace becomes read only and restores the server-frozen view; unsynced later text is not displayed as submitted evidence.
- Use one tab per attempt. A second tab shares the same deadline. If it attempts to save an older revision, editing pauses and the student must reload the accepted server checkpoint. Local answer text can be copied/exported before restoring if allowed by course rules; it cannot be uploaded after expiry.
- The instructor may approve a distinct retake following the institution's interruption policy. The original final evidence and score remain unchanged. No hidden late-write override exists.

## Deployment acceptance

Apply the additive migration, deploy `assessment-attempt`, set its exact allowed origin and install/check the expiry job in the verified dedicated staging project. Test a real email-confirmed student, actual PostgREST relations, an on-time accepted checkpoint, an abandoned expired exam, late rejected edits, a written grade and released result. Local PostgreSQL and intercepted UI fixtures do not prove remote SMTP, gateway or cron installation.
