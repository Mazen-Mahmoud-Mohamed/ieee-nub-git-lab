import { blankDefinition, assertDefinition, type Definition } from './model';
import { assignment, questions, reflectionQuestions } from '../assignments/assignment';
import { criterionIds } from './independentCriteria';
const descriptions = [
  ['Initialize the repository', 'Run git init in IEEE-Git-Task.'],
  ['Configure your name', 'Set git config user.name to your name.'],
  ['Configure your email', 'Set git config user.email to a valid email address.'],
  ['Create main', 'Initialize or create the main branch.'],
  ['Create about.txt', 'Create about.txt in your working files.'],
  [
    'Complete about.txt',
    'Use three lines: Name: your profile name; University: Nahda University; Department: your profile department. Edit the current file to correct mistakes.',
  ],
  ['Create goals.txt', 'Create goals.txt in your working files.'],
  [
    'Write the original goals',
    'Write My Goals: then numbered lines 1. Learn Git, 2. Understand version control, 3. Work on team projects.',
  ],
  ['Create notes.txt', 'Create notes.txt in your working files.'],
  [
    'Write the course notes',
    'Write Git Course - Session 1 and IEEE NUB Student Branch on separate lines.',
  ],
  [
    'Commit about.txt separately',
    'Stage and commit only about.txt. A later focused change also qualifies; earlier combined commits do not block recovery.',
  ],
  [
    'Use the personal information message',
    'Make a change to about.txt and commit with the exact message Add personal information. Any qualifying later commit counts.',
  ],
  [
    'Commit goals.txt separately',
    'Stage and commit only goals.txt; a later focused correction qualifies.',
  ],
  [
    'Describe a goals change',
    'Commit a goals.txt change with a meaningful message of at least two words and eight characters.',
  ],
  [
    'Commit notes.txt separately',
    'Stage and commit only notes.txt; a later focused correction qualifies.',
  ],
  [
    'Describe a notes change',
    'Commit a notes.txt change with a meaningful message of at least two words and eight characters.',
  ],
  [
    'Commit two additional goals',
    'Start from a committed goals.txt with the three original goals. Add at least two distinct numbered goals, retain previous goals, and commit. This may happen at any time.',
  ],
  [
    'Create at least four commits',
    'Create four commits reachable from your current branches. Inspect git log --oneline.',
  ],
  ['Create feature/skills', 'Create feature/skills and switch to it.'],
  [
    'Write the three skills',
    'Write Problem Solving, Communication and Teamwork on separate lines in skills.txt.',
  ],
  ['Commit skills.txt', 'Commit a skills.txt change containing the three required skills.'],
  [
    'Demonstrate branch isolation',
    'On feature/skills, commit skills.txt after a parent without that file. Switch between the parent/main and feature to inspect the difference. If needed, remove and commit the file, then recreate and commit it on feature/skills.',
  ],
  [
    'Merge feature/skills into main',
    'Switch to main and merge feature/skills so its current tip is reachable from main. Fast-forward and merge commits both qualify.',
  ],
  [
    'Verify committed skills on main',
    'Ensure the main branch contains committed skills.txt with the three required skills.',
  ],
  [
    'Leave a clean working tree',
    'Commit or restore outstanding changes so HEAD, index and working files agree.',
  ],
];
const points = [2, 2, 2, 2, 2, 4, 2, 4, 2, 4, 6, 2, 6, 2, 6, 2, 10, 4, 4, 4, 6, 8, 8, 4, 2];
export function taskOneDefinition(): Definition {
  const d = blankDefinition();
  Object.assign(d, {
    courseSlot: 'task1',
    title: 'Task 1 — Git Fundamentals',
    description: assignment.description,
    projectName: 'IEEE-Git-Task',
    instructions:
      '150 points: practical 100 + theory 50. Every requirement is independent. Correct mistakes and recheck without restarting. Submit partial work at any time. Commands such as status and log are learning exercises; command logs never award points.',
  });
  d.sections = [
    {
      id: 'independent-task1',
      title: 'Practical requirements · 100 points',
      description: 'Each requirement earns its configured points independently.',
      steps: [],
      tasks: criterionIds.map((id, i) => ({
        id: 't1-' + id,
        title: descriptions[i][0],
        instructions: descriptions[i][1],
        points: points[i],
        bonus: false,
        rules: [{ type: 'criterion', outcomeId: id }],
        requirementWeights: { ['t1-' + id + ':rule-0-criterion']: points[i] },
      })),
    },
    ...assignment.sections.map((s) => ({
      id: 'exercise-' + s.id,
      title: s.id === 'bonus' ? 'Optional extension · unscored' : s.title,
      description: s.description,
      steps: s.steps,
      tasks: [],
    })),
  ];
  d.questions = [
    ...questions.map((q, i) => ({
      ...q,
      points: i === 2 || i === 11 ? 5 : 4,
      options: [],
      manual: true,
      required: false,
    })),
    ...reflectionQuestions.map((q) => ({ ...q, options: [], manual: true, required: false })),
  ];
  assertDefinition(d);
  return d;
}
