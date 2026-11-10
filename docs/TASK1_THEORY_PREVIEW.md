# Task 1 theory preview

**50 theory points** across 15 questions. Task 1 totals **150 points** with the existing 100 practical points.

Five multiple-choice questions earn 20 points, five True/False questions earn 10 points, and five completion questions earn 20 points. The completion group has two selections and three typed responses. Each question earns zero points when unanswered.

The questions draw from the Session 1 practice guide and the repository, staging, history, branch, and merge exercises in the original Task 1 materials.

All 15 questions use automatic server grading. The multiple-select item earns credit for the complete correct selection. Typed Git commands accept configured equivalents and extra spaces or tabs between tokens. Command names, options, and branch names are case-sensitive.

## Coordinated release

1. Review and stage the student redesign, theory UI, shared verifier update and tests. Keep the private import package outside Git. Confirm the linked Supabase project is `spldzxeqxwicnffnkizm`.
2. Deploy and verify `assessment-attempt` with JWT verification enabled. The verifier must recognize the versioned Git-command matching setting before the new assessment is published. The existing database stores this setting in the question document, so this release requires no migration.
3. Publish the frontend through the existing GitHub Pages workflow. Verify the deployed revision, student workspace, Questions screen and instructor editor.
4. Open the existing Task 1 assessment in Admin Dashboard → Questions and import the private JSON package. Save Draft and use the student preview. Confirm 25 practical criteria for 100 points and 15 theory questions for 50 points, then publish a new version. Students with existing attempts keep their original version.
5. Verify the published totals, answer-key privacy, both accepted answers for question 15, case-sensitive rejection, autosave and partial submission using an isolated student attempt.

## 1. MCQ · single answer · 4 points

What does the hidden .git directory contain after you initialize a repository?

- An extra copy of every project file
- Git metadata for the local repository
- A connection to a GitHub account
- Only the name of the active branch

## 2. MCQ · single answer · 4 points

You edited about.txt and goals.txt. What should you do to include only the about.txt change in the next commit?

- Stage both files and write a message about about.txt
- Run git status and commit without staging
- Stage only about.txt, then commit
- Switch to main, then commit both changes

## 3. MCQ · single answer · 4 points

Why does Task 1 ask for separate commits with descriptive messages?

- They make each change easier to identify in history
- They make Git stage the remaining files automatically
- They change the active branch after each commit
- They prevent later edits to those files

## 4. MCQ · multiple answers · 4 points

Which two commands show working tree status or commit history without staging or committing changes?

- git add about.txt
- git log --oneline
- git commit -m "Update about"
- git status

## 5. MCQ · single answer · 4 points

While on main, you successfully run git merge feature/skills. Which branch receives the merged work?

- feature/skills
- Both main and feature/skills
- main
- A new branch named merge

## 6. True/False · 2 points

Creating a branch with git branch feature/skills also switches to that branch.

- True
- False

## 7. True/False · 2 points

A file can be saved on your device without being recorded in a Git commit.

- True
- False

## 8. True/False · 2 points

Running git status moves changed files into the staging area.

- True
- False

## 9. True/False · 2 points

If skills.txt exists only in a commit on feature/skills, switching from that branch to main before merging can make the file disappear from the working directory.

- True
- False

## 10. True/False · 2 points

Every successful Git merge creates a new merge commit.

- True
- False

## 11. Complete by selection · 4 points

Git records the staged version of your project when you create a ____.

- branch
- commit
- working directory
- status report

## 12. Complete by selection · 4 points

The ____ holds the changes you selected for the next commit.

- working directory
- commit message
- staging area
- branch name

## 13. Fill in the blank · 4 points

Run ____ inside IEEE-Git-Task to create a local Git repository. Enter the command without options.

## 14. Fill in the blank · 4 points

Run ____ to display the commit history with one line per commit. Enter the command with its option.

## 15. Fill in the blank · 4 points

Run ____ to switch to the existing feature/skills branch. Enter the full command without any options.
