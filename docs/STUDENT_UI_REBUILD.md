# Student interface rebuild

## Local implementation

The dashboard puts published assessments and their Start or Continue actions before detailed grades. Course progress counts submitted published assessments. Detailed released grades and certificate progress are collapsed. Unpublished Task 2 and Final Exam appear as Coming soon, including within the student grade breakdown.

The workspace uses one working surface at a time. Desktop has Terminal, Files and Code Editor beside a one-third-width criterion panel. Mobile has Task, Terminal, Files and Code Editor tabs, a native text editor, command-history controls, and a viewport-aware terminal. File operations use the existing serialized workspace and persistence mechanisms.

All 25 practical criteria are directly selectable. Previous and Next are navigation controls. Check Work refreshes the Git inspection. The panel shows the criterion instructions, points, provisional status, relevant command guidance and required text. Technical evidence and restart options are collapsed.

Questions retain all existing input formats and accessibility restrictions. Review separates completed and incomplete practical criteria, answered and unanswered questions, saving status and the final confirmation. Partial submission still goes through the existing server verification and receipt flow. The results screen places the receipt and release status ahead of the optional official points breakdown.

## Removed frontend

- The previous multi-surface workspace layout and its duplicate open/fix/recheck controls.
- The unused WorkspaceProgress component, taskGuide/taskFeedback presentation wrappers, and practice-only Confirmation component and route.
- Obsolete workspace, task-panel, course-card, and review styles. The instructor's shared course grid and existing terminal primitives remain.

## Files

The main replacements are CourseDashboard.tsx, Workspace.tsx, TaskInstructions.tsx, Review.tsx and Terminal.tsx. WorkspaceFiles.tsx and student.css are new.

Related changes are in CourseGrades.tsx, SessionBar.tsx, RestartAttempt.tsx, AssessmentResult.tsx, Assessment.tsx, DesktopTextEditor.tsx, presentation.ts, App.tsx, main.tsx and the two existing stylesheets. useLab.ts adds safe, queued rename/delete operations. The shared Git engine change updates only its built-in-editor guidance.

Tests changed under tests/e2e, tests/mobile, tests/production and tests/browser-fixtures. The workspace-progress integration assertion uses the new editor guidance.

## Preserved boundaries

The published Task 1 definition, 25 criterion weights, independent grader, requirement model, verifier, assessment-session transport, SQL migrations, Edge Functions and Supabase configuration match the existing release. The existing 15 question/reflection prompts and 50-point theory maximum remain unchanged.

The primary administrator, student data, instructor functionality, Learning Sessions, presentations, videos and authentication were not changed in production. The locally modified PowerPoint and security remediation files were preserved. No commit, push or deployment is part of this design review.

The supplied attachment contained the written brief without the four referenced screenshot files. Before screenshots were captured from the existing local application using isolated fixture data.

## Review screenshots

All captures are local fixtures, never production student records. Files are under test-results/student-ui.

| Screen            | Before                      | After                      |
| ----------------- | --------------------------- | -------------------------- |
| Desktop dashboard | before-dashboard.png        | after-dashboard.png        |
| Desktop workspace | before-workspace.png        | after-workspace.png        |
| Phone dashboard   | before-dashboard-mobile.png | after-dashboard-mobile.png |
| Phone workspace   | before-workspace-mobile.png | after-workspace-mobile.png |

Additional captures show the mobile terminal, desktop and mobile editor, mobile questions and review, and light-theme mobile dashboard.

## Verification

The browser suites cover independent scoring and recovery, autosave, conflicts, restarts, attempt limits, instructor help, partial submission, official results, Learning Sessions and instructor regression checks. New cases explicitly visit all 25 criteria on desktop, Android Chromium and iPhone WebKit, and test file create/edit/rename/delete persistence.

Unit and integration tests are run serially with a 15-second test limit because parallel database and browser suites can exhaust the default five-second fixture startup allowance on this workstation.

| Final check                                     | Result                 |
| ----------------------------------------------- | ---------------------- |
| Unit and integration suite                      | 160 passed in 21 files |
| Desktop browser suite                           | 15 passed              |
| Connected browser fixtures                      | 52 passed              |
| Android Chromium and iPhone WebKit local suites | 6 passed               |
| Android and iPhone connected workflows          | 20 passed              |
| Built application smoke test                    | 1 passed               |
| TypeScript, ESLint and production build         | Passed                 |

The final runs have no unresolved test failures. No production acceptance testing or deployment was performed for the redesign. The design is ready for local review.
