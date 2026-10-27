import type { Definition, Task } from './model';
import type { RepoView } from '../git-engine/engine';
import type { TaskProgress } from './requirements';
import { gitHistory } from './gitHistory';
export type TaskGuide = {
  title: string;
  before: string;
  steps: string[];
  result: string;
  message?: string;
  warning?: string;
};
export function taskGuide(task: Task): TaskGuide {
  const rule = task.rules.find((r) => r.type === 'legacy'),
    v2 = rule?.revision === 2;
  const guides: Record<string, TaskGuide> = {
    repo: {
      title: 'Set up your project',
      before: 'Start in the terminal. No project folder is needed yet.',
      steps: [
        'Set your Git name and email.',
        'Create IEEE-Git-Task, enter it and run git init on main.',
      ],
      result: v2
        ? 'Git is ready for your first files.'
        : 'Git is ready. This task earns its points after your first file commit in Task 3.',
    },
    files: {
      title: 'Write your three files',
      before: 'Use the project folder from Task 1.',
      steps: [
        'Create about.txt, goals.txt and notes.txt.',
        'Select each file above the editor and enter the required text below.',
      ],
      result: v2
        ? 'All three files contain the required text.'
        : 'The text is ready. Commit these files in Task 3 to earn these points.',
    },
    separate: {
      title: 'Save each file separately',
      before:
        'Have the three files from Task 2 ready. Leave their contents unchanged for these first commits.',
      steps: v2
        ? [
            'For about.txt, stage only that file and commit with the exact message below.',
            'Stage and commit goals.txt by itself, and notes.txt by itself. The three files may be committed in any order in this version.',
            'Use at least two words in each commit message.',
          ]
        : [
            'Stage only about.txt and commit with the exact message below.',
            'Next, stage and commit goals.txt by itself. Then do the same for notes.txt.',
            'Use meaningful messages: at least two words and eight characters.',
          ],
      message: 'Add personal information',
      warning:
        'Each file must first appear in its own commit. New commits cannot split an earlier combined commit.',
      result: 'Three separate first commits contain the required text and messages.',
    },
    goals: {
      title: 'Add two more goals',
      before: v2
        ? 'The original goals are committed.'
        : 'Finish the three first commits in order before updating goals.',
      steps: [
        v2
          ? 'Keep your original goals and add two new goals.'
          : 'Keep the three original numbered goals and add numbers 4 and 5.',
        'Stage goals.txt again and commit the update with a meaningful message.',
      ],
      result: v2
        ? 'A later commit keeps your original goals and adds at least two new ones.'
        : 'Main has at least four commits, and a commit after notes saves five goals. The three starting messages must also be meaningful.',
    },
    feature: {
      title: 'Add skills on a new branch',
      before: 'Your starting files and goals update are committed.',
      steps: [
        'Create and switch to feature/skills.',
        'Create skills.txt with Problem Solving, Communication and Teamwork.',
        v2
          ? 'Stage and commit skills.txt with a message of at least two words.'
          : 'Stage and commit skills.txt with a message of at least two words and eight characters.',
      ],
      result: 'The skills branch contains all three skills.',
    },
    isolation: {
      title: 'See how branches differ',
      before: 'You have committed skills.txt on feature/skills.',
      steps: [
        'Switch to main and notice skills.txt is absent.',
        'Switch back to feature/skills and notice the file returns.',
      ],
      result:
        'Skills first appear after an existing commit, with a meaningful commit message. The saved history proves the file was new.',
    },
    merged: {
      title: 'Bring your skills into main',
      before: 'The skills work is committed on feature/skills.',
      steps: [
        'Switch to main.',
        'Run git merge feature/skills.',
        'Check that skills.txt is now on main.',
      ],
      result: 'Main contains the skills and the feature history. A fast-forward is allowed.',
    },
    clean: {
      title: 'Finish and check your work',
      before: 'The required changes are committed on main.',
      steps: [
        'Switch to main and run git status.',
        'Commit any remaining changes and check again.',
      ],
      result: 'You are on main with no untracked, staged or unsaved changes.',
    },
    bonus: {
      title: 'Optional: join two branches',
      before:
        'Complete the required work first. Skipping this does not reduce your required score.',
      steps: [
        'From main, create feature/hobbies. Add three hobbies in hobbies.txt and commit.',
        'Switch to main. Add Assignment 1 completed. to notes.txt and commit.',
        'Merge feature/hobbies into main and inspect the two-parent merge.',
      ],
      result: 'A real merge joins the separate hobbies and completion changes; both are kept.',
    },
  };
  return rule && guides[rule.outcomeId || '']
    ? guides[rule.outcomeId!]
    : {
        title: task.title,
        before: 'Follow the published task instructions.',
        steps: task.instructions.split('\n').filter(Boolean),
        result: 'All required checks below are complete.',
      };
}
export function taskFeedback(
  state: TaskProgress,
  view: RepoView,
): { text: string; history: boolean } {
  if (state.passed) return { text: 'Task complete. You can move on.', history: false };
  const legacy = state.task.rules.find((r) => r.type === 'legacy');
  if (legacy?.outcomeId === 'separate') {
    const h = gitHistory(view.commits),
      births = ['about.txt', 'goals.txt', 'notes.txt'].map((file) => ({
        file,
        c: h.introduction(view.branches.main || '', file),
      }));
    const mixed = births.filter(({ file, c }) => c && !h.focused(c, file));
    if (mixed.length)
      return {
        text: `${mixed.map((x) => x.file).join(', ')} first appeared with other changes. This task needs a separate first commit for each file. Adding another commit cannot split that original commit.`,
        history: true,
      };
    const about = births[0].c;
    if (about && about.message !== 'Add personal information')
      return {
        text: 'The first about.txt commit used a different message. It must use “Add personal information”. A later commit with that message does not change the first one.',
        history: true,
      };
    if (
      legacy.revision === 2 &&
      births.some(({ c }) => c && c.message.trim().split(/\s+/).length < 2)
    )
      return {
        text: 'A first file commit has a one-word message. Each first commit needs at least two words. A later commit cannot change that original message.',
        history: true,
      };
    const invalidText = births.find(
      ({ file, c }) =>
        c &&
        state.requirements.some(
          (r) =>
            r.status === 'incomplete' &&
            (r.id.endsWith(file + '-original-content') ||
              (legacy.revision === 2 && r.id.endsWith('-' + file.replace('.txt', '')))),
        ),
    );
    if (invalidText)
      return {
        text: `The first ${invalidText.file} commit is missing required text. Editing the file now does not change the first committed version.`,
        history: true,
      };
    if (
      births.every((x) => x.c) &&
      state.requirements.some((r) => r.status === 'incomplete' && r.id.endsWith('intro-order'))
    )
      return {
        text: 'The files were first committed in a different order. This version requires about.txt, then goals.txt, then notes.txt.',
        history: true,
      };
  }
  if (legacy?.outcomeId === 'goals' && legacy.revision !== 2) {
    const original = gitHistory(view.commits).introduction(view.branches.main || '', 'goals.txt');
    const history = gitHistory(view.commits);
    const shortMessage = ['about.txt', 'goals.txt', 'notes.txt'].some((file) => {
      const c = history.introduction(view.branches.main || '', file);
      return c && (c.message.trim().length < 8 || c.message.trim().split(/\s+/).length < 2);
    });
    const failed = state.requirements.find(
      (r) =>
        r.status === 'incomplete' &&
        (r.id.endsWith('original-goals') || (shortMessage && r.id.endsWith('meaningful-intros'))),
    );
    if (original && failed)
      return {
        text: failed.id.includes('original-goals')
          ? 'The first goals commit must contain exactly three numbered goals. Adding or removing goals now does not change that original version.'
          : 'A starting commit has a message that is too short. The original messages need at least two words and eight characters; a later message cannot replace them.',
        history: true,
      };
  }
  const first = state.requirements.find((r) => r.status !== 'completed' && !r.preparation);
  return {
    text: first?.hint || state.next,
    history: /original commit|original introduction/i.test(first?.hint || ''),
  };
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
