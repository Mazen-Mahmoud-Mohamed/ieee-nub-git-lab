# Task 1 replacement and production cutover

The destructive cutover has been rehearsed against isolated PostgreSQL fixtures. Production remains on the previous assessment system. No production rows, functions, migration history, or deployments were changed.

## Verified target and remaining release gates

- Supabase project `ieee-nub-git-lab`, reference `spldzxeqxwicnffnkizm`. Migration history matched through `20261028030000_requirement_scoring.sql`. The linked dry run listed only `20261110000000_independent_task1.sql`. The required Git Fundamentals course is published and no replacement version already exists.
- The production backup inventory was empty and point-in-time recovery was disabled. A protected logical backup and an isolated restore rehearsal are required unless a verified managed recovery point becomes available. Prepare that backup under an assessment write freeze and refresh the counts below.
- Production Edge functions were active at `assessment-attempt` v7, `submit-attempt` v6 and `learning-material` v1. JWT verification was enabled for all three. The cutover replaces `assessment-attempt`, removes `submit-attempt`, and retains `learning-material`.
- GitHub remote main was `eb8e1491bf061dd4af77a4dd4e13b256639dd727`. The GitHub connector verified the owner's admin role. The local GitHub CLI could not verify its account. Reauthenticate the CLI as `Mazen-Mahmoud-Mohamed` and verify the remote main again before release.

## Local replacement

- Removed the ordered and first-introduction grader, retired requirement conversion logic, legacy local submission and checkpoint paths, and the `submit-attempt` Edge Function source. Only `independent-v2` definitions can be published and scored through the active application.
- Task 1 awards 100 practical points across 25 independent criteria plus 50 points across the original manually graded theory questions. The shared Git engine supplies repository state, file contents and reachable commit evidence. Later qualifying work can recover points without changing history. The server reconstructs the snapshot and computes marks itself. Partial submission remains available.
- Drafts can be saved with incomplete weights. Publication validates required rubric weights, scope and exact totals. The gradebook accepts only finalized, released results from matching Git Fundamentals course slots and uses the best released result per component.
- Task 2 and Final Exam remain unconfigured at 150 and 200 points. Course maximum is 500. Certificate eligibility requires all three finalized and released and a total of at least 400.
- Retained shared Terminal, Editor, Git engine, attempt lifecycle and permission checks. Retained authentication, profiles, instructors, data-administrator grants, courses, lesson versions, private PPTX storage, video links and security and administrative audits. A lesson reference to a retired assessment stops resolving without changing the lesson version.

## Production deletion scope

The counts are from the read-only inventory. Twenty-one inbound foreign keys matched the reviewed allowlist. The migration takes locks, refuses a database containing replacement assessment versions, and aborts on an unknown inbound dependency. Its destructive statements target assessment data and assessment-only management rows.

| Data slated for removal | Rows observed |
|---|---:|
| Assessments, drafts, published versions and private grading keys | 26 each |
| Assessment-to-course links | 0 |
| Attempts, including active and restarted attempts | 35 |
| Assessment enrollments and retake credits | 29 |
| Verified checkpoints | 28 |
| Legacy workspace drafts | 0 |
| Submitted workspace snapshots | 22 |
| Command events | 274 |
| Student answers | 115 |
| Practical task results | 74 |
| Question grading results | 75 |
| Grade summaries | 22 |
| Instructor grading drafts | 0 |
| Attempt help requests | 7 |
| Legacy assignment sections and tasks | 5 sections, 19 tasks |
| Legacy questions and private rubrics | 12 questions, 0 rubrics |
| Experimental question bank | 3 |
| Management rows for assessment, attempt, request and question | 9, 35, 7 and 0 respectively |

The migration removes `assignment_sections`, `assignment_tasks`, `questions`, `workspace_drafts` and `private.question_rubrics` with restricted drops. It removes the obsolete `start_attempt`, `save_checkpoint`, `grade_attempt`, `manage_assignment`, rubric RPCs and both `finalize_verified` functions. It retains reusable storage for new versions, attempts, grades and questions, and seeds one published replacement Task 1 version. Historical migration files remain in source control for reproducible migration history.

## Verification

| Check | Result |
|---|---|
| Unit, Git grading and recovery, integration and permission tests | 160 passed in 21 files |
| Desktop Playwright | 13 passed |
| Connected browser fixtures | 51 passed |
| Mobile Android Chromium and iPhone WebKit | 4 local and 20 connected passed |
| Built Pages artifact smoke test at the repository base path | 1 passed |
| ESLint, TypeScript, production build, and Deno checks | Passed |
| Dependency audit | 0 vulnerabilities reported |

The isolated migration tests deleted synthetic legacy data including a restart chain, a released grade and an instructor help request. Fingerprints of synthetic account, permission, learning, storage metadata and audit records matched before and after. An unexpected inbound foreign key aborted the migration and preserved the old assessment. Browser fixtures cover late Git correction, partial submission and score consistency, including tests backed by an isolated database. Production behavior of the replacement has yet to be tested.

See the [release runbook](TASK1_SAFE_RELEASE.md) for the coordinated backend-first sequence.
