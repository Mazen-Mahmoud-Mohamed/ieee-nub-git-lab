# Initial staging deployment — 26 October 2026

This deployment is for owner acceptance testing only. No real students are invited and production readiness is not claimed.

- GitHub repository: https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-lab
- Intended Pages URL: https://mazen-mahmoud-mohamed.github.io/ieee-nub-git-lab/
- Supabase organization: `ieee-nub-git-lab` (`ajvuauaxnaedkbzmvfqd`) in the newly authenticated account.
- Dedicated project: `ieee-nub-git-lab`, reference `spldzxeqxwicnffnkizm`, Frankfurt (`eu-central-1`). It was already created in the new account; a duplicate was not created. The linked database was verified empty (zero public tables and zero Auth users) before deployment.
- The old Athar integration was removed. No Athar project or database was modified. The workspace was checked for old project-specific configuration before linking.
- Repository visibility: public, explicitly approved by the owner after GitHub rejected Pages on the private repository under the available plan.

## Deployment progress

The original migration was applied first, followed by `seed.sql`, then the three remaining migrations in chronological order. Both existing Edge Functions (`assessment-attempt`, `submit-attempt`) were deployed with their configured import map and JWT checks. The server-side `ALLOWED_ORIGIN` is `https://mazen-mahmoud-mohamed.github.io`; built-in server credentials stay inside Supabase. The reviewed exam-expiry Cron script was installed. Hosted verification results and the Pages workflow status are recorded below as they complete.

Auth Site URL and exact application callback are configured for the intended Pages base path, with local development callbacks on port 5173. Email signup and confirmation are enabled with a 12-character password minimum. Existing MFA availability, email send interval and OTP length were preserved explicitly; paid vector storage stays disabled. Google client secrets must be configured only in the Supabase provider dashboard. Future config pushes should be reviewed for provider settings before execution.

The three GitHub Actions variables are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_BASE_PATH`. The local `.env` is ignored by Git. The source audit found no private keys, access tokens, database credential URLs or sensitive database files in the upload set. No service-role or Google secret is stored in frontend configuration or GitHub variables.

## Verification status

- Local TypeScript, lint, 83 unit/integration tests and production build passed before deployment.
- Faculty UI uses only Engineering / Computer Science. Legacy faculty names occur only in migration compatibility mappings and rejection/migration tests.
- Google OAuth, actual email delivery/confirmation, instructor account authorization, full online coursework, grading/release and exam expiry acceptance are pending. Synthetic local fixtures are not evidence of real provider integration.
- GitHub Pages workflow and deployed URL verification: pending initial push.

See [Google/provider configuration and hosted acceptance](GOOGLE_AUTH_AND_PROFILES.md) and [testing requirements](TESTING.md).
