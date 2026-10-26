# IEEE NUB Git Course Assessment Platform

A focused Git assignment and examination platform. This extends the original Git Lab incrementally: the real browser Git engine, virtual filesystem, CodeMirror editor, themes, authentication, submission verifier, instructor review and Git regression tests are retained. No general LMS features are included.

Students can sign in with Google or email/password, then complete one short profile form (name, authenticated email, Egyptian mobile and faculty). Faculty choices are **Engineering** and **Computer Science**. Existing Git work, academic details, attempts and grades are preserved. Start with the [Google/Auth and profile upgrade guide](docs/GOOGLE_AUTH_AND_PROFILES.md) for provider setup, migration order, account-linking behavior and hosted acceptance checks.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Without backend configuration, the original Assignment 01 remains available as local practice. Enter your practice name and department above the workspace. Assessed accounts, multiple published assessments, instructor authoring and server-timed exams require the dedicated Supabase project configured below. No mock students, exam results or submission receipts are used in the application.

```sh
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run test:e2e:fixtures
npm run build
```

On Windows, Playwright uses installed Microsoft Edge. On Linux/macOS, first run `npx playwright install chromium`. Unit/integration tests use an isolated embedded PostgreSQL instance without Docker. The additional connected-UI browser suite starts a separate test-only Vite process and intercepts every local Auth/Data/Edge request; its synthetic keys and users never contact a real project. These fixtures verify UI behavior, while PostgreSQL tests exercise the actual migrations, authorization, expiry and grading functions. Neither substitutes for hosted staging acceptance.

## Student workflow

The dashboard has Assignments and Exams. Cards show the published title, instructions, availability/deadline, attempt policy, current status and released score. Start an assessment from its details page. Every attempt has an isolated IndexedDB key and server-pinned definition version.

Practical assessments use the existing text editor, virtual filesystem, terminal and real Git history. Theory-only assessments open directly in the question interface. Objective questions use private server-side keys; written responses default to instructor review. Partial submissions are supported unless the instructor enables the complete-work requirement. Bonus points are separate and never required for normal completion.

At the beginning of an assessed attempt, enable the clearly disclosed **server autosave** control. It names the configured project and describes the virtual repository files, answers and supporting command activity being sent. Consent is scoped to that project and attempt in the current tab/session. No background coursework upload occurs before this explicit action. Work also autosaves locally. The **Save now** control forces an accepted checkpoint; the automatic interval is 15 seconds after consent.

For exams, the server creates the start timestamp and immutable deadline when Start Exam is clicked. Refresh and other tabs resume that same attempt; browser wall-clock changes cannot extend it. Countdown display uses server timestamps and a monotonic clock. At expiry, editing locks and the server finalizes the **last accepted verified checkpoint**. Work arriving after the deadline, including work held offline, is excluded. Enable autosave promptly; without an accepted checkpoint the expired attempt contains no saved student work. See [the interruption policy](docs/ASSESSMENTS_AND_EXAMS.md).

## Instructor workflow

After privileged account authorization, open Instructor → Assignments & exams:

- Create, edit, duplicate, publish/unpublish and archive assessments.
- Choose practical-only, theory-only or mixed format; configure availability, duration, attempt limit, bonus tasks and release policy.
- Add/reorder sections, practical tasks and questions. Task validation uses safe predefined rules for repository state, files/content, branches, commit history and merged ancestry. No instructor-authored executable code is accepted.
- Add starter text files; optionally initialize/commit them, or import a bounded starter repository backup.
- Author multiple-choice, multiple-select, true/false, short/long written, scenario and terminal-interpretation questions. Save/reuse them through the private question bank. Correct keys and explanations are removed from student-visible published versions.
- Review attempts filtered by assessment and student identity. Inspect real task outcomes, commit/file snapshots, graph, answers and supporting activity; grade manual questions, give feedback, release results, approve retakes and export CSV.

Publishing creates an immutable version. Editing a draft or publishing the next version never changes already-started attempts. Deleting a question from a draft/bank does not alter historical versions or submissions. Bank deletions and assessment archive actions are recoverable.

## Dedicated Supabase setup / safe upgrade

Do not apply this app to an unrelated database. No production infrastructure was changed during this refinement.

