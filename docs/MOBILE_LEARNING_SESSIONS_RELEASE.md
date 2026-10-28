# Mobile learning sessions and consolidated pending release — 28 October 2026

Status: implemented locally on top of the pending Admin Data & Content Management implementation. **Nothing in this combined release has been deployed. No production database, Storage object, account, attempt, submission or official grade was modified.**

## Existing work preserved

The starting working tree was inspected before editing. `ADMIN_CONTENT_MANAGEMENT.md` and `PRODUCT_SIMPLIFICATION_AUDIT.md` were read along with the current lifecycle, persistence, RLS, grading, course editor, recovery flows and workflows. The complete pending management system remains: courses/sections/lessons, shared archive/Trash/restore/purge policy, bounded batches, explicit data-administrator permission, protected invalidation, course filters and retained audit. Its migration `20261028010000_admin_content_management.sql` is retained unchanged. This report's release sequence covers that migration and the new session migration together; older audit reports describe their historical scopes.

Sessions extend existing **lesson** documents under section → course. There is no second course/session hierarchy, enrollment model or student-progress table. Existing six lessons remain readable without conversion. Session titles, numbers, descriptions, ordering, topics, videos, presentations, resources and related assessments are instructor data, not hardcoded example sessions. The hierarchy remains fixed after creation, as documented by the prior management policy.

## Mobile workflow

| Area                 | Implemented behavior                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace            | Task / Terminal / Files segmented navigation; keyboard arrow/Home/End navigation; mounted panels preserve UI state; selected task/view/file restored per workspace. Desktop retains side-by-side task and work area.                                                                                                                                 |
| Task                 | Existing version-aware short numbered instructions, exact file text/messages and pre-commit warnings retained. Hint and optional original instructions/technical evidence. One shared progress summary shows task position, completed/remaining tasks, provisional points, optional bonus and submission/read-only status. No duplicate score panel. |
| Terminal             | Explicit Run, 16px input, mobile keyboard flags, touch history controls and symbol/text insertion helpers. Helpers never execute commands. Output scrolls separately from the command form, wraps long commands/errors and permits selection/copy. Input focus returns after execution. Existing Git warning and error logic remains.                |
| Files                | Native mobile textarea, optional explicit Save file, actual local-persistence status, independent per-file recovery drafts and selected-file restoration. Existing serial Git/write queue and IndexedDB persistence are reused. Save failure retains the draft and does not claim online persistence. Desktop CodeMirror loads only when needed.     |
| Recovery             | Existing restart confirmation, policies, old-attempt retention and help requests remain. Controls/dialogs are touch sized and scrollable. Invalidated work remains read only.                                                                                                                                                                        |
| Navigation           | Course Content remains reachable from active assessment pages. Main and instructor navigation wrap on narrow screens. Questions, review, recovery and profile layouts share touch sizing, wrapping and readable controls.                                                                                                                            |
| Questions/submission | Existing question navigation, required-answer notices, own-work confirmation, busy state, idempotent submission reference and receipt-only success remain. No exam gate or required answer is bypassed.                                                                                                                                              |
| Performance          | Instructor tools and desktop editor are lazy loaded. Shared React/JSX chunk boundaries prevent the editor dependency from being preloaded by the entry page. Videos load only after a student chooses Load recorded lecture. No new frontend library dependency.                                                                                     |
| Interruptions        | Local assessed work remains scoped to its attempt; autosave still requires existing consent. Device recovery text is distinguished from accepted online work. Instructor session forms have device recovery and an explicit confirmed Reload saved version action; stale revisions remain server-rejected.                                           |

Phone widths 320, 360, 375, 390, 414 and 430, plus 768px tablet and 844×390 landscape are exercised on Chromium and WebKit. Direction-aware prose and isolated LTR filenames/commands are retained. Native Safari select appearance and light/dark contrast are explicitly tested, and safe learning-page return paths survive sign-in. Shared navigation, practical controls and core form actions target at least 44 CSS pixels. This is not a full WCAG certification.

## Sessions and materials

Students use Course Content (`/learn`) → course → section → session (`/learn/:contentId`). Session details show the description, optional topics, responsive lecture, presentation access, supplementary links and related practice. Parent links return to the course hierarchy. The old six lessons remain usable, and local practice without a backend retains its static guide.

