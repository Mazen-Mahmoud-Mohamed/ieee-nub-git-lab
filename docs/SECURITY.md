# Security and privacy

## Authorization model

Student roles are derived from authenticated account ownership. Instructor membership comes only from `private.instructors`. `user_metadata` is never used for roles. Every privileged RPC checks `auth.uid()` and `is_instructor()`. Security-definer functions deliberately perform narrow operations with an empty search path, explicit authorization, and revoked default PUBLIC/anon execution. The few service-only RPCs are granted only to `service_role`. No client can update final attempt state or grade tables.

In a dedicated project SQL editor, the administrator may provision the instructor after verifying the account:

```sql
-- Replace with the confirmed instructor's actual auth.users UUID.
insert into private.instructors(user_id) values ('VERIFIED-INSTRUCTOR-UUID');
```

The placeholder is deliberately not runnable as a UUID. Do not paste an unknown account ID or grant access through the app. All authorized instructors currently share management of this dedicated branch application; per-course instructor tenancy is a future extension.

The start-attempt RPC serializes on enrollment and enforces the open assignment window, verified email, completed profile, one active attempt, and controlled retakes. Finalization independently locks the attempt and enforces immutable status/idempotency. Released grade data uses an invoker view backed by RLS; unreleased values are in a separate protected table, not merely hidden UI fields.

## Threats and controls

| Threat                                     | Implemented control                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Student edits progress/score in JavaScript | Server traverses hashed objects and recalculates outcomes                                       |
| Forged loose objects or unsafe trees       | Canonical object hash, size/type checks; no symlink/executable modes                            |
| Arbitrary OS commands / shell injection    | Explicit tokenizer and grammar, virtual filesystem only                                         |
| Path traversal                             | Normalized absolute paths, root escape rejection, no backslash/control names, protected `.git`  |
| XSS through names, files or output         | React text escaping, no raw HTML rendering                                                      |
| Another student's data                     | Ownership RLS and authenticated guarded RPCs                                                    |
| Grade or role escalation                   | No direct write grants; private role table; guarded instructor RPCs                             |
| Duplicate or concurrent submission         | Row lock, unique key, unique final snapshot, idempotent receipt                                 |
| Oversized payload / decompression bomb     | Streaming request and object bounds, file/object/commit count caps                              |
| Repeated verifier requests                 | Persistent 8 requests per minute per user                                                       |
| Unreleased answer keys                     | Private rubric schema and guarded instructor-only functions                                     |
| Assessment paste/drop                      | Protected-region handlers, context menu restriction, paste shortcut checks, class accommodation |
| CSV spreadsheet formula injection          | Quote CSV and prefix leading formula/control characters with an apostrophe                      |
| Credential disclosure                      | Publishable frontend key only; secret key is server runtime only; no command keystroke logging  |

Auth rate limits, SMTP settings, HTTPS, JWT expiration and project security advisors are deployment configuration, not supplied by static frontend code. Student-created Git identities are descriptive labels, not proof of identity. Activity logs are student-supplied supporting evidence and can be fabricated. Hash verification proves internal content consistency, not human authorship. The browser's paste deterrent is bypassable and must not be advertised as preventing cheating.

## Data collected

Confirmed email is held by Supabase Auth. Academic profiles include name, self-reported Student ID, university, department and academic year for coursework identification. The repository contains assignment text files and Git authorship metadata. Final submissions also retain written answers, outcome results, command strings/output, branch/checkpoint identifiers, timestamps, grades and feedback. The app does not collect keystrokes, camera, microphone, device fingerprints or background surveillance. Do not enter passwords, tokens or private personal records into the educational terminal.

Local practice remains on the device unless a user explicitly exports a backup; assessed final submission and manual cloud checkpoints transmit the disclosed coursework data to the configured dedicated project. The first automatic cloud-sync patch was rejected by approval review; the delivered design instead uses explicit save/restore buttons and no background repository uploads.

## Retention and deletion

Default settings record 365 days of retention. This is a policy value, **not an automatic deletion job**. The institution must choose its appeal/records period. A privileged administrator should export required grade records, back up the dedicated database, identify old finalized attempts and delete them deliberately through the project SQL editor after approval. Dependent snapshot/answer/activity/grade rows cascade; delete only named finalized attempts, never all auth users or the project. Profiles and Auth users require a separate approved account-removal process because attempts intentionally reference identity. Audit actor references become NULL when a user is deleted, preserving the audit action without a dangling identity. No destructive retention automation is installed.

## Static hosting limitations

GitHub Pages supplies HTTPS but does not offer application-specific response header configuration. A production reverse proxy or alternate static host can add CSP, frame-ancestors, HSTS and Permissions-Policy. Do not claim the repository workflow sets these headers on Pages. Avoid permissive third-party scripts. Supabase tokens are held by the official client in browser storage; XSS would still be serious, so keep dependencies patched and never add unsafe HTML injection. No telemetry SDK or external web font is used.

## Verification status

Automated local tests exercise student A/B isolation, instructor role checks, protected grade/finalization functions, idempotency, retakes and released-score ownership in embedded PostgreSQL. Separate Git tests cover forged object bytes and disallowed metadata. `npm audit` was run and patched to zero known advisories at implementation time. Hosted Auth, SMTP, gateway JWT, remote RLS advisors and production-origin checks still require the dedicated staging project; they are not claimed as verified remotely.
