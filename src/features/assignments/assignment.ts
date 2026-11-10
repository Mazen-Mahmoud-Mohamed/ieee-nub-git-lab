export const TASK_ONE_ID = 'b6f4b6d0-5fe2-4e4d-b9a5-000000000002';
export const assignment = {
  id: TASK_ONE_ID,
  version: 1,
  title: 'Git Fundamentals, Commits, Branching & Merging',
  level: 'Beginner',
  description:
    'Build a local repository, tell the story of your changes, and bring two branches together.',
  objectives: [
    'Understand the three areas of Git',
    'Create focused commits',
    'Explore branch isolation',
    'Merge local histories',
  ],
  sections: [
    {
      id: 'init',
      title: 'Repository initialization',
      points: 15,
      tag: '01',
      description: 'Set up your project and make it your own.',
      steps: [
        'Verify Git availability and configure your name and email.',
        'Create and enter IEEE-Git-Task. Initialize a repository with main as its primary branch.',
        'Create about.txt, goals.txt and notes.txt with the contents below.',
        'Inspect status and list hidden files to find .git.',
      ],
    },
    {
      id: 'commits',
      title: 'Staging & commits',
      points: 20,
      tag: '02',
      description: 'Small commits. A clear story.',
      steps: [
        'Stage only about.txt, inspect status, and commit with “Add personal information”.',
        'Introduce goals.txt and notes.txt in separate commits with meaningful messages.',
        'Add two more goals and commit the updated goals.',
        'Inspect your short commit history. You should have at least four commits.',
      ],
    },
    {
      id: 'branches',
      title: 'Branching & switching',
      points: 20,
      tag: '03',
      description: 'A safe space to try something new.',
      steps: [
        'Create feature/skills and switch to it.',
        'Create skills.txt containing Problem Solving, Communication and Teamwork. Commit the file.',
        'Switch to main and observe the file is absent. Switch back and observe it returns.',
        'Be ready to explain branch isolation.',
      ],
    },
    {
      id: 'merge',
      title: 'Bring it all together',
      points: 20,
      tag: '04',
      description: 'Two lines of work, one shared history.',
      steps: [
        'Ensure feature changes are committed. Switch to main and merge feature/skills.',
        'Verify skills.txt is on main and inspect history.',
        'Explain which branch received changes, the merge type, and whether a new commit was created.',
      ],
    },
    {
      id: 'bonus',
      title: 'Different histories',
      points: 10,
      tag: '+',
      description: 'Optional · Explore a three-way merge.',
      steps: [
        'From main, create feature/hobbies. Add hobbies.txt with three hobbies and commit.',
        'Back on main, add “Assignment 1 completed.” to notes.txt and commit.',
        'Merge feature/hobbies into main. Inspect the graph across all branches.',
        'Explain the merge, how it differs from Part 4, why Git creates a merge commit, and what the graph reveals.',
      ],
    },
  ],
};
export type QuestionKind = 'short' | 'long' | 'scenario' | 'single' | 'multiple' | 'interpretation';
export type Question = {
  id: string;
  prompt: string;
  kind: QuestionKind;
  points: number;
  options?: string[];
};
const prompts = [
  'What is the difference between Git and GitHub?',
  'What is a repository? What is stored inside the hidden .git directory?',
  'Explain the difference between the Working Directory, Staging Area, and Local Repository.',
  'What is the difference between git add and git commit?',
  'What is the purpose of git status, and why should it be used frequently?',
  'Why are meaningful commit messages important? Provide two examples.',
  'You create file1.txt and file2.txt, then execute git add file1.txt. Which file becomes staged, and which remains untracked? Explain.',
  'You create feature/test with git branch feature/test, and git branch displays an asterisk next to main. Which branch are you on, and how would you switch?',
  'You are currently on feature/skills and execute git merge main. Which branch receives the changes? Does it update main?',
  'You modified notes.txt, but git commit -m "Update notes" reports "Changes not staged for commit." Explain the problem and provide the necessary commands.',
  'A new file seems to disappear when switching from a feature branch back to main. Explain why and how to access the file again.',
  'What is the difference between creating a branch and switching to a branch? Provide example commands.',
];
export const questions: Question[] = prompts.map((prompt, i) => ({
  id: `q${i + 1}`,
  prompt,
  kind: i >= 6 ? 'scenario' : 'long',
  points: i === 2 ? 3 : 2,
}));
export type StudentIdentity = { full_name: string; department: string };
export type Outcome = {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  bonus?: boolean;
};
export type RequirementCheck = {
  id: string;
  label: string;
  passed: boolean | null;
  hint: string;
  preparation?: boolean;
  expected?: string;
  detected?: string;
};
export const reflectionQuestions: Question[] = [
  {
    id: 'isolation',
    prompt:
      'Explain the branch isolation you observed when switching between main and feature/skills.',
    kind: 'long',
    points: 0,
  },
  {
    id: 'merge',
    prompt:
      'Explain the direction and type of your Part 4 merge. Was a new merge commit created? Why?',
    kind: 'long',
    points: 0,
  },
  {
    id: 'bonus',
    prompt:
      'Optional bonus reflection: What happened during the merge? How did it differ from Part 4? Why might Git create a merge commit, and what does the graph reveal?',
    kind: 'long',
    points: 0,
  },
];
