# Admin Dashboard rebuild — local design review

The completed implementation is in the local review candidate at `C:\Users\mmahm\AppData\Local\Temp\ieee-admin-rebuild-review`. The original workspace still contains the earlier partial rebuild because normal writes were denied and the elevated copy request failed automatic approval review. The user authorized local edits and tests; the review service returned `content-blocked` before execution. No copy back, deployment or production database action succeeded.

## Completed architecture

| Section               | Canonical route              | Included workflows                                                                                                                       |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Overview              | `/instructor`                | Real student/attempt/publication counts, review queue, recent activity and useful next actions                                           |
| Students              | `/instructor/students`       | Server search, faculty filter, pagination, contact information, progress, student details and submission history                         |
| Assessments           | `/instructor/assessments`    | Assignment/exam catalog, question bank, unavailable templates, drafts, previews, publishing, visibility, version history and duplication |
| Submissions & grading | `/instructor/submissions`    | Search/filter/export, existing review and grading, release, help requests and released course totals                                     |
| Courses & sessions    | `/instructor/courses`        | One session editor for PPTX/recordings/content/publication, course and section organization, ordering, association and record actions    |
| Administration        | `/instructor/administration` | Server-verified account access, Archive & Trash, restore, administrative activity and accessibility settings                             |

The sidebar has six destinations. Question bank, help requests, course totals, hierarchy tools, records, activity and settings are section tabs. Legacy bookmarks redirect to these destinations and preserve relevant filters/open-record parameters. The assessment editor is a detail route within Assessments.

All sections share a branded responsive shell, consistent tables/forms/status badges, keyboard-accessible mobile navigation, compact statistics and light/dark themes. Student and submission rows become labeled cards on phones, keeping their details and actions visible. Secondary submission filters are collapsed. One session editor preserves older lesson fields and material references; the duplicate course lesson/material editor was removed. Session number, display order, topics, related assessment, description and resource links share one Advanced session settings disclosure. The shared materials component received a presentation-only extension; upload, video and material persistence logic are unchanged. New saved sessions acquire a stable editor link, and duplicating an assessment opens its new draft directly.

## Existing implementation audit

The previous instructor console offered 14 navigation destinations. Its overview, student list, assessment catalog, grading tools, learning hierarchy, direct sessions, archive, activity and settings all used the existing authenticated React/Supabase architecture.

| Previous workflow                           | Decision                                                                      | Canonical destination            |
| ------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| Overview and repeated shortcuts/statistics  | Redesign; combine assignment/exam counts, retain real server data             | Overview                         |
| Students and embedded attempts              | Retain; consolidate identity, contact, progress and submission history        | Students                         |
| Assignments, Exams, all Assessments         | Merge identical catalog implementations; filter by type                       | Assessments                      |
| Question Bank                               | Retain as a local assessment tab                                              | Assessments                      |
| Assessment draft/editor and student preview | Retain versioning, validation and private instructor data                     | Assessments → editor             |
| Submissions and Grades                      | Merge the shared Attempts screen                                              | Submissions & grading            |
| Course totals                               | Retain as a grading tab                                                       | Submissions & grading            |
| Help requests                               | Retain recovery and approval as a grading tab                                 | Submissions & grading            |
| Courses & lessons and Learning Sessions     | Merge lesson editing into one session editor; retain course/section hierarchy | Courses & sessions               |
| Archive & Trash, Activity, Settings         | Group advanced tools                                                          | Administration                   |
| Legacy route links                          | Redirect to canonical destinations, preserving query parameters               | Existing bookmarks remain usable |

## Backend and permission audit