Instructors use Courses & lessons or Learning Sessions in the existing dashboard. Create course/section once, then New lesson → title/number/order → upload PPTX → paste Drive link → Publish content version. Private Save content draft, draft preview, published student-view link, unpublish, archive/restore/eligible Trash remain available. Session ordering is read from retained published documents, so private order changes do not leak before publication. Uploading first saves the form as a private draft; the completed validated upload must then be saved/published to attach it. Progress distinguishes bytes transferred from server validation. Replacing/removing a presentation requires an exact-scope confirmation.

Drive links support `https://drive.google.com/file/d/ID/view` (including common sharing parameters), file preview/edit forms, `/open?id=ID` and `/uc?...&id=ID`. Valid `resourcekey` sharing parameters are preserved in both preview and fallback links. Host/protocol/ID checks reject lookalike hosts, embedded credentials and unsupported folder links. Save canonicalizes the link, and the server validates its canonical form. The 16:9 player is opt-in and always has Open in Google Drive and an access explanation. Restricted/unavailable playback never becomes a claimed success. No Google API key or permission bypass is used.

The related assessment selector uses existing assignments/exams. A read-only server availability hint checks publication, visibility, identity/profile, current attempt, timing, limits and retake credit before showing Practice What You Learned. It creates no attempt/enrollment/credit. The button opens the existing assessment start/continue screen, where consent and authoritative policy checks run again. Published session access never unlocks an assessment or changes pinned criteria.

## Presentation architecture and security

