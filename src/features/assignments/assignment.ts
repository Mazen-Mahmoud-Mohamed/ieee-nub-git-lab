import type { RepoView, CommitView } from '../git-engine/engine.ts';
export const ASSIGNMENT_ID = 'b6f4b6d0-5fe2-4e4d-b9a5-000000000001';
export const assignment = {
  id: ASSIGNMENT_ID,
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
const norm = (s: string = '') => s.toLowerCase().replace(/\s+/g, ' ').trim();
const includes = (text: string | undefined, parts: string[]) =>
  parts.every((p) => norm(text).includes(norm(p)));
export function validateRepository(view: RepoView, identity: StudentIdentity): Outcome[] {
  const commits = view.commits;
  const byId = new Map(commits.map((c) => [c.oid, c]));
  const ancestors = (oid: string): CommitView[] => {
    const seen = new Set<string>();
    const result: CommitView[] = [];
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const c = byId.get(id);
      if (!c) return;
      result.push(c);
      c.parents.forEach(visit);
    };
    visit(oid);
    return result;
  };
  const main = byId.get(view.branches.main);
  const feature = byId.get(view.branches['feature/skills']);
  const lineage = ancestors(view.branches.main || '');
  const intro = (file: string) =>
    commits.find(
      (c) => file in c.files && c.parents.every((p) => !(file in (byId.get(p)?.files || {}))),
    );
  const about = intro('about.txt'),
    goals = intro('goals.txt'),
    notes = intro('notes.txt');
  const meaningful = (c: CommitView) =>
    c.message.trim().length >= 8 && c.message.trim().split(/\s+/).length >= 2;
  const separate = (c: CommitView | undefined, file: string) =>
    !!c &&
    Object.keys(c.files).filter((p) => c.files[p] !== (byId.get(c.parents[0])?.files || {})[p])
      .length === 1 &&
    file in c.files;
  const aboutOK = (text: string | undefined) => {
    const lines = (text || '').split('\n').map(norm);
    return (
      !!identity.full_name.trim() &&
      !!identity.department.trim() &&
      [
        `Name: ${identity.full_name}`,
        'University: Nahda University',
        `Department: ${identity.department}`,
      ].every((part) => lines.includes(norm(part)))
    );
  };
  const goalsOK = (text: string | undefined) =>
    includes(text, [
      'My Goals:',
      'Learn Git',
      'Understand version control',
      'Work on team projects',
    ]);
  const notesOK = (text: string | undefined) =>
    includes(text, ['Git Course - Session 1', 'IEEE NUB Student Branch']);
  const skillsOK = (text: string | undefined) =>
    includes(text, ['Problem Solving', 'Communication', 'Teamwork']);
  const featureIntroduction =
    feature &&
    ancestors(feature.oid).find(
      (c) =>
        skillsOK(c.files['skills.txt']) && c.parents.some((p) => !byId.get(p)?.files['skills.txt']),
    );
  const bonusMerge = lineage.find(
    (c) =>
      c.parents.length === 2 &&
      c.parents.some((p) =>
        includes(byId.get(p)?.files['notes.txt'], ['Assignment 1 completed.']),
      ) &&
      c.parents.some(
        (p) =>
          (byId.get(p)?.files['hobbies.txt'] || '').split('\n').filter((x) => x.trim()).length >= 3,
      ) &&
      c.files['hobbies.txt'] &&
      includes(c.files['notes.txt'], ['Assignment 1 completed.']),
  );
  return [
    {
      id: 'repo',
      label: 'Local repository on main with configured identity',
      points: 5,
      passed:
        view.initialized &&
        !!view.branches.main &&
        !!view.config['user.name'] &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.config['user.email'] || ''),
    },
    {
      id: 'files',
      label: 'Required project files contain your information and course content',
      points: 10,
      passed:
        !!main &&
        aboutOK(main.files['about.txt']) &&
        goalsOK(main.files['goals.txt']) &&
        notesOK(main.files['notes.txt']),
    },
    {
      id: 'separate',
      label: 'The first three files were introduced in separate focused commits',
      points: 10,
      passed:
        separate(about, 'about.txt') &&
        about!.message === 'Add personal information' &&
        aboutOK(about?.files['about.txt']) &&
        separate(goals, 'goals.txt') &&
        goalsOK(goals?.files['goals.txt']) &&
        separate(notes, 'notes.txt') &&
        notesOK(notes?.files['notes.txt']) &&
        !!goals &&
        ancestors(goals.oid).some((c) => c.oid === about?.oid) &&
        !!notes &&
        ancestors(notes.oid).some((c) => c.oid === goals.oid),
    },
    {
      id: 'goals',
      label: 'Two additional goals saved in a later meaningful commit',
      points: 10,
      passed:
        lineage.length >= 4 &&
        !!goals &&
        (goals.files['goals.txt'] || '').split('\n').filter((s) => /^\s*\d+[.)]\s*\S/.test(s))
          .length === 3 &&
        lineage.some(
          (c) =>
            c.oid !== goals.oid &&
            ancestors(c.oid).some((a) => a.oid === notes?.oid) &&
            c.files['goals.txt'] !== byId.get(c.parents[0])?.files['goals.txt'] &&
            goalsOK(c.files['goals.txt']) &&
            (c.files['goals.txt'] || '').split('\n').filter((s) => /^\s*\d+[.)]\s*\S/.test(s))
              .length >= 5 &&
            meaningful(c),
        ) &&
        [about, goals, notes].every((c) => !!c && meaningful(c)),
    },
    {
      id: 'feature',
      label: 'feature/skills contains the three committed skills',
      points: 10,
      passed: !!feature && skillsOK(feature.files['skills.txt']) && !!featureIntroduction,
    },
    {
      id: 'isolation',
      label: 'History shows skills introduced after the branch point',
      points: 10,
      passed:
        !!featureIntroduction &&
        !!featureIntroduction.parents[0] &&
        !byId.get(featureIntroduction.parents[0])?.files['skills.txt'] &&
        meaningful(featureIntroduction),
    },
    {
      id: 'merged',
      label: 'Feature history and skills are present on main',
      points: 15,
      passed:
        !!main &&
        !!feature &&
        skillsOK(main.files['skills.txt']) &&
        lineage.some((c) => c.oid === feature.oid),
    },
    {
      id: 'clean',
      label: 'Finish on main with a clean working tree',
      points: 5,
      passed:
        view.branch === 'main' && !!main && view.status.every(([, h, w, s]) => h === w && h === s),
    },
    {
      id: 'bonus',
      label: 'Diverged hobbies and completion histories joined by a merge commit',
      points: 10,
      bonus: true,
      passed:
        !!bonusMerge &&
        !!view.branches['feature/hobbies'] &&
        ancestors(bonusMerge.oid).some((c) => c.oid === view.branches['feature/hobbies']),
    },
  ];
}
export function practicalScore(outcomes: Outcome[]) {
  return outcomes.filter((o) => o.passed).reduce((sum, o) => sum + o.points, 0);
}
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
