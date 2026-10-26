# IEEE NUB Git Lab

A static React application for IEEE Nahda University Student Branch’s first Git assignment. Students edit real virtual text files, execute local Git operations, inspect actual Git objects and branches, answer twelve written questions, and submit to a trusted Supabase verifier. No application server, Docker, GitHub account, remote Git, or operating system shell is needed by students.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Without backend configuration, **local practice** works: enter your practice name and department above the workspace. Accounts, cloud checkpoints, final submission and instructor data require a dedicated configured Supabase project. The UI never fabricates a successful submission.

```sh
npm test
npm run lint
npm run build
npm run test:e2e
```

On Windows, browser tests use installed Microsoft Edge. On Linux/macOS, first run `npx playwright install chromium`. The tests use synthetic student information and a disposable embedded PostgreSQL database; they never contact an existing Supabase database. No Docker is needed for tests. Vitest may need to run outside a restrictive Windows temporary-file sandbox.

## Configure a dedicated Supabase project

1. Create a new project specifically for this app. Do not use an unrelated database. Check project costs and institution policy before creating it.
2. In its SQL editor, apply `supabase/migrations/20261026130655_initial_git_lab.sql`, then `supabase/seed.sql`. Alternatively, use the official Supabase CLI’s documented migration push workflow after verifying the linked project reference. No remote migration was applied during this build.
3. Enable email/password authentication and **require email confirmation**. Configure the frontend origin as Site URL and its exact permitted authentication redirect URL. Enable password strength and breached-password controls available to your plan; use a minimum of 12 characters. Configure SMTP and suitable Auth rate limits for the class. The app uses the verified email account as identity; Student ID is self-reported, not proof of enrollment.
4. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` to the dedicated project API URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its **public publishable key**. Never put a secret or service-role key in any `VITE_` variable.
5. Deploy `supabase/functions/submit-attempt` with the Supabase CLI from this checkout. Inspect `supabase functions deploy --help` for the installed version. The function imports the shared engine/verifier from `src/`; keep the full checkout available to the bundler. Its import map pins server dependencies. Leave gateway JWT verification enabled. The function also calls `auth.getUser` to independently verify the access token and confirmed account.
6. Set the Edge Function secret `ALLOWED_ORIGIN` to the exact frontend **origin**, without a path or trailing slash. Local development uses `http://127.0.0.1:5173`; GitHub Pages uses `https://YOUR-ACCOUNT.github.io`. Use separate development and production Supabase projects, because one exact origin is permitted at a time. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. These never enter the frontend build.
7. Create and confirm the initial instructor account normally. From the project’s privileged SQL editor, add its verified `auth.users.id` to `private.instructors`. Never grant instructor privileges from `user_metadata`, a Student ID, or the browser. See `docs/SECURITY.md`.
8. Run the staging acceptance checklist in `docs/TESTING.md` before distributing the course URL. Verify email confirmation, gateway JWT configuration, Edge bundling, Data API grants, institution enrollment policy, and the whole student/instructor workflow against that **dedicated** staging project.

Backend tables are RLS protected. Students cannot write attempts, verified scores, final snapshots, grade records, enrollment policies, or roles directly. Guarded RPCs enforce ownership, windows, retakes, and instructor authorization. An atomic service-only RPC finalizes all verified evidence and returns a receipt. A repeated idempotency key returns the same receipt; a different key cannot overwrite a final attempt.

## GitHub Pages

The frontend uses hash routing, so routes work on static Pages without a fallback server. Vite uses `VITE_BASE_PATH` at build time. Use `/REPOSITORY-NAME/` for a repository site and `/` for a user/organization root site or custom domain. The workflow defaults to a repository site; adjust it if needed.

1. Create a **new, empty** GitHub repository. Check its owner and existing state before pushing. No remote URL is embedded in this project.
2. Push this source to `main`, and choose **GitHub Actions** as the Pages source in repository settings.
3. Add repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the dedicated production project. These are public configuration. Use the `github-pages` environment’s deployment protection if instructor approval is desired.
4. The Pages workflow runs unit/integration/security tests, dependency audit, browser tests, and a production build before deploying. Missing production backend variables fail deployment. Pull requests run checks without publishing.
5. After deployment, set the exact frontend auth redirect URL and Edge origin, then verify login, practical work, final receipt, instructor review, and released results using staging accounts before enrolling students.

