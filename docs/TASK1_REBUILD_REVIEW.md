# Task 1 rebuild — local review, 10 November 2026

Original local design notes. See [the current cutover report](TASK1_CUTOVER_REPORT.md) for the authorized cleanup and release status.

## Preserved original exercises

`task1-original-source.txt` is a verbatim copy of the original assignment source taken before implementation. It preserves all original section instructions, required contents, 12 theory prompts, three reflection prompts and optional hobbies/three-way-merge exercise. The new definition retains these exercises and exposes the original exercise guide in the workspace. The optional extension and reflections are unscored, not extra points.

The replacement uses recoverable Git evidence and independent points. The legacy grader and converters have been removed from the active application.

## Distribution: exactly 150

Practical: 100. Theory: 50. No bonus. Initialization and identity are 8 points; file existence/content 18; focused commits and messages 24; goal update/history 14; branching, skills and isolation 22; merge/result/clean state 14. This emphasizes actual Git history over basic setup. Every criterion has a stable ID, independent evaluator, explicit maximum, current earned score, evidence/reason and recovery guidance.

| Criterion ID | Points |
|---|---:|
| t1-initialized | 2 |
| t1-identity-name | 2 |
| t1-identity-email | 2 |
| t1-main-branch | 2 |
| t1-about-exists | 2 |
| t1-about-content | 4 |
| t1-goals-exists | 2 |
| t1-goals-content | 4 |
| t1-notes-exists | 2 |
| t1-notes-content | 4 |
| t1-about-focused | 6 |
| t1-about-message | 2 |
| t1-goals-focused | 6 |
| t1-goals-message | 2 |
| t1-notes-focused | 6 |
| t1-notes-message | 2 |
| t1-goals-expanded | 10 |
| t1-four-commits | 4 |
| t1-skills-branch | 4 |
| t1-skills-content | 4 |
| t1-skills-commit | 6 |
| t1-skills-isolation | 8 |
| t1-skills-merged | 8 |
| t1-main-skills | 4 |
| t1-clean | 2 |

Theory questions q1–q12 retain the original explanatory prompts. q3 (three areas) and q12 (create versus switch) are 5 each; the other ten are 4 each: 50 total. These original explanatory responses remain instructor graded; no pretend keyword grading was added. MCQ, boolean, complete-with-choices and typed fill-in-the-blank are available in the assessment editor/question bank. Instructors can revise future drafts to use these formats. Typed answers use Unicode NFKC, whitespace normalization and case-insensitive exact equality against explicit private alternatives. Punctuation is retained; substrings and extra words fail. Objective questions grade independently of practical work.

Both TypeScript and database validation enforce course maxima (150/150/200), no bonus, unrestricted navigation and partial submission. Draft weights are editable but must sum correctly before save/publication. The existing publisher strips keys/explanations from public versions, stores keys in the private schema and preserves immutable version references on attempts.

## Algorithm and recovery

`independentCriteria.ts` evaluates each criterion without consulting another criterion's result. File existence/content checks inspect current working files; changing one file affects only its relevant current-state criteria. Commit criteria traverse the actual verified graph reachable from branch refs. A focused commit has one changed path against its first parent; an initial focused commit or any later qualifying correction can pass. A separate criterion checks the exact personal-information message on an actual about.txt change. Goals/notes messages have their own independent criteria.

Expanded goals require a real parent with the three original numbered goals and a child retaining earlier goals while adding at least two distinct numbered goals. Branch isolation uses a parent without skills.txt followed by a commit containing it on feature ancestry; removing/recommitting and recreating the file can recover it. Merge scoring verifies that the feature tip is reachable from main; both fast-forward and merge-commit histories qualify. Current main skills content and clean working state are separate checks.

Command logs, submitted booleans and client totals never award points. The existing Edge verification path reconstructs and validates Git object evidence, recomputes outcomes and objective grades, and sends only verified results to the service-role-only acceptance RPC. Each criterion contributes at most its configured maximum, with exact decimal summation. Existing revision checks, serialized local operations, IndexedDB persistence, immutable attempt definitions and idempotency keys are reused. Student live scores are explicitly provisional; server verification is authoritative.

Git snapshots establish graph/content evidence, not proof of the exact commands typed or the historical name of a branch at commit time. Fast-forward merges have no separate merge object. The recoverable objectives therefore use graph containment and parent/file evidence; they do not invent terminal history. Deleting all refs to evidence can make history-based points disappear; current invalid file content can also lose its content points. This is intentional reevaluation, not a permanent first-mistake penalty.

## Course and instructor workflow

The student dashboard and instructor **Course totals** show Task 1 /150, Task 2 /150, Final /200, combined /500 and certificate eligibility at >=400 only after all three components have a finalized, released result. Until then the UI explicitly reports eligibility as pending. There is no per-task pass threshold. Each course slot uses the best released completed attempt across its published versions, preventing retakes being added together. Pending/unreleased work does not count. Students can query only themselves; instructors can review all students.

Task 2 and Final are reserved configuration slots only. No placeholder assessments or empty exam content are seeded or published. An instructor must create real content, choose its course slot, configure the exact total and explicitly publish. The course maximum is enforced in the new migration.

The instructor Task 1 editor exposes criterion weights, original exercises, future-version settings and all question formats. Submission review shows verified per-criterion evidence/recovery and student breakdowns. Student evidence is collapsed so the main screen stays focused on status, points and the next recovery action.
