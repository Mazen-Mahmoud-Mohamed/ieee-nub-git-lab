# Admin content and data management — 28 October 2026

Status: implemented and tested locally. This work has not been deployed; no production database, account, grade or student record was changed or deleted.

## Audit and design

The existing platform had institution-wide instructors, immutable assessment versions, editable JSON drafts, copied question-bank entries, student enrollments, policy-controlled attempts, verified checkpoints, submission evidence, official grading summaries and recovery requests. It had no separate sensitive-data administrator permission and no course/lesson content store. Existing archive controls were spread across pages; native draft removals lacked record-specific confirmation.

The implementation retains that architecture. It adds versioned course/section/lesson content, a shared lifecycle confirmation, a bounded Archive & Trash area, activity history and an explicitly provisioned data-administrator permission. Published learning material is public, as the original static learning guide was; drafts and management endpoints are instructor-only. Course organization does not introduce enrollment-based access restrictions or change the existing institution-wide instructor scope.

## Features and locations

- **Courses & lessons** (`/instructor/content`): create courses, their sections and lessons; edit plain text and up to 20 labeled HTTPS resources; save private drafts; publish retained versions; inspect, archive, restore and manage eligible content. The original six Git lessons are initialized as versioned, editable records. With a configured backend, student learning pages read the managed catalog, including ancestor publication/archive rules. Local practice without a backend retains its static guide.
- **Assignments / Exams**: separate active/archived views, explicit visibility control, duplicate, edit and shared record management. A restored assessment remains unpublished until the instructor explicitly makes its published version visible.
- **Assessment editor**: associate an assessment with a course; remove draft sections, tasks, questions, completion checks and starter content with exact-scope confirmations. A task must retain at least one completion check. Published criteria and existing attempts remain pinned. Removing a draft element does not delete historical copies.
- **Question bank**: active/archived filters and shared archive, restore, Trash and eligible permanent deletion. Bank copies embedded in drafts/published versions and private answer keys are independent and remain intact.
- **Submissions / Grades / Student attempts**: existing name/email/student search, assessment/type/status/date filters and CSV export remain; course and archive/trash filters are added. Attempt inspection has shared management actions. Searches reached from Archive & Trash use the exact student ID.
- **Help requests**: resolved requests can be archived/restored. Pending requests must be answered first. Archiving does not remove the student’s decision/reply or allow duplicate requests.
- **Archive & Trash** (`/instructor/records`): filter type/state/search; inspect eligibility and exact IDs; act on one record or up to 25 selected records of one type. Only common supported actions appear for a batch. There is no Delete All action.
- **Activity** (`/instructor/activity`): paginated legacy and new administrative events, actor/date/reason, record type/identifier and optional before/after metadata. New audit rows remain after permanent deletion and cannot be edited or deleted through the app.

## Supported action policy

| Record                                                                                        | Archive / restore                                   | Move to Trash                                               | Permanent deletion                                               | Protection                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never-published assessment draft with no enrollment or attempt                                | Instructor                                          | Instructor                                                  | Instructor, from Trash only                                      | Draft, legacy draft sections/tasks/questions/rubrics and course links are disclosed together. No published version or student relationship may exist. |
| Published assessment or assessment with enrollment/history                                    | Instructor                                          | No                                                          | No                                                               | Immutable versions, private keys, attempts and submissions must remain addressable.                                                                   |
| Course / section / lesson                                                                     | Instructor; parent must be restored first           | Only without child items or course links                    | Only never-published, childless, unlinked items already in Trash | Published learning snapshots remain immutable. Archiving a parent hides its descendants without rewriting them.                                       |
| Reusable bank question                                                                        | Instructor                                          | Instructor                                                  | Instructor, from Trash only                                      | Only the standalone bank copy is removed; assessment copies/keys remain.                                                                              |
| Student attempt                                                                               | Explicit data administrator; listing change only    | Only an invalidated, unsubmitted assignment without a grade | Never                                                            | Underlying attempt/evidence stays, so attempt counts and historical links cannot be bypassed.                                                         |
| Pending, submitted, graded or expired exam / official submission                              | Data administrator may archive its admin-list entry | No                                                          | No                                                               | No invalidation or grade reset. Student access and official evidence remain.                                                                          |
| Submitted/graded assignment, restarted history, official grade                                | Data administrator may archive its admin-list entry | No                                                          | No                                                               | No silent recalculation, erasure or invalidation of official work.                                                                                    |
| Resolved recovery request                                                                     | Instructor                                          | No                                                          | No                                                               | Retained with its attempt, including decision and reply.                                                                                              |
| Pending recovery request                                                                      | Answer first                                        | No                                                          | No                                                               | Cannot be hidden from the working queue before a decision.                                                                                            |
| Auth account / profile / enrollment / isolated answer, checkpoint, grade or published version | No standalone delete control                        | No                                                          | No                                                               | These are identity/evidence dependencies, not independently disposable content.                                                                       |
| Local browser practice                                                                        | Not a server record                                 | Not remotely manageable                                     | No admin filesystem deletion                                     | Practice and recovery backups stay on the student’s device.                                                                                           |