- New private `learning-presentations` Storage bucket, maximum **25 MiB**, PPTX MIME type only. Original files use unique `lessonUUID/materialUUID.pptx` paths with no upsert.
- Browser and trusted `learning-material` Edge Function share structural OOXML validation: extension, declared MIME (including neutral OS types), size, ZIP directory/offset integrity, package entries, entry-count/expanded-size bounds, unsafe paths, duplicates, encryption and macro-package rejection. This is a structural file validator, not malware scanning or a full Office rendering validator.
- The endpoint bounds request bytes, checks the configured Origin and verified Auth user, checks current instructor permission and uploads via server-only credentials. Registration rechecks instructor membership and active lesson under the existing management lock, stores file metadata and an audit event. The browser cannot register uploaded files by calling the service-only RPC.
- Original uploaded bytes are copied into the multipart request; input clearing is deferred until completion. The tests include WebKit file transfer through an actual localhost HTTP receiver rather than relying on intercepted multipart request bodies.
- Storage has a published-material read policy plus **restrictive** read/insert/update/delete guards. Broad pre-existing permissive policies cannot expose this bucket's draft files or permit client upload/overwrite/deletion. Other buckets retain their existing policy behavior. Tests deliberately add a permissive synthetic legacy policy and verify the restrictive guards still apply.
- A published file is readable only while its current lesson version and complete course/section ancestor chain are published and active. Instructor draft access uses instructor-only metadata RLS; the normal published student view returns the same published file even for an instructor. Signed links last **120 seconds**, with explicit original Open and Download links and refresh. [Supabase private-bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [signed-link lifetime behavior](https://supabase.com/docs/guides/storage/serving/downloads) informed this design. Already issued signed URLs can remain usable until expiry after unpublishing.
- Replacement does not overwrite/delete the old object or immutable published document. Lessons with uploaded presentations have a disclosed restrictive management dependency: archive instead of hard deletion. Files from historical versions remain retained. There is no arbitrary client object deletion or automatic bulk garbage collector.
- Failed registration attempts best-effort removal of only the new object created by that request. If Storage cleanup itself fails, an unreferenced object may require privileged review; no existing presentation is removed. Ambiguous connection failures can leave an unattached new upload; they never overwrite the current presentation.
- Instructor scope remains institution-wide, as in the existing application. Published learning material remains public under the existing course model; private-bucket signing is not enrollment protection. A future enrollment-only content policy must change both catalog and material policies together. Drafts stay instructor-only; student-record administration still requires the separate explicit data-administrator grant.

## Migration dependencies and preservation

Exactly two local migrations are pending relative to the last recorded production release:

1. `20261028010000_admin_content_management.sql` — existing pending management system, roles, audit, versioned learning catalog and protected invalidation.
2. `20261028020000_learning_sessions.sql` — depends on the first; extends its lesson-document save/catalog functions, adds retained presentation metadata and service registration, unpublishing, published visibility/material/related-activity reads, the private bucket and Storage guards. No new parallel lesson/course tables.

Neither migration resets or recreates the database, truncates student records, regrades work or rewrites published assessment documents. The second creates no new Auth memberships and updates no pre-existing content/student row. Actual PostgreSQL tests apply both migrations to a populated legacy database and compare every pre-existing public/private/Auth row before and afterward. Existing immutable versions, official scores, history links, attempt limits, deadlines, exam finalization and help policies remain authoritative. New session metadata is sanitized into a retained lesson version only when an instructor saves/publishes it.

## Verification

The final sequential verification completed successfully on 28 October 2026. All application writes are local synthetic tests. Unit/integration tests execute actual migrations and PostgreSQL RPCs. Connected browser tests simulate Auth and the Storage signing service but execute actual management/assessment transactions and the shared grader. Uploads use an actual localhost HTTP multipart receiver with the real Edge handler, validator and metadata registration. They do not contact production Supabase. The compiled-app smoke test blocks all external network traffic.

- Unit/database tests: **154 passed across 18 files** in the latest full run.
- Existing local browser journeys: **11 passed**.
- Connected browser fixtures: **37 passed**, including the real local upload/download receiver and retained-data management regressions.
- Android/iPhone suites: **8 passed** — four real-repository mobile cases plus four connected session-management/submission cases across Android Chromium and iPhone WebKit.
- Compiled-app smoke: **1 passed**, also rerun successfully under the exact `/ieee-nub-git-lab/` production base path. The full run therefore has **57 passing browser test executions**; the extra base-path smoke repeats one of those cases.
- `npm run typecheck`, `npm run lint`, `npm audit --audit-level=moderate`, `npm run build` and `git diff --check`: **passed**. Audit reports zero known vulnerabilities. Deno type checks passed for all three Edge Functions, including the unchanged grading functions.
- Final repository-path local artifact: `dist/assets/index-7FJjJG7D.js` (170.72 kB; gzip 55.25 kB for this app chunk). The desktop editor chunk (gzip 125.88 kB) and instructor chunk are deferred; the built-app test checks the actual requests. This identifies a local artifact, not a published production version.
- New coverage includes invalid/failed upload, server authorization, binary format and byte limits, unique paths, replacement confirmation/cancellation, published-file preservation, stale edits, unpublishing, broad-policy resistance, draft privacy, parent visibility, related assessment limits/timing, editor recovery, mobile Git/history/grading, questions, exact score/receipt persistence, every required viewport and deferred production chunks.

### Required physical-device and staging checks

Automated WebKit/Android emulation is not a physical phone. Before release acceptance, use actual Safari on iPhone and Chrome on Android to check native keyboard opening/rotation, text selection/paste, command-input visibility, long-file editing, Files/Downloads app handling, upload interruption/backgrounding and a slow network. Test VoiceOver/TalkBack and any required institutional accessibility accommodations. Use an actual instructor-shared Drive video with student permissions; verify playback, account switching, restricted access and fallback. The local restricted-player fixture verifies layout and fallback, not Google's permission configuration or actual playback. No actual instructor lecture/PPTX was supplied; examples are synthetic test records, not published real course content.

## Consolidated deployment plan — both pending features

**Do not push to main or run these production commands during this task.** Main pushes invoke the existing Pages deployment automatically. Source validation and migration sequencing must be completed before that trigger.

1. Review the combined diff and this report plus the prior admin policy report. Verify the authenticated Supabase account and linked project is dedicated IEEE `spldzxeqxwicnffnkizm`, never Athar. Verify GitHub deployment permission, current main state, production schema/function/Storage-policy drift and the production public URL/key/base path in existing Actions variables. Record a backup and private fingerprints of existing Auth/student/assessment/attempt/submission/grade/audit records; do not log credentials or sensitive row contents.
2. Rehearse on a separate staging copy with real Supabase Storage/Auth/Edge runtime. Inspect `supabase migration list --linked` and `supabase db push --linked --dry-run`. Expect the eight already-applied historical migrations followed by the two files above, in that order. Verify the new bucket name is unused and Supabase's Storage schema and grants match the tested contract. Unexpected drift, permissions or bucket collisions stop the release. Do not reset, seed or recreate production.
3. Only after staging and preservation checks pass, apply both reviewed migrations through the existing procedure: `supabase db push --linked --project-ref spldzxeqxwicnffnkizm --skip-vault --yes`. The management migration widens an attempt constraint and briefly locks that table; schedule appropriately. Recheck migration history, table/RLS/RPC grants and unchanged original-row fingerprints immediately afterward. Bucket creation is in the second migration; do not make it public.
4. Preserve current instructor memberships. Provision the additional data-administrator role only for an explicitly chosen verified instructor, using the guarded statement in `ADMIN_CONTENT_MANAGEMENT.md`; no automatic promotion. Test both ordinary instructor and explicitly privileged roles with isolated accounts.
5. Deploy **only the new upload function** after its migration dependencies exist: `supabase functions deploy learning-material --project-ref spldzxeqxwicnffnkizm`. Its configuration retains `verify_jwt = true` and the existing pinned import map. Verify standard server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and existing project `ALLOWED_ORIGIN=https://mazen-mahmoud-mohamed.github.io` are available. Verify allowed/disallowed preflights and unauthorized requests. Never put service keys into browser variables or source. Existing `submit-attempt` and `assessment-attempt` source/shared grading dependencies are unchanged and require no redeployment.
6. Run the complete checks: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm audit --audit-level=moderate`, `npm run build`, both existing browser suites, `npm run test:e2e:mobile`, `npm run test:e2e:production`, and the Deno checks in `.github/workflows/edge.yml`. CI now installs Chromium and WebKit, includes the mobile tests and smoke-tests the built artifact after compilation. Deno checks are validation only, not deployment jobs.
7. After database and upload-function acceptance, release the reviewed frontend through `.github/workflows/pages.yml` with the existing repository base path and Supabase public configuration. Do not bypass checks. Verify the exact successful Actions run, source commit and compiled artifact on `https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/` before claiming deployment.
8. Use authorized isolated production test accounts/content only: instructor creates private session, rejects invalid file/URL, uploads/replaces slides, previews/publishes/unpublishes; student sees only published material, downloads original bytes, handles restricted Drive video and starts permitted related work; real Git editing/history, grade/score, task navigation, questions, autosave consent, refresh, restart/help and final submission return correct persisted results. Check active-exam/deadline/attempt-limit and role restrictions. Reverify the complete admin archive/Trash/restore/audit acceptance and existing-record fingerprints. Never invalidate/delete real student work as a smoke test.
9. Roll back presentation by redeploying a verified compatible frontend; retain both additive schemas, immutable versions, Storage objects, audit and invalidated attempts. Do not drop the invalidated status or reset the database. If the new upload endpoint fails, disable new upload UI/revert that frontend capability while retaining uploaded data. Do not replace official grade/history records to roll back a UI change.

There is no production acceptance claim for this local implementation. Production migration safety, actual Storage behavior, real Drive sharing, deployed function configuration and physical-device checks remain release gates.

## Combined changed-file inventory

This includes preserved pending admin work and the current mobile/session extension. Generated builds, caches, credentials and local test artifacts are excluded.

```text
.github/workflows/edge.yml
.github/workflows/pages.yml
docs/ADMIN_CONTENT_MANAGEMENT.md
docs/MOBILE_LEARNING_SESSIONS_RELEASE.md
package.json
playwright.config.ts
playwright.mobile-connected.config.ts
playwright.mobile.config.ts
playwright.production.config.ts
src/app/App.tsx
src/features/assessments/AssessmentResult.tsx
src/features/assessments/LearningGuide.tsx
src/features/assessments/PublishedCourses.tsx
src/features/assessments/SessionBar.tsx
src/features/assessments/model.ts
src/features/assignments/DesktopTextEditor.tsx
src/features/assignments/TaskInstructions.tsx
src/features/assignments/Workspace.tsx
src/features/assignments/WorkspaceProgress.tsx
src/features/auth/navigation.ts
src/features/instructor/AdminPages.tsx
src/features/instructor/AssessmentEditor.tsx
src/features/instructor/HelpRequests.tsx
src/features/instructor/Instructor.tsx
src/features/instructor/LearningContent.tsx
src/features/instructor/RecordManagement.tsx
src/features/instructor/SubmissionDetail.tsx
src/features/learning/SessionMaterials.tsx
src/features/learning/SessionResources.tsx
src/features/learning/materialService.ts
src/features/learning/materials.ts
src/features/submissions/Review.tsx
src/features/terminal/Terminal.tsx
src/hooks/useAssessmentSession.ts
src/styles/product.css
supabase/config.toml
supabase/functions/learning-material/handler.ts
supabase/functions/learning-material/index.ts
supabase/migrations/20261028010000_admin_content_management.sql
supabase/migrations/20261028020000_learning_sessions.sql
tests/browser-fixtures/course.spec.ts
tests/browser-fixtures/management.spec.ts
tests/e2e/local.spec.ts
tests/helpers/managementDatabase.ts
tests/helpers/presentation.ts
tests/integration/assessments-db.test.ts
tests/integration/learning-sessions.test.ts
tests/integration/management.test.ts
tests/integration/materials.test.ts
tests/integration/profile.test.ts
tests/mobile/local.mobile.spec.ts
tests/production/build.spec.ts
tsconfig.json
vite.config.ts
```
