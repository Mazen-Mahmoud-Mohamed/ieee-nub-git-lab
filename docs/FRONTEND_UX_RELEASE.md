# Frontend UX release — 29 October 2026

This release changes the student workspace and instructor forms. It does not apply a database migration, deploy an Edge Function, publish an assessment or alter historical grades, attempts or permissions.

- The desktop terminal remains primary. Files open for explicit editing and can be closed without losing drafts; the terminal-height slider is removed.
- Phone Task / Terminal / Files views retain commands, repository state and file drafts. Typing helpers are absent on desktop, and the terminal responds to the visible viewport.
- Task guidance and score repetition are reduced, with clearer recovery/recheck controls. Historical requirements and authorized restart policies are unchanged.
- Session creation uses Session name, PPTX drop/Browse Files, Drive video link and Publish session. Transfer feedback is next to the upload, and secondary presentation/video settings are optional.
- Instructor form labels wrap correctly at narrow WebKit widths. Duplicate content navigation is removed.
- The instructor can prepare an explicit Git Fundamentals requirement-points proposal for review. Preparation does not save or publish it. The [37-requirement proposal](proposals/git-fundamentals-v3-scoring.json) remains unpublished until separately approved.

The backend requirement-scoring migration and grader were released previously. Existing published versions retain their original policy; this frontend does not convert active attempts or republish Git Fundamentals. The prior security incident remains open and is managed separately. Operational evidence and diagnostic artifacts are excluded from this release.

Validation covers unit/database scoring tests, desktop and phone browser workflows, PPTX upload/replacement, historical result protection, TypeScript, lint and the Pages-path production build. Browser fixtures use isolated local data, not real student records. Physical-device keyboard behavior and real Drive playback are separate verification boundaries.