Archive is a reversible listing/publication choice. Trash is a reversible administrative soft deletion. Invalidation closes an eligible unsubmitted assignment permanently as `invalidated`, retaining evidence read only. It neither grants a retake nor starts another attempt; normal attempt limits/deadlines still apply. Restoring a trashed invalidated attempt does not reinstate it. Resetting progress and starting a new attempt remain separate existing student/policy workflows. A submission is not detached or deleted independently of its protected attempt.

## Authorization, atomicity and audit

Instructors retain their existing institution-wide content scope. Sensitive student-record operations additionally require `public.is_data_administrator()`, which requires both instructor membership and a row in `private.data_administrators`. Nobody is granted this permission automatically. There is no frontend role-grant endpoint and no general database privilege in the browser.

All writes go through server RPCs with an empty search path. New tables deny direct authenticated writes. Student and anonymous management calls fail on the server, even if frontend controls are manipulated. Read-only public course browsing returns only retained published documents whose complete ancestor chain is available; draft titles/text and private assessment keys are not exposed.

Management RPCs lock source rows and validate current permissions, policy, eligibility and revisions for the entire selection before mutation. Batches are limited to 25 distinct IDs and execute in one transaction. Concurrent confirmations cannot silently overwrite a changed record. A stale record, unsupported action or foreign-key failure rolls the batch back. Per-record revisions also advance for supported older editors. Archived/trashed content cannot be implicitly revived by an edit endpoint.

Permanent deletion requires Trash first, a reason and a typed `DELETE n`. Trash/invalidation and bulk actions also require a reason and exact typed action/count. Confirmations identify exact records and consequences. Network failures are described as uncertain; the UI asks for a refresh rather than falsely claiming that nothing happened.

`public.admin_activity` stores action, record type/ID, actor, server timestamp, reason and minimal before/after flags/counts/revisions. It does not copy answers, file contents or private grading rubrics. Record IDs deliberately have no cascading foreign key so deletion cannot erase audit history. Actor deletion can null only the actor reference without altering the remaining event. Privileged grants/revocations of data-administrator membership are also audited.

Invalidation uses the existing finalized-state boundary: repository mutation, server checkpoint acceptance, submission and grading are blocked afterward. Already-open student workspaces lock on their normal state poll; reload retains old local/accepted evidence. The confirmation explains that the invalidation reason is student-visible. That original reason and invalidation timestamp/actor are retained separately from later archive/trash notes. The student sees the reason, read-only state and the fact that no grade or extra attempt was granted.

## Relationships and deletion review

- Assessments have restricted published-version/private-key and attempt references. Any published version, enrollment or attempt makes them ineligible for Trash/permanent deletion.
- Eligible legacy draft sections cascade only to their draft tasks; eligible draft questions cascade only to their rubrics. The confirmation lists these counts. Draft documents and course associations are explicitly removed inside the same transaction.
- Attempt evidence tables normally cascade from attempts, but the app never hard-deletes attempt rows. All checkpoints, commands, answers, task results, grades, request references and restart links are therefore retained.
- Learning parents and assessment/course associations use restrictive foreign keys. No parent purge silently removes children, published snapshots or course mappings.
- Question-bank entries are copied into assessment documents; purging a bank entry does not alter those copies or private keys.
- There are no uploaded storage assets managed by these new controls. Resource links do not trigger external file/object deletion. New foreign keys or storage models must extend the eligibility/impact policy before deletion is enabled for them.

## Migration

`supabase/migrations/20261028010000_admin_content_management.sql` adds:

- Private data-administrator membership and record-management revision/archive/trash metadata.
- Retained administrative activity and immutable audit guards.
- Learning items, private drafts, immutable published versions and assessment/course associations.
- New management, catalog, course-organization and filtered-attempt RPCs, RLS and supporting indexes.
- An additional `invalidated` attempt status, read-only/grade guards, and a backward-compatible `assessment_state` wrapper carrying the reason.
- Compatible instructor counter/query changes that do not count invalidated attempts as submissions and do not show archived requests in normal queues.
- A new course, section and six editable lesson versions initialized from the original public Git teaching material. No existing assessment/student row is backfilled or rewritten.

