# Initial staging deployment — 26 October 2026

This deployment is for owner acceptance testing only. No real students are invited and production readiness is not claimed.

- GitHub repository: https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab
- Live Pages URL: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/
- Supabase organization: `ieee-nub-git-lab` (`ajvuauaxnaedkbzmvfqd`) in the newly authenticated account.
- Dedicated project: `ieee-nub-git-lab`, reference `spldzxeqxwicnffnkizm`, Frankfurt (`eu-central-1`). It was already created in the new account; a duplicate was not created. The linked database was verified empty (zero public tables and zero Auth users) before deployment.
- The old Athar integration was removed. No Athar project or database was modified. The workspace was checked for old project-specific configuration before linking.
- Repository visibility: public, explicitly approved by the owner after GitHub rejected Pages on the private repository under the available plan.

## Deployment progress

The original migration was applied first, followed by `seed.sql`, then the three remaining migrations in chronological order. Both existing Edge Functions (`assessment-attempt`, `submit-attempt`) were deployed with their configured import map and JWT checks. The server-side `ALLOWED_ORIGIN` is `https://mazen-mahmoud-mohamed.github.io`; built-in server credentials stay inside Supabase. The reviewed exam-expiry Cron script was installed. All four migration versions were verified in hosted history. RLS is enabled on all 24 application tables. Both functions are ACTIVE with JWT verification enabled. The expiry job is active on a one-minute schedule and actual runs in `cron.job_run_details` report success. Faculty/phone constraints and denied anonymous profile saves/student finalization grants were verified in hosted SQL.

Auth Site URL and exact application callback are configured for the intended Pages base path, with local development callbacks on port 5173. Email signup and confirmation are enabled with a 12-character password minimum. Existing MFA availability, email send interval and OTP length were preserved explicitly; paid vector storage stays disabled. Google client secrets must be configured only in the Supabase provider dashboard. Future config pushes should be reviewed for provider settings before execution.

The three GitHub Actions variables are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_BASE_PATH`. The local `.env` is ignored by Git. The source audit found no private keys, access tokens, database credential URLs or sensitive database files in the upload set. No service-role or Google secret is stored in frontend configuration or GitHub variables.

## Verification status

- Local TypeScript, lint, 83 unit/integration tests and production build passed before deployment.
- Faculty UI uses only Engineering / Computer Science. Legacy faculty names occur only in migration compatibility mappings and rejection/migration tests.
- Actual email delivery/confirmation and the owner instructor account remain pending. The owner selected `mazenmahmod397@gmail.com`; no real account has been authorized without confirmed registration. Google is now enabled and the live authorize endpoint redirects to Google with callback `https://spldzxeqxwicnffnkizm.supabase.co/auth/v1/callback`. The owner encountered Google 400 `redirect_uri_mismatch`; the exact callback/client instructions were supplied, and completed Google consent/account linking is not yet verified.
- Both GitHub workflows passed for deployed commit `dca402f384e49f8eb82f72c0db841e2b0fbaf7b6`. The Pages validation includes 83 unit/integration tests, 6 original browser tests, 16 connected-UI fixtures, lint, dependency audit, production build, artifact upload and deployment. Deno checks passed after adding automatic npm dependency installation to the verifier workflow.
- Live Pages returns HTTP 200, with assets under `/ieee-nub-git-lab/assets/`. Public Auth settings confirm email signup enabled. Google was initially disabled and was subsequently enabled by the owner.
- Hosted synthetic confirmed-account password login, profile completion/phone validation, cross-student profile isolation and unauthorized instructor/grade operations have passed. Original Assignment 01 passed actual Git/Edge submission, stored snapshot, idempotent replay, instructor API grading/release, released-result ownership, and identity snapshot preservation. The live student browser passed file editing, commits, branches/merge, theory and final submission. Both an API-started and a browser-started exam were finalized by real Cron with their pages closed; late payloads could not replace accepted answers. The browser exam passed real autosave, refresh/decreasing timer with an unchanged deadline, and the read-only expired screen. The actual instructor browser successfully inspected the persisted Git snapshot and answers, graded/released the browser submission and published a new assessment. Live testing uncovered a grading-summary UUID overwriting the attempt UUID in the review mapper; only the explicit grade fields are now copied, with a realistic-ID browser regression test. This necessary integration fix was deployed and verified online. These admin-provisioned fixtures do not verify signup SMTP or Google consent.
- The security advisor reports warnings for intentionally callable authenticated SECURITY DEFINER RPCs. These retain explicit owner/instructor checks and restricted grants; local and hosted authorization tests validate those guards. No blanket privilege change was made to silence warnings.

See [Google/provider configuration and hosted acceptance](GOOGLE_AUTH_AND_PROFILES.md) and [testing requirements](TESTING.md).

## Evidence and cleanup

- [Pages workflow](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40391966652) and [Edge verifier checks](https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab/actions/runs/40391966494) succeeded.
- The browser-started exam retained its immutable server deadline through refresh, accepted an actual Edge autosave, was abandoned before expiry, and was later found expired by a direct server read before reopening the app. Its saved answer was read only when reopened.
- Synthetic confirmed Auth users are labeled staging fixtures. Passwords and tokens were generated/kept in process memory; no test credentials were committed. Test instructor membership was revoked after each acceptance run. Test assessment definitions are archived after verification, with submissions, grades and snapshots preserved.
- The designated real instructor remains pending confirmed registration; email/password signup delivery, password recovery, full Google consent and existing-account provider linking are not claimed as verified. The staging site is not production-ready and no student invitations were sent.