- `instructor_overview`, `instructor_students`, `manage_attempts`, `instructor_review_context`, draft grading, `grade_assessment`, `course_gradebook` and help RPCs remain the authoritative sources.
- Assessment drafts/answer keys are instructor restricted; public immutable versions and StudentPreview exclude private answers and explanations. Preview uses isolated local state.
- Learning management RPCs require an instructor and enforce optimistic revisions. Published `learning_versions` retain content and material references. The upload endpoint validates JWT authorization and PPTX before service-only registration.
- `is_data_administrator` requires explicitly provisioned private membership. Instructor membership alone grants no destructive data-administrator privilege.
- Record actions use a server-provided capability snapshot; `manage_records` locks and rechecks each record, revisions, dependent records and permissions. Published history, submitted work, uploaded materials and append-only audit history remain protected.
- A related read-model migration, `supabase/migrations/20261113000000_admin_directory_read_models.sql`, excludes staff accounts and their attempts from student statistics/directory and corrects pending/graded counts for released results. It adds an instructor-only course-total wrapper without altering the original scoring engine. It was tested in isolated PostgreSQL and has **not been applied to production**. The frontend falls back to the deployed course-total RPC only when the new wrapper is missing (`PGRST202`), never on an authorization error. Until this migration is reviewed and applied, the deployed overview/directory retain their existing staff-inclusive behavior.

## Protected local work and resources

Initial Git inspection found the existing modified `Git Course IEEE.pptx`, untracked release/security documents, `scripts/security/`, the existing cleanup-review script and previous test logs. These are outside the rebuild and are preserved. Student course content, presentation viewer, grading engine, auth/RLS, existing migrations and Edge Functions are preserved. The new read-model migration is an unapplied local source file.

Task 1 retains 25 independent practical criteria (100 points), 15 server-graded theory questions (50 points), autosave/partial submissions, late correction recovery, immutable attempt versions, instructor finalization/release, course total 500 and certificate threshold 400.

## Student data cleanup

No student deletion is necessary to redesign the dashboard. No production cleanup, auth deletion, Storage deletion or migration is executed.

The mandatory eligibility boundary is **2026-11-13 00:00:00 Africa/Cairo = 2026-11-12T22:00:00Z**. The existing `scripts/task1-cleanup-review.sql` predates this authorization and has no cutoff guard; it is not executed or repurposed. Any future cleanup must verify Supabase project `spldzxeqxwicnffnkizm`, explicit experimental record IDs, every timestamp and dependency/cascade, protected newer descendants, counts and audit history in a scoped idempotent transaction. This rebuild does not introduce a cleanup button.

Deleted rows: **0**. Deleted auth accounts: **0**. Deleted Storage objects: **0**.

## Review and validation

The design is local only; GitHub Pages publication requires the user's final design approval.

### Screenshots

`test-results/admin-rebuild/review.html` is a filterable gallery with before/after comparisons. Before captures include every main section on desktop and 390px mobile (14 PNGs, the original dark theme). After captures include the six sections, student details, the assessment editor, submission review, help requests, course totals, session editor, hierarchy, records, activity and settings in light/dark themes across desktop, 390px mobile, Android Chromium/Edge and iPhone WebKit (128 PNGs).

Screenshots use isolated PostgreSQL fixtures rather than private production student information. Android/iPhone testing uses browser device emulation, not physical devices.

### Validation

| Check                                    | Result                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, final source                 | Passed                                                                                                                                                                     |
| ESLint, all authored files               | Passed; generated temporary dist-release output excluded                                                                                                                   |
| Unit/integration suite                   | 26 files, 171 tests passed                                                                                                                                                 |
| Production build, final source           | Passed; existing large lazy PPTX renderer chunk warning                                                                                                                    |
| Admin desktop/Android/iPhone suite       | 21 passed (2.4m): 18 functional cases and 3 capture cases                                                                                                                  |
| Full fixture browser suite               | All 57 non-opt-in cases verified; 3 opt-in capture tests skipped. Full run: 55 passed, then the 2 remaining assertion/synchronization fixes passed targeted rerun (23.6s). |
| Production built-mobile smoke            | 1 passed (3.3s)                                                                                                                                                            |
| Android/iPhone real-material regressions | 4 passed (40.5s): real PPTX/lecture upload, publication, download hash integrity, replacement and retained history                                                         |
| Screenshot capture/no page overflow      | 3 device projects passed; 128 after and 14 before PNGs preserved                                                                                                           |

