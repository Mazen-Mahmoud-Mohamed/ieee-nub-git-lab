# Google authentication and student profiles

This update uses the existing Supabase Auth project and tables. The authoritative account ID is `auth.users.id`; email comes from Auth, not editable profile metadata. Faculty is exactly Engineering (`engineering`) or Computer Science (`computer_science`).

## Upgrade the dedicated project

Back up and test in the dedicated staging project first. Apply only migrations not already recorded as applied, in filename order:

1. `20261026130655_initial_git_lab.sql` (new installs only), followed by `supabase/seed.sql`.
2. `20261026160527_reusable_assessments_and_exams.sql`.
3. `20261026171250_normalize_profile_faculty.sql`.
4. `20261026173800_google_auth_student_profiles.sql`.

Do not rerun the baseline or seed against an existing installation. The faculty migration safely converts legacy faculty values. The new migration adds phone, makes old Student ID/year optional for new registrations, preserves existing academic data, and adds guarded profile save and instructor submission RPCs. No students, submissions, grades, checkpoints or attempts are deleted. Existing missing phone values remain available for completion; new writes require a valid Egyptian mobile number. Mobile numbers are normalized to `+201xxxxxxxxx` (010/011/012/015 networks); SMS verification is not implemented.

The start RPC checks completion before creating an attempt or timer. Manual submission is also guarded server-side. Existing incomplete legacy attempts can still autosave and expire normally; completing a profile does not modify their start time, deadline or workspace. Existing confirmed-email, role checks, RLS, server verification, grade release and timing checks remain in effect. Keep both existing Edge functions and the expiry schedule configured as described in README.

A submission's minimal identity snapshot captures name, authenticated email, phone, faculty and existing Student ID at finalization. It does not contain OAuth tokens. Older submissions without a snapshot use the current associated account/profile, visibly labeled in instructor review; the migration does not invent historical contact details. Instructor email lookup is through `instructor_submissions()`, which checks the existing private instructor membership before joining Auth data. Browser users cannot directly read Auth tables or write attempt identity snapshots.

## Configure Google Cloud and Supabase Auth

Use the actual dedicated project values from the dashboards. Placeholders below are examples, not credentials or discovered settings.

1. In Google Cloud, select the intended project. Configure the Google Auth consent screen, app name, support email, authorized domains, audience and publishing status. If the app is in Testing, add the intended test users. Use the basic identity scopes `openid`, `email` and `profile`.
2. Create a **Web application** OAuth client. Add the frontend origin to Authorized JavaScript origins: `https://YOUR-ACCOUNT.github.io` (without the repository path), or the actual custom-domain origin. Add development origins only when needed, such as `http://127.0.0.1:5173`.
3. In the dedicated Supabase Dashboard → Authentication → Sign In / Providers → Google, copy the callback URL shown there. Add that exact URL to Google's Authorized redirect URIs. It normally has the form `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`. Use the displayed value if a custom Auth domain is configured. **This Google callback is the Supabase Auth endpoint.**
4. Put Google's client ID and client secret in the Supabase Google provider settings and enable the provider. Never put the Google secret or Supabase service-role key in source code, GitHub Pages variables, or any `VITE_` variable.
5. In Supabase Authentication → URL Configuration, set Site URL to the actual deployed frontend base URL, for example `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/`. Add the exact allowed application return URL `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/?auth_return=1`. For local development add `http://127.0.0.1:5173/?auth_return=1` (adjust port/base when needed). Avoid wildcard production redirects. Email confirmation also uses this application return URL.
6. Keep email/password enabled with email confirmation, SMTP and password policy. The Google provider must supply email; confirm actual provider accounts report an authenticated, confirmed email. The UI displays the Auth confirmation state and cannot change email through a profile save. Any future email-change feature must use Supabase Auth's verification APIs.
7. Set frontend `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to this same project. Keep the existing Pages workflow and `VITE_BASE_PATH` matching the real repository path. Root/custom-domain sites use `/`. Rebuild when frontend configuration changes.

The frontend uses Supabase PKCE and exchanges the one-time `code` once on the application's base URL. The code is in the URL query, outside HashRouter's route, so Pages needs no physical `/callback` page or rewrite. Callback parameters are removed after processing. The SDK manages the verifier and session; no Google provider token is persisted by application code. Complete email confirmation in the same browser/device that initiated signup because PKCE needs its verifier. An incomplete, cancelled, expired or different-browser return shows a recovery message and allows sign-in again.

Intended local routes are allowlisted and kept in session storage in the same tab. Login resumes an existing attempt URL without starting another attempt. This storage contains a route, not credentials. First-time or incomplete users go through one shared profile form; existing names and contact values are prefilled. Complete returning students bypass completion. Authorized instructors can still open the instructor console without creating a student profile; taking or submitting coursework still requires the same complete student profile. Profile edits preserve ownership and previous submission snapshots.

## Existing accounts and identity linking

The app does not search accounts by email, merge users, or assign ownership using an email string. It upserts one profile keyed to the authenticated Supabase user ID. Supabase supports automatic linking under its documented verified-identity rules; whether a particular Google identity joins an existing account is decided by Supabase Auth. Review the project's linking settings and test an existing confirmed email/password account before release. If the provider creates a different user ID, stop and investigate through supported Supabase account administration/linking flows; do not move submissions by comparing email addresses. A manual identity-linking UI is not added by this update. Never infer instructor access from Google/user metadata.

See official [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), and [supported identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Hosted acceptance checks still required

Local tests use intercepted synthetic OAuth/Auth/Data responses; they do not contact Google or a hosted Supabase project. No real provider credentials, project configuration or deployment was available in this workspace.

After staging configuration, verify first Google login, complete returning Google login, email signup/confirmation/login, cancelled consent, expired callback, existing-account linking behavior and logout/login recovery. Verify the exact Pages callback after deployment, with no root-path redirect or 404. Confirm name prefill, read-only Auth email and confirmation state, phone normalization, the two faculty choices and profile editing. Start and submit an assignment and timed exam; refresh and reauthenticate into the same exam and confirm its deadline is unchanged. Check hosted RLS with two students, authorized instructor contact review/CSV/grading, snapshot immutability after profile edits, and expiry cron. Do not claim Google sign-in is operational until these hosted checks pass.

## 27 October hosted follow-up

The dedicated project is now configured and deployed. Hosted Auth confirms that the designated owner has signed in with Google and has a confirmed email; that verified account is explicitly authorized as an instructor. Hosted student/instructor authorization, profile/contact joins, actual Git submission, grading/release, CSV, exam autosave and deadline-refresh checks passed. See [the instructor dashboard report](INSTRUCTOR_DASHBOARD_REPORT.md) for current deployment evidence. The older local-only note above describes the implementation before initial staging configuration; real signup email delivery and all account-linking edge cases remain separate checks.