1. Verify and back up the dedicated development/staging project. Follow the [ordered upgrade guide](docs/GOOGLE_AUTH_AND_PROFILES.md#upgrade-the-dedicated-project): new installs apply baseline → seed → assessment migration → faculty migration → Google/profile migration. Existing installs apply only migrations not already recorded as applied. Never rerun the baseline/seed or erase student tables.
2. Enable email/password Auth with confirmation, a suitable password policy, SMTP, auth rate limits and exact redirect URLs. Complete each student's name, phone and faculty using the shared profile form. A self-reported Student ID is not proof of identity.
3. Copy `.env.example` to `.env`; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the appropriate `VITE_BASE_PATH`. Use only the public publishable key in the frontend. Never set a service-role or secret key in a `VITE_` variable.
4. Deploy the existing `submit-attempt` function and the new `assessment-attempt` function from this complete checkout with their configured import map. The old endpoint is preserved for compatibility; new assessments use the new endpoint. Keep gateway JWT verification enabled. Both independently verify the confirmed account. Set the Edge secret `ALLOWED_ORIGIN` to the exact frontend origin. Supabase supplies its server URL and service-role key inside the function runtime only.
5. In the verified project's privileged SQL editor, add the confirmed instructor's actual `auth.users.id` to `private.instructors`. Do not use editable metadata or a Student ID for roles.
6. Install the recurring expiry job using `supabase/exam-expiry-schedule.sql` in that dedicated project. It uses Supabase Cron to call the service-only expiry function every minute, with no HTTP secret or separate backend. Check `cron.job` and `cron.job_run_details`. Every save also independently enforces the exact deadline, even if the scheduler is delayed. The scheduler is required to finalize abandoned exams without a returning browser.
7. Run the hosted acceptance checklist in [TESTING.md](docs/TESTING.md). Local tests do not verify SMTP delivery, hosted gateway behavior, live cron installation or real PostgREST responses.

Separate development and production project configuration is recommended. `ALLOWED_ORIGIN` accepts one exact origin per environment. Use `http://127.0.0.1:5173` for local development and your actual HTTPS Pages origin for production, without a path or trailing slash.

## GitHub Pages

The existing workflow is retained and extended to run lint, regression/security tests and both browser suites before building. Hash routing supports static deep links. Set repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `VITE_BASE_PATH` defaults to `/REPOSITORY-NAME/` in the workflow. Adjust it to `/` for an organization root site/custom domain. Select GitHub Actions as the Pages source. The Edge workflow type-checks both endpoints with Deno.

Check the intended repository and project before pushing or deploying. No remote repository, Pages deployment or Supabase migration/function/job was created or applied in this refinement. Roll back frontend code through a prior validated commit; use reviewed forward database migrations instead of disabling RLS or deleting evidence tables.

## Preserved behavior and limits

- React/TypeScript/Vite/Tailwind, CodeMirror, isomorphic-git and the virtual Git index/object/ref model are retained. Staged files remain separate from later working edits.
- The original Assignment 01 and its 100 + 10 point learning contract remain available. Its compatibility validator is a named safe rule; new assessments use configurable rules and require no source-code edit.
- Branch switching conservatively requires clean tracked files; merging requires a clean working tree. Conflicts abort safely. Remotes and OS shell access remain unsupported.
- Coursework uses `.txt` files only. Existing snapshot bounds remain: 2 MB stored bytes, 256 KB/file/object, 3,000 entries, 150 commits, 700 loose objects, 1,000 activity events and a 9 MB request body. Definitions are bounded to 1 MB; imported starter backup input to 900 KB. No packed objects, symlinks or executable trees are accepted.
- A stale tab cannot overwrite a newer server revision. It pauses editing and asks the student to reload the accepted checkpoint. Final attempts are immutable; retakes use new workspaces.
- Local practice and old per-user data remain present. A matching legacy active attempt is copied to its new isolated key on first resume; the old key is not deleted.
- Paste restrictions are lightweight and bypassable. Existing class-wide accessibility exceptions remain available. No webcam, screen recording, keystroke surveillance or lockdown software is used.
- The activity viewer is supporting evidence, not proof of human authorship or a deterministic replay. Browser storage can be cleared; export important local work. No service-worker installation or cold-start fully offline loading is promised.

See [current architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), [exam policy](docs/ASSESSMENTS_AND_EXAMS.md), [testing](docs/TESTING.md), and the [refinement report](docs/REFINEMENT_REPORT.md).