An initial whole-directory lint attempt scanned generated `dist-release` JavaScript in the temporary review copy and reported minified-bundle rule errors. The final lint excludes temporary generated build artifacts and validates the complete authored code/configuration. Intermediate fixture assertions were updated for renamed buttons, collapsed filters and Cairo date conversion. The final two fixture failures were an obsolete list-row unpublish selector and navigation before publication finished; both passed after their assertions waited for the canonical form and completed operation. The final full-run and targeted-rerun logs are preserved in the review package; no fixture failures remain unresolved.

### Exact authored files

Implementation:

- `src/app/App.tsx`
- `src/features/instructor/Instructor.tsx`
- `src/features/instructor/AdminPages.tsx`
- `src/features/instructor/AssessmentEditor.tsx`
- `src/features/instructor/LearningContent.tsx`
- `src/features/instructor/LearningSessions.tsx`
- `src/features/learning/SessionMaterials.tsx` (unified advanced settings; material handling preserved)
- `src/features/instructor/RecordManagement.tsx`
- `src/features/instructor/Administration.tsx` (new)
- `src/features/instructor/AdminGradebook.tsx` (new)
- `src/features/instructor/overviewData.ts` (new)
- `src/features/instructor/cairoDate.ts` (new)
- `src/features/instructor/gradebookData.ts` (new)
- `src/styles/admin.css` (new)
- `src/styles/global.css`
- `src/styles/product.css`

Validation and delivery:

- `tests/browser-fixtures/management.spec.ts`
- `tests/browser-fixtures/course.spec.ts` (canonical routes, controls and Cairo dates)
- `tests/unit/admin-overview.test.ts` (new)
- `tests/unit/admin-cairo-date.test.ts` (new)
- `tests/unit/admin-gradebook.test.ts` (new)
- `tests/integration/admin-directory.test.ts` (new)
- `playwright.admin.config.ts` (new)
- `playwright.review.config.ts` (new)
- `playwright.admin-production.config.ts` (new)
- `vite.admin.config.ts` (new)
- `scripts/admin-browser-tests.mjs` (new)
- `scripts/admin-review-gallery.mjs` (new)
- `package.json` (admin test scripts only; dependencies unchanged)
- `supabase/migrations/20261113000000_admin_directory_read_models.sql` (new, unapplied)
- `docs/ADMIN_DASHBOARD_REBUILD.md` (new)

Generated screenshots, reports and build output are review artifacts. `vite.release-review.config.ts` is a temporary environment-location adapter used to build with the original public environment configuration; it is excluded from the source delivery.

### Preserved review package and copy back

The review package is preserved at `C:\Users\mmahm\.codex\visualizations\2026\11\13\01a1d5e7-71d7-7ad3-b97d-d443c11e66fe\admin-dashboard-review`. Its `source/` directory contains the exact 31 authored files listed above. `manifest.json` records SHA-256 hashes for every candidate file and corresponding original-workspace state.

`Apply-ReviewedAdmin.ps1` is a manual copy-back option; it has **not been executed**. It verifies all source and destination hashes before writing, stops on unexpected local edits, and backs up changed files inside the workspace. It copies only the listed local files; it does not apply migrations, deploy, push, delete data or touch unrelated documents/PPTX files. The original workspace requires working write permissions before automatic copy back can proceed.

### Remaining limitations

- Copying the completed candidate into the original workspace is blocked by the automatic approval-review service, despite the user's explicit authorization. The finished source and visual review remain preserved separately.
- Authenticated production smoke tests were not executed. Browser workflows instead exercise actual migrations/RPC/RLS in isolated PostgreSQL, including real PPTX upload/rendering. Production authentication, network conditions and deployed function compatibility still require a post-approval check.
- The related directory/read-model migration awaits review/application before production statistics exclude staff. No production migration, data cleanup, auth change or Storage operation was performed.
- The PPTX renderer remains a large lazy-loaded dependency; the build succeeds with its existing chunk-size warning.
