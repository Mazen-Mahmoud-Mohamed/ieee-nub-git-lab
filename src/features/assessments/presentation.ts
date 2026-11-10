import type { Definition, Task } from './model';
import type { TaskProgress } from './requirements';
export type TaskGuide = {
  title: string;
  before: string;
  steps: string[];
  result: string;
  message?: string;
  warning?: string;
};
export function taskGuide(task: Task): TaskGuide {
  return {
    title: task.title,
    before: 'Follow the published task instructions.',
    steps: task.instructions.split('\n').filter(Boolean),
    result: 'All required checks below are complete.',
  };
}

export function taskFeedback(state: TaskProgress) {
  if (state.passed) return 'Task complete. You can move on.';
  return state.requirements.find((check) => check.status !== 'completed' && !check.preparation)?.hint || state.next;
}

export const courseLessons = [
  {
    id: 'files',
    title: 'Files and the editor',
    text: 'Create a text file, select its name above the editor, and type your text. Your work saves on this device. Creating a file does not save it in Git.',
    command: 'touch notes.txt',
  },
  {
    id: 'status',
    title: 'See what changed',
    text: 'Status shows new files, edits and files staged for the next commit. Check it before every commit.',
    command: 'git status',
  },
  {
    id: 'staging',
    title: 'Choose what to save',
    text: 'Staging chooses which changes go into your next commit. Add one file at a time when the task asks for focused commits.',
    command: 'git add about.txt',
  },
  {
    id: 'commits',
    title: 'Make a commit',
    text: 'A commit saves a version of the staged files in Git history. Use the exact message when a task specifies one. Later commits do not change the first version.',
    command: 'git commit -m "Add personal information"',
  },
  {
    id: 'branches',
    title: 'Try changes on a branch',
    text: 'Creating a branch gives a name to a line of work. Switching chooses which branch you edit. This command does both.',
    command: 'git switch -c feature/skills',
  },
  {
    id: 'merges',
    title: 'Bring changes together',
    text: 'Switch to the branch that should receive the changes before merging. Check the result and status afterward.',
    command: 'git switch main\ngit merge feature/skills',
  },
];
export function assessmentSummary(d: Definition) {
  const tasks = d.sections.flatMap((s) => s.tasks);
  return `${tasks.filter((t) => !t.bonus).length} required tasks · ${d.questions.length} questions`;
}
