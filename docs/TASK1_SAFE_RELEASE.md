# Task 1 cutover and release runbook

The experimental assessment cleanup is authorized. See [the cutover report](TASK1_CUTOVER_REPORT.md) for the verified environment, deletion scope, and production status.

## Coordinated production sequence

1. Verify the GitHub CLI session as the repository owner and confirm that the reviewed release descends from current remote main. Validate CI from an isolated branch or pull request and build the Pages artifact at the existing repository base path. Retain the current Edge version and frontend artifact.
2. Schedule an assessment maintenance window and stop legacy assessment writes, including starts, autosaves, submissions, and instructor publication. Leave authentication and Learning Sessions available. Refresh the project reference, migration history, function inventory, affected counts, inbound foreign keys, and fingerprints of shared records under the write freeze.
3. Create a recoverable backup. If Supabase has a suitable restore point, verify it by restoring into an isolated project. Otherwise use an authenticated PostgreSQL client and an encrypted, access-restricted logical backup of the assessment tables in the report, their schema, grants and RPCs, and the four assessment-only management record kinds. Store it outside the repository and send data directly to protected storage. Rehearse restoration in isolation and compare counts and integrity without emitting data or keys.
4. Confirm that the linked dry run lists only the reviewed Task 1 migration. Apply it only after the backup and restore verification succeeds and the frontend artifact is ready.

   ```powershell
   $task1ProjectRef = 'spldzxeqxwicnffnkizm'
   supabase migration list --linked
   supabase db push --linked --dry-run
   # Destructive step. Run only after the restore rehearsal and write freeze.
   supabase db push --linked
   supabase functions deploy assessment-attempt --project-ref $task1ProjectRef --use-api
   supabase functions list --project-ref $task1ProjectRef
   ```

5. Verify the migration, grants, Task 1 version 1 and its 25 criteria, absence of legacy rows, and preservation of shared records. Check deployed JWT verification, origin, attempt ownership, checkpoint conflict, late correction, partial submission and grade release with isolated test data. Delete the deployed `submit-attempt` endpoint if it is present. Keep the deployed `learning-material` version.
6. Push the reviewed release to main only after backend verification. Wait for the existing GitHub Pages workflow to publish the exact release commit. Verify login, desktop and mobile Git workspaces, Task 1 scoring and submission, unconfigured Task 2 and Final Exam, and Learning Sessions. Reopen assessments once those checks pass.
7. If SQL fails, confirm transaction rollback. If a later stage fails after commit, keep assessments paused and roll forward with compatible code. If data recovery is necessary, restore the verified backup in isolation first and plan a scoped recovery that preserves shared records and new work.

## Release file scope

The [path manifest](TASK1_RELEASE_FILES.txt) includes the legacy grader and endpoint removals, migration, new grading system, and synthetic fixtures. The modified PowerPoint, security incident work, local operational scripts, logs, screenshots, credentials, and backups are excluded.

## Exact grading contract

Practical criteria use stable IDs prefixed with `t1-`; each persisted requirement ID appends `:rule-0-criterion`. Marks are additive, never a shared deduction pool. Each row can earn its maximum once, independently of other rows. Real Git prerequisites remain: a commit needs a repository/history, and an ancestry check needs relevant refs. Current-file corrections recover content marks; later qualifying commits recover commit marks; later branches/merges recover their structural checks. Reordering independent work does not change results. Deleting evidence or making current content invalid can lose the directly related current-state marks; no permanent first-error latch exists.

