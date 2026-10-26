# Instructor dashboard completion — 27 October 2026

## Completed features

The existing website now has Overview, Students, Submissions, Assignments, Exams, Question Bank and Results navigation. The main navigation shows **Admin Dashboard** only after Supabase confirms instructor membership.

Overview totals come from database counts. The student roster joins only required profile/contact fields with the authenticated email and registration date, including accounts whose profiles are incomplete. Search, canonical faculty filters, student details and all assessment attempts are available. Submission/results reads are paginated in Supabase with stable timestamp/ID ordering. Filters cover student name/email/ID, faculty, assessment, assignment/exam, status, UTC dates and inclusion of ongoing attempts. Archived assessments and older submissions remain retrievable. CSV export fetches all matching pages and protects user-controlled values from spreadsheet formula execution.

The submission viewer uses the pinned assessment version and actual stored evidence: finalized snapshots or accepted ongoing checkpoints, files, commit history, branches, merges, stored practical results, expanded requirements, recorded commands, every question and answer, and instructor-only answer keys/rubrics. Missing logs are explicitly identified; client-provided activity is not presented as trusted replay. Partial draft marks are stored independently of official results. Finalization and release are explicit actions with confirmation; drafts do not alter previously released marks.

The existing form builder supports assignment/exam creation, editing drafts, duplication, sections/tasks/rules, questions and points, dates, duration/attempt limits, result-release settings, starter files/repository import, ordering and versioned publishing. Dedicated assignment/exam lists are paginated. Drafts can be tested in an isolated real-Git student preview with no student attempt or upload. The private question bank supports editing, creation, search/type filters, pagination, reuse, keys/rubrics and reversible archiving. Rules within a task are checked together; instructors can add separately scored tasks to award partial credit per requirement without changing the published scoring schema.

## Database and authorization

Dedicated project: `spldzxeqxwicnffnkizm`. Two additive migrations add indexes, instructor-only bounded read RPCs, a private grading-draft table, validated draft saving and instructor-only review context for private keys/accepted checkpoints. A trigger removes obsolete drafts when official grading is finalized. Existing rows, public table grants/RLS, published versions, server deadlines and Cron are preserved. No service credentials enter frontend source or configuration.

The user-designated account `mazenmahmod397@gmail.com` was found as email-confirmed with UUID `f4fecf7b-5177-4dbb-b17f-64ab1bb03bb2`. Only this verified account was explicitly inserted into the existing `private.instructors` membership table in the dedicated project. No frontend email check or automatic registration privilege was introduced. Future provisioning requires an administrator to verify the exact Auth UUID and confirmed email, then insert that UUID into `private.instructors`; students cannot call a provisioning API. Refresh the website after membership changes so navigation reloads its role check.

## Automated verification

TypeScript, lint, production build and 94 unit/integration tests passed. These cover the migration, denial of every admin RPC to students, private data access, complete multi-page retrieval, real-count semantics, expected contact fields, filtering, independent draft grading, mark bounds, explicit release and CSV injection protection. All 7 local browser tests and 22 connected browser tests passed, including the original Assignment 01 and Git simulator, exam timer/autosave/conflict flows, all admin navigation, paginated CSV export, student preview, private finalization and release. Browser fixtures are test-only and never supply dashboard data in the finished application.

## Live acceptance and deployment

The tested migrations are applied to the dedicated staging database. Frontend deployment and real hosted acceptance results will be recorded after validation completes. Synthetic acceptance accounts are explicitly marked staging fixtures; their temporary instructor membership is removed after testing. The owner's account is not used to create test submissions.