No GitHub repository or hosted deployment was created during this implementation. Source, migrations, workflow and setup instructions are ready locally. GitHub Pages cannot configure custom security response headers: see security documentation for hosting limitations.

## Student workflow

- Open My learning and start Assignment 01. Confirm your profile first for an assessed attempt.
- Use `help` in the terminal for the exact supported grammar. Run one command per line. All Git commands operate on `/IEEE-Git-Task`, never the host filesystem.
- Select files in Explorer to edit. Files autosave to IndexedDB. Staged snapshots do not change when working files are edited afterward.
- Progress checks commit trees and branch history. Early setup/observation actions and human explanations also appear in the activity timeline; activity is supporting evidence, not tamper-proof proof that a student personally typed a command.
- Complete all eight practical outcomes to unlock theory; bonus work is optional. Answer twelve theory questions and two practical reflections. The bonus reflection is optional.
- Review, export a local backup, and submit. A server receipt, not a local score or animation, confirms submission. Transient failures retain the exact submission payload and idempotency key for retry.
- An instructor grades written responses and publishes results. Final attempts are read only. Approved retakes begin a separate, empty workspace and preserve prior server submissions.

Local autosave uses the current browser/device. **Cloud draft checkpoints are explicit**: open Review → Backup & recovery → Save cloud checkpoint. The UI explains that repository files, answers, configuration and supporting activity are sent to the configured dedicated Supabase project. Restore is also explicit and replaces current local work. Export before restoring. Browser storage can be cleared by the user/browser and is not a substitute for a backup. Cloud draft sync is deliberately manual; final submission still uses its own verified pipeline.

## Implementation details and limits

- React 19 / TypeScript / Vite / Tailwind; CodeMirror editor; accessible DOM terminal with history and tab completion; custom SVG commit parent graph; IndexedDB; isomorphic-git; Supabase Auth/PostgreSQL/RLS/Edge Functions; Vitest; Playwright.
- The presentation supplied in this workspace was inspected through slide 28: slide 27 ends merge direction, and slide 28 starts conflicts. Assignment 01 is limited to local Git through merging, using `.txt` files.
- Virtual `--global` configuration applies inside the sandbox and is mirrored into repository config for a portable, self-contained evidence snapshot. It never changes your computer’s global Git configuration.
- Clean tracked files are required for branch switches; all working files must be clean for merging. This is a documented conservative teaching boundary. Conflicts abort safely and are outside Assignment 01.
- Snapshot limits: version 1, 2 MB uncompressed stored bytes, 256 KB/file/object, 3,000 filesystem entries, 150 reachable commits, 700 loose objects on submission, 1,000 recent activity events, 9 MB request body, 8 submission requests/minute/user. No packed objects, symlinks, executable trees, alternates, shallow repositories or remotes are accepted.
- The assignment definition supports question kinds and future assignment sections. The twelve required written questions stay intact; the instructor UI edits private rubrics, dates, visibility, retakes and review settings. Adding a new assignment requires a matching versioned trusted validator and a new seed/migration; arbitrary future assignments are not automatically gradeable.
- Assignment 01 theory is intentionally instructor graded. Optional objective scoring and authoring an entire new assignment through the UI are future work. Paste accommodations currently apply to the class, rather than individual students.
- Exact deterministic replay is not claimed. The instructor sees an activity timeline and actual commit/file snapshots. Editing a final local receipt cannot alter database authorization or verified results.
- No full offline install/service-worker cache is included. An already open lab can continue working through a brief connection interruption; reopening the site from a cold cache while fully offline requires connectivity. Local data persists across ordinary refreshes.

Read [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), [testing and staging acceptance](docs/TESTING.md), and the [implementation report](docs/IMPLEMENTATION_REPORT.md).