The existing attempt-status check is widened; it is not a reset or data migration of attempts. The actual migration is exercised on a populated legacy test database and every original public/private/Auth row is compared before and afterward.

## Verification

The final verification run passed. All write tests use isolated local PGlite/PostgreSQL data; production was not used for deletion tests. Browser authentication is simulated locally, but the new management browser journeys execute the actual migrations, role checks and RPC transactions, rather than mocked successful CRUD responses.

- Unit/integration: **145 tests passed across 16 files**, including the populated-database migration preservation check.
- Browser: **46 tests passed**: 11 local-practice journeys and 35 connected UI fixtures, including five new management journeys backed by the real local PostgreSQL migrations and RPCs. Both Playwright last-run reports record `passed` with no failed tests.
- TypeScript (`npm run typecheck`), lint (`npm run lint`) and production build (`npm run build`): **passed**. `git diff --check` also passed.
- Coverage includes authorized/unauthorized delete, archive/restore, released exam-grade protection, invalidation/limits, copied question preservation, immutable versions/audit, concurrent/stale operations, atomic rollback on a retained foreign key, course filtering, request retention, empty states, typed confirmation, keyboard cancellation and mobile overflow.
- These are not live deployment or full WCAG certification claims.

## Exact deployment sequence

1. Review this policy and the final diff. Verify the authenticated account/project is the dedicated IEEE project `spldzxeqxwicnffnkizm`; never use an Athar project. Record private fingerprints/backups of existing production data and verify no schema/function drift.
2. Test the migration against a staging copy first. Use `supabase migration list --linked` and `supabase db push --linked --dry-run`; the expected new migration is exactly `20261028010000_admin_content_management.sql` after the eight existing migrations. Investigate unexpected migrations before continuing.
3. Apply the reviewed migration through the existing privileged procedure: `supabase db push --linked --project-ref spldzxeqxwicnffnkizm --skip-vault --yes`. Run this only after the preceding project, staging, drift and dry-run checks pass. Do not reset/recreate the database, replay seeds or push roles/config. Widening the status constraint briefly locks the attempts table; schedule the migration appropriately. Compare original row fingerprints afterward.
4. A privileged operator must explicitly select the verified instructor UUID allowed to manage student records. Provision only that UUID, for example with the following guarded statement; replace the placeholder, do not run it as written:

   ```sql
   insert into private.data_administrators(user_id)
   select i.user_id from private.instructors i
   join auth.users u on u.id=i.user_id
   where i.user_id='<verified-instructor-uuid>'::uuid
     and u.email_confirmed_at is not null
   on conflict do nothing;
   ```

   Verify `is_data_administrator()` in that user’s authenticated session. The grant is audited. Routine content administration does not need this extra permission; student-record changes do. No existing instructor is silently promoted.

5. Deploy the frontend through the existing GitHub Pages pipeline only after the database APIs exist. Keep existing project/base-path configuration. Run the existing verifier checks: no Edge Function source or runtime grading logic changed; the model change is an optional TypeScript field, so a function redeployment is not required by this diff.
6. Use authorized isolated production accounts/data to verify course publication, role separation, bulk archive/restore, eligible content purge, stale-action failure, invalidation, retained official work and responsive layouts. Compare existing records again. Never delete real student data as a smoke test.
7. Retain the schema/audit on rollback. Do not drop invalidated status, restore/reset the database or delete attempt history. Older clients remain server-enforced read only for invalidated records, but a presentation rollback must retain the invalidated-state explanation to avoid misleading result pages.

## Limits

No production migration, role grant, commit, push or deployment has been performed for this change. Learning parents are fixed after creation to preserve the hierarchy; create a new item and archive the original to reorganize material. Instructor scope remains institution-wide; per-course instructor ownership/enrollment ACLs are not introduced. Official submissions/exams/grades remain retained rather than offering a destructive retention override. Uploaded-file hosting and external storage deletion are not introduced. The UI remains English with direction-aware course text/resources. Permanent audit and attempt tombstones are intentional; they preserve integrity and attempt limits rather than serving as orphaned content.

## Subsequent local extension

The mobile redesign and learning sessions now build on this implementation. Use [the consolidated pending release report](MOBILE_LEARNING_SESSIONS_RELEASE.md) for the combined migration → upload function → frontend sequence and current verification. Neither pending feature has been deployed. Uploaded presentations extend the original no-upload scope described above; lessons with retained uploads are protected from hard deletion.