| # | Criterion suffix | Maximum | Exact validation condition |
|---:|---|---:|---|
| 1 | `initialized` | 2 | Verified repository is initialized. |
| 2 | `identity-name` | 2 | Current repository user.name is nonempty. |
| 3 | `identity-email` | 2 | Current user.email matches the configured email syntax check (nonspace local/domain and dot). |
| 4 | `main-branch` | 2 | Repository initialized and HEAD names main, or a saved main branch exists. |
| 5 | `about-exists` | 2 | about.txt exists in current working files. |
| 6 | `about-content` | 4 | Current about.txt contains normalized full lines Name: profile name; University: Nahda University; Department: profile department; profile name/department must be nonempty. |
| 7 | `goals-exists` | 2 | goals.txt exists in current working files. |
| 8 | `goals-content` | 4 | Current goals.txt has My Goals: and numbered entries Learn Git; Understand version control; Work on team projects. |
| 9 | `notes-exists` | 2 | notes.txt exists in current working files. |
| 10 | `notes-content` | 4 | Current notes.txt contains full normalized lines Git Course - Session 1 and IEEE NUB Student Branch. |
| 11 | `about-focused` | 6 | Any reachable non-merge commit has about.txt present and changes only about.txt against its parent (or empty tree for root). |
| 12 | `about-message` | 2 | Any reachable commit changes about.txt and its trimmed message is exactly Add personal information. |
| 13 | `goals-focused` | 6 | Any reachable non-merge commit has goals.txt present and changes only goals.txt. |
| 14 | `goals-message` | 2 | Any reachable commit changes goals.txt with a message at least eight characters and two words. |
| 15 | `notes-focused` | 6 | Any reachable non-merge commit has notes.txt present and changes only notes.txt. |
| 16 | `notes-message` | 2 | Any reachable commit changes notes.txt with a message at least eight characters and two words. |
| 17 | `goals-expanded` | 10 | A reachable commit has a parent with the three original numbered goals; child retains all previous normalized goals and adds at least two distinct numbered goals. |
| 18 | `four-commits` | 4 | At least four distinct commits reachable from current branch refs (deduplicated by object ID). |
| 19 | `skills-branch` | 4 | A saved feature/skills branch ref exists. |
| 20 | `skills-content` | 4 | Required skill lines appear in working skills.txt OR in skills.txt at the feature/skills tip. |
| 21 | `skills-commit` | 6 | Any reachable commit changes skills.txt and contains Problem Solving, Communication and Teamwork as normalized full lines. |
| 22 | `skills-isolation` | 8 | On feature/skills ancestry, a commit with one known parent has skills.txt while its parent does not. |
| 23 | `skills-merged` | 8 | Both main and feature/skills tips exist, and feature tip is an ancestor of (or equal to) main tip. Fast-forward accepted. |
| 24 | `main-skills` | 4 | Committed skills.txt at main tip contains all three required skill lines. |
| 25 | `clean` | 2 | Repository initialized and HEAD/index/working entries agree; authoritative verification independently compares working text files to HEAD to reject forged clean-index claims. |

**Practical = 100.** Content matching uses Unicode NFKC, case folding and whitespace normalization where implemented. Focused commits inspect actual changed paths; typed command events do not count. The service verifies Git object hashes and safe trees, then recomputes results using the immutable server assessment definition and private keys. Client success flags, grades and totals are ignored. Branch names at the time of past commands cannot be proved from a snapshot; merge and isolation objectives intentionally use verifiable graph/content equivalence.

## Exact theory breakdown

All original explanatory questions below are **manually graded**; each receives independent instructor marks up to its maximum. Objective MCQ, True/False, completion-choice and typed-blank formats are supported and automatically graded when configured in a future draft. No real private key is embedded in this Task 1 definition.

| Question | Maximum | Original prompt |
|---|---:|---|
| q1 | 4 | What is the difference between Git and GitHub? |
| q2 | 4 | What is a repository? What is stored inside the hidden .git directory? |
| q3 | 5 | Explain the difference between the Working Directory, Staging Area, and Local Repository. |
| q4 | 4 | What is the difference between git add and git commit? |
| q5 | 4 | What is the purpose of git status, and why should it be used frequently? |
| q6 | 4 | Why are meaningful commit messages important? Provide two examples. |
| q7 | 4 | You create file1.txt and file2.txt, then execute git add file1.txt. Which file becomes staged, and which remains untracked? Explain. |
| q8 | 4 | You create feature/test with git branch feature/test, and git branch displays an asterisk next to main. Which branch are you on, and how would you switch? |
| q9 | 4 | You are currently on feature/skills and execute git merge main. Which branch receives the changes? Does it update main? |
| q10 | 4 | You modified notes.txt, but git commit -m "Update notes" reports "Changes not staged for commit." Explain the problem and provide the necessary commands. |
| q11 | 4 | A new file seems to disappear when switching from a feature branch back to main. Explain why and how to access the file again. |
| q12 | 5 | What is the difference between creating a branch and switching to a branch? Provide example commands. |

**Theory = 50. Task 1 = 100 + 50 = 150. Bonus = 0.** Three original reflections (branch isolation, merge direction/type, optional hobbies merge comparison) remain unscored. The optional hobbies/three-way-merge exercise remains available, without extra marks.

Course: Task 1 /150; Task 2 /150 (no content published); Final /200 (no content published); total /500; certificate threshold /400. Eligibility is pending until all three slots have a finalized, released result, then requires >=400. No per-task passing threshold. Best released result per slot is used, never sum of retakes. No Task 2 or Final assessment is created by the migration.
