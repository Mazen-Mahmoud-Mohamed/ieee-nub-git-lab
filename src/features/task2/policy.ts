// Public scoring contract. Answer keys and GitHub credentials never belong here.
export const TASK2_POLICY = 'github-task2-v1' as const;
export const TASK2_STARTER = {
  repositoryId: 1462101408,
  fullName: 'Mazen-Mahmoud-Mohamed/ieee-nub-git-task2-starter',
  main: '1cdf363e270458fc0ef65df73a1ab4d15c091e8e',
  lcd: '3145070c28d8fe77bce2827f1c155bbf810604be',
} as const;
export const task2Rubric = [
  {
    id: 't2-fork',
    points: 8,
    title: 'Personal starter fork',
    description:
      'Register your own personal fork of the supplied starter, including main and feature/lcd-display.',
    method: 'Numeric repository identity, owner and fork parent/source network from GitHub.',
    recovery:
      'Fork the starter under your connected personal account. Uncheck Copy the default branch only.',
  },
  {
    id: 't2-merge',
    points: 12,
    title: 'Integrate the divergent histories',
    description:
      'Merge feature/lcd-display into main with a merge commit retaining both supplied histories. Keep the branch until grading.',
    method:
      'Main history and two-parent merge ancestry against pinned starter SHAs. Verifies topology, not that a local conflict prompt appeared.',
    recovery:
      'Merge the original display branch into main, resolve, commit and push. Avoid squash for this merge.',
  },
  {
    id: 't2-threshold',
    points: 10,
    title: 'Resolve dryThreshold to 38',
    description:
      'On main, retain one active const int dryThreshold = 38; declaration and remove conflict markers.',
    method:
      'sensor.ino at the captured main SHA, excluding comments. Structural check, not a hardware test.',
    recovery:
      'Set the single dryThreshold declaration to 38, remove conflict markers, commit and push main.',
  },
  {
    id: 't2-lcd',
    points: 8,
    title: 'Retain simulated LCD output',
    description:
      'Keep Serial.print("[LCD] "); followed by the DRY SOIL / SOIL OK Serial.println on main.',
    method: 'Active sensor.ino source at the captured main SHA.',
    recovery:
      'Retain the simulated LCD print and conditional soil-status println. Commit and push.',
  },
  {
    id: 't2-ignore-env',
    points: 4,
    title: 'Ignore .env',
    description: 'Add an effective root .env rule to .gitignore without later negating it.',
    method: 'Ordered supported root ignore rules at the captured main SHA.',
    recovery: 'Add .env on its own line to the root .gitignore. Remove later exceptions.',
  },
  {
    id: 't2-ignore-logs',
    points: 4,
    title: 'Ignore log files',
    description: 'Add *.log to .gitignore without later exceptions.',
    method: 'Ordered supported root ignore rules at the captured main SHA.',
    recovery: 'Add *.log on its own line to the root .gitignore. Remove log exceptions.',
  },
  {
    id: 't2-ignore-settings',
    points: 4,
    title: 'Ignore local settings',
    description: 'Add an effective local-settings.txt rule to .gitignore.',
    method: 'Ordered supported root ignore rules at the captured main SHA.',
    recovery: 'Add local-settings.txt on its own line to the root .gitignore.',
  },
  {
    id: 't2-untrack',
    points: 10,
    title: 'Stop tracking local settings',
    description:
      'Remove local-settings.txt from main’s committed tree. Use git rm --cached locally to retain your copy.',
    method:
      'GitHub tree absence. Retaining a local copy cannot be verified remotely and earns no automatic marks.',
    recovery: 'Run git rm --cached local-settings.txt, commit and push. Historical copies remain.',
  },
  {
    id: 't2-buzzer',
    points: 10,
    title: 'Implement the buzzer improvement',
    description:
      'On main, call tone(buzzerPin, 1000) when isDry and noTone(buzzerPin) otherwise, using an if/else block. Submit through feature/buzzer.',
    method:
      'Active main source structure plus a sensor.ino change on a same-repository feature/buzzer PR.',
    recovery:
      'Use if (isDry) { tone(buzzerPin, 1000); } else { noTone(buzzerPin); } and merge your feature/buzzer PR.',
  },
  {
    id: 't2-issue',
    points: 6,
    title: 'Describe the buzzer issue',
    description:
      'Create your own issue in your fork with buzzer in the title and at least 40 characters explaining the improvement.',
    method: 'GitHub issue ID, author, title and body. Excludes pull requests.',
    recovery:
      'Enable Issues on your fork and create or edit your buzzer issue with a clear explanation.',
  },
  {
    id: 't2-pr',
    points: 8,
    title: 'Open a documented pull request',
    description:
      'Open your own feature/buzzer PR into your fork’s main. Use a title of 10+ characters, explanation of 40+ characters and Closes #N referencing a real issue on your fork.',
    method: 'PR repository IDs, author, refs, title, body and existing local issue reference.',
    recovery:
      'Push feature/buzzer. Open the PR into your own main, explain it and add Closes #N with your fork’s issue number.',
  },
  {
    id: 't2-pr-merged',
    points: 4,
    title: 'Merge the buzzer pull request',
    description:
      'Merge your feature/buzzer PR into main and retain its merge commit in main ancestry.',
    method:
      'GitHub merged_at, merge_commit_sha and ancestry, independently of PR description quality.',
    recovery: 'Review and merge your buzzer PR into main, then push later corrections.',
  },
  {
    id: 't2-review',
    points: 6,
    title: 'Receive a peer code review',
    description:
      'Ask another person to submit a nonempty review on your buzzer PR. Comments, approvals and requests for changes count. Bots and your own reviews do not.',
    method:
      'GitHub submitted review ID, human reviewer identity and body. Verifies the review artifact, not its quality.',
    recovery:
      'Invite a classmate to use GitHub’s review form and submit specific written feedback.',
  },
  {
    id: 't2-readme',
    points: 6,
    title: 'Document wiring, running and contribution',
    description:
      'Update README.md with Wiring, Run and Contributing Markdown headings, pins A0 and 8, and tone/noTone behavior. Include at least 40 characters under each heading.',
    method: 'README content at the captured main SHA. Mechanical completeness check.',
    recovery:
      'Add ## Wiring, ## Run and ## Contributing sections. Explain the pins, sketch testing and tone/noTone behavior.',
  },
] as const;
export type Task2Status = 'not_started' | 'pending' | 'passed' | 'failed' | 'unverifiable';
export type Task2Outcome = {
  id: string;
  label: string;
  points: number;
  earned: number;
  bonus: false;
  passed: boolean;
  status: Task2Status;
  requirements: Array<{
    id: string;
    passed: boolean;
    points: number;
    earned: number;
    reason: string;
    evidence: string;
    recovery: string;
  }>;
};
export function emptyTask2Outcomes(
  status: Task2Status = 'not_started',
  reason = 'Register your fork and choose Check My Work.',
): Task2Outcome[] {
  return task2Rubric.map((c) => ({
    id: c.id,
    label: c.title,
    points: c.points,
    earned: 0,
    bonus: false,
    passed: false,
    status,
    requirements: [
      {
        id: `${c.id}:rule-0-github`,
        passed: false,
        points: c.points,
        earned: 0,
        reason,
        evidence: 'No server verification.',
        recovery: c.recovery,
      },
    ],
  }));
}
