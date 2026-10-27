import type { RepoView, CommitView } from '../git-engine/engine.ts';
import { gitHistory } from '../assessments/gitHistory.ts';
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
export type RequirementCheck = {
  id: string;
  label: string;
  passed: boolean | null;
  hint: string;
  preparation?: boolean;
  expected?: string;
  detected?: string;
};
function legacyEvaluation(
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string> = {},
  revision: 1 | 2 = 1,
): { outcomes: Outcome[]; requirements: Record<string, RequirementCheck[]> } {
  const commits = view.commits;
  const {
    byId,
    ancestors,
    before,
    introduction,
    changedPaths,
    focused: separate,
    diverged,
  } = gitHistory(commits);
  const main = byId.get(view.branches.main);
  const feature = byId.get(view.branches['feature/skills']);
  const lineage = ancestors(view.branches.main || '');
  const intro = (file: string) => introduction(view.branches.main || '', file);
  const about = intro('about.txt'),
    goals = intro('goals.txt'),
    notes = intro('notes.txt');
  const meaningful = (c: CommitView) =>
    c.message.trim().length >= 8 && c.message.trim().split(/\s+/).length >= 2;
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
  const skillsBirth = introduction(feature?.oid || '', 'skills.txt');
  const featureIntroduction =
    skillsBirth && skillsOK(skillsBirth.files['skills.txt']) ? skillsBirth : undefined;
  const bonusMerge = lineage.find(
    (c) =>
      c.parents.length === 2 &&
      diverged(c.parents[0], c.parents[1]) &&
      c.parents.some(
        (p, i) =>
          includes(byId.get(p)?.files['notes.txt'], ['Assignment 1 completed.']) &&
          !includes(byId.get(c.parents[1 - i])?.files['notes.txt'], ['Assignment 1 completed.']) &&
          !byId.get(p)?.files['hobbies.txt'] &&
          (byId.get(c.parents[1 - i])?.files['hobbies.txt'] || '')
            .split('\n')
            .filter((x) => x.trim()).length >= 3,
      ) &&
      (c.files['hobbies.txt'] || '').split('\n').filter((x) => x.trim()).length >= 3 &&
      includes(c.files['notes.txt'], ['Assignment 1 completed.']),
  );
  const expandedGoals = lineage.some(
    (c) =>
      c.oid !== goals?.oid &&
      !!notes &&
      before(notes.oid, c.oid) &&
      c.files['goals.txt'] !== byId.get(c.parents[0])?.files['goals.txt'] &&
      goalsOK(c.files['goals.txt']) &&
      (c.files['goals.txt'] || '').split('\n').filter((s) => /^\s*\d+[.)]\s*\S/.test(s)).length >=
        5 &&
      meaningful(c),
  );
  const outcomes: Outcome[] = [
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
        !!about &&
        before(about.oid, goals.oid) &&
        !!notes &&
        before(goals.oid, notes.oid),
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
        expandedGoals &&
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
  const check = (
    id: string,
    label: string,
    passed: boolean | null,
    hint: string,
    preparation = false,
  ): RequirementCheck => ({ id, label, passed, hint, preparation });
  const has = (file: string) => working[file] !== undefined || main?.files[file] !== undefined;
  const requiredIdentity = !!identity.full_name.trim() && !!identity.department.trim();
  const fileChecks: RequirementCheck[] = [];
  for (const [file, valid] of [
    ['about.txt', aboutOK],
    ['goals.txt', goalsOK],
    ['notes.txt', notesOK],
  ] as const) {
    fileChecks.push(
      check(
        file + '-exists',
        file + ' created in this project',
        has(file),
        'Create this text file in the assessment project folder.',
        true,
      ),
    );
    fileChecks.push(
      check(
        file + '-draft',
        file + ' required content written',
        file === 'about.txt' && !requiredIdentity
          ? null
          : valid(working[file]) || valid(main?.files[file]),
        file === 'about.txt' && !requiredIdentity
          ? 'Complete your practice identity or profile to check personal file content.'
          : 'Open the file in the editor and compare its contents with the requirements below.',
        true,
      ),
    );
    fileChecks.push(
      check(
        file + '-committed',
        file + ' required content committed on main',
        file === 'about.txt' && !requiredIdentity ? null : !!main && valid(main.files[file]),
        'Save this file with the required content in the committed main history.',
      ),
    );
  }
  const requirements: Record<string, RequirementCheck[]> = {
    repo: [
      check(
        'initialized',
        'Git repository initialized',
        view.initialized,
        'Create a Git repository in this assessment project.',
      ),
      check(
        'name',
        'Git username configured',
        !!view.config['user.name']?.trim(),
        'Set a Git name for your commits.',
      ),
      check(
        'email',
        'Valid Git email configured',
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.config['user.email'] || ''),
        'Set a valid Git email address.',
      ),
      check(
        'main-commit',
        'Main branch has its first commit',
        !!view.branches.main,
        'The published scored check needs the first commit on main. An empty repository has no commit yet.',
      ),
    ],
    files: fileChecks,
    separate: [
      ...[
        [about, 'about.txt', aboutOK],
        [goals, 'goals.txt', goalsOK],
        [notes, 'notes.txt', notesOK],
      ].flatMap(([commit, file, valid]) => [
        check(
          String(file) + '-focused',
          String(file) + ' introduced in its own focused commit',
          separate(commit as CommitView | undefined, String(file)),
          'Introduce each starting file in a separate commit.',
        ),
        check(
          String(file) + '-original-content',
          String(file) + ' introductory commit has the required content',
          (valid as (t: string | undefined) => boolean)(
            (commit as CommitView | undefined)?.files[String(file)],
          ),
          'Check the content in the commit that first introduced this file.',
        ),
      ]),
      check(
        'personal-message',
        'Personal information commit has the required message',
        about?.message === 'Add personal information',
        'Use the personal-information message specified by the task.',
      ),
      check(
        'intro-order',
        'Personal information, goals and notes introduced in order',
        !!about &&
          !!goals &&
          !!notes &&
          before(about.oid, goals.oid) &&
          before(goals.oid, notes.oid),
        'Check the order of the three introductory commits.',
      ),
    ],
    goals: [
      check(
        'original-goals',
        'Original goals commit contains exactly three numbered goals',
        !!goals &&
          (goals.files['goals.txt'] || '').split('\n').filter((s) => /^\s*\d+[.)]\s*\S/.test(s))
            .length === 3,
        'Keep the original three goals in their introductory commit.',
      ),
      check(
        'meaningful-intros',
        'Starting commits have meaningful messages',
        [about, goals, notes].every((c) => !!c && meaningful(c)),
        'Use descriptive messages of at least two words.',
      ),
      check(
        'later-goals',
        'Two extra goals saved in a later meaningful commit',
        expandedGoals,
        'Keep the original goals and add two new numbered goals in a later commit.',
      ),
      check(
        'four-commits',
        'Main history contains at least four commits',
        lineage.length >= 4,
        'The additional goals need their own later commit.',
      ),
    ],
    feature: [
      check(
        'feature-branch',
        'Feature branch has committed history',
        !!feature,
        'Create the skills branch and save work in its history.',
      ),
      check(
        'skills-content',
        'All three required skills committed on feature/skills',
        !!feature && skillsOK(feature.files['skills.txt']),
        'Check the skills file on the feature branch.',
      ),
      check(
        'skills-introduction',
        'Skills introduced by a new feature commit',
        !!featureIntroduction,
        'The skills file must be introduced after an existing parent commit.',
      ),
    ],
    isolation: [
      check(
        'intro-parent',
        'Skills introduction has a parent commit',
        !!featureIntroduction?.parents[0],
        'Begin the feature from the existing project history.',
      ),
      check(
        'no-earlier-skills',
        'Parent commit does not contain skills.txt',
        !!featureIntroduction?.parents[0] &&
          !byId.get(featureIntroduction.parents[0])?.files['skills.txt'],
        'The new skills file belongs in the feature history, after the branch point.',
      ),
      check(
        'skills-message',
        'Skills commit has a meaningful message',
        !!featureIntroduction && meaningful(featureIntroduction),
        'Describe the skills change in at least two words.',
      ),
    ],
    merged: [
      check(
        'main-history',
        'Main branch has committed history',
        !!main,
        'Main needs committed project history.',
      ),
      check(
        'feature-history',
        'Feature branch has committed history',
        !!feature,
        'Save the feature work in a commit.',
      ),
      check(
        'main-skills',
        'Required skills are present in committed main',
        !!main && skillsOK(main.files['skills.txt']),
        'Bring the committed skills content into main.',
      ),
      check(
        'ancestry',
        'Main history includes the feature branch tip',
        !!feature && lineage.some((c) => c.oid === feature.oid),
        'Merge the feature history into main.',
      ),
    ],
    clean: [
      check(
        'on-main',
        'Current branch is main',
        view.initialized && view.branch === 'main',
        'Return to main for the final state.',
      ),
      check('main-saved', 'Main contains a commit', !!main, 'Save your work in main history.'),
      check(
        'clean-tree',
        'No staged or unstaged changes remain',
        view.initialized && view.status.every(([, h, w, s]) => h === w && h === s),
        'Check for files that still need to be committed.',
      ),
    ],
    bonus: [
      check(
        'hobbies-branch',
        'Hobbies branch has committed history',
        !!view.branches['feature/hobbies'],
        'Create a separate hobbies history.',
      ),
      check(
        'divergent-merge',
        'A merge commit joins the required hobbies and completion histories',
        !!bonusMerge,
        'The two parent histories must include the required hobbies and completion note.',
      ),
      check(
        'bonus-ancestry',
        'The merge includes feature/hobbies ancestry',
        !!bonusMerge &&
          !!view.branches['feature/hobbies'] &&
          ancestors(bonusMerge.oid).some((c) => c.oid === view.branches['feature/hobbies']),
        'Join the hobbies branch through the required merge commit.',
      ),
    ],
  };
  if (revision === 2) {
    // Explicitly versioned compatibility contract. Published revision 1 keeps
    // its historical predicates; revision 2 removes undocumented ordering and
    // uses committed parent/tree changes as evidence of a tracked-file update.
    const descriptive = (c: CommitView) => c.message.trim().split(/\s+/).length >= 2;
    const personal = (text: string | undefined) =>
      aboutOK(
        (text || '')
          .split(/\r?\n/)
          .map((line) => line.replace(/\s*:\s*/g, ': '))
          .join('\n'),
      );
    const validIntro = (file: string, valid: (text: string | undefined) => boolean) => {
      const c = intro(file);
      return c && separate(c, file) && valid(c.files[file]) && descriptive(c) ? c : undefined;
    };
    const firstAbout = validIntro('about.txt', personal);
    const firstGoals = intro('goals.txt');
    const focusedGoals = validIntro('goals.txt', goalsOK);
    const firstNotes = validIntro('notes.txt', notesOK);
    const goalLines = (text = '') => [
      ...new Set(
        text
          .split(/\r?\n/)
          .map((line) => norm(line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '')))
          .filter((line) => line && line !== 'my goals:'),
      ),
    ];
    const updated = (text: string | undefined) => {
      if (!firstGoals || !goalsOK(firstGoals.files['goals.txt']) || !goalsOK(text)) return false;
      const original = goalLines(firstGoals.files['goals.txt']);
      const next = goalLines(text);
      return (
        original.every((line) => next.includes(line)) &&
        next.filter((line) => !original.includes(line)).length >= 2
      );
    };
    const updateCommit =
      firstGoals &&
      lineage.find(
        (c) =>
          before(firstGoals.oid, c.oid) &&
          c.parents.some(
            (p) =>
              !!byId.get(p)?.files['goals.txt'] &&
              byId.get(p)?.files['goals.txt'] !== c.files['goals.txt'],
          ) &&
          updated(c.files['goals.txt']) &&
          descriptive(c),
      );
    const passed = (id: string, value: boolean) => {
      outcomes.find((o) => o.id === id)!.passed = value;
    };
    passed(
      'repo',
      view.initialized &&
        !!view.config['user.name']?.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.config['user.email'] || '') &&
        (view.branch === 'main' || !!view.branches.main),
    );
    passed(
      'files',
      (personal(working['about.txt']) || personal(main?.files['about.txt'])) &&
        (goalsOK(working['goals.txt']) || goalsOK(main?.files['goals.txt'])) &&
        (notesOK(working['notes.txt']) || notesOK(main?.files['notes.txt'])),
    );
    passed(
      'separate',
      !!firstAbout &&
        firstAbout.message === 'Add personal information' &&
        !!focusedGoals &&
        !!firstNotes,
    );
    passed('goals', !!updateCommit);
    passed(
      'isolation',
      !!featureIntroduction &&
        !!featureIntroduction.parents[0] &&
        !byId.get(featureIntroduction.parents[0])?.files['skills.txt'] &&
        descriptive(featureIntroduction),
    );
    requirements.isolation = requirements.isolation.map((c) =>
      c.id === 'skills-message'
        ? { ...c, passed: !!featureIntroduction && descriptive(featureIntroduction) }
        : c,
    );
    requirements.repo = requirements.repo.filter((c) => c.id !== 'main-commit');
    requirements.repo.push(
      check(
        'main',
        'Main is the project’s primary branch',
        view.initialized && (view.branch === 'main' || !!view.branches.main),
        'Initialize the project on main.',
      ),
    );
    requirements.files = fileChecks
      .filter((c) => !c.id.endsWith('-committed'))
      .map((c) => ({
        ...c,
        passed:
          c.id === 'about.txt-draft'
            ? requiredIdentity
              ? personal(working['about.txt']) || personal(main?.files['about.txt'])
              : null
            : c.passed,
        preparation: false,
      }));
    requirements.separate = [
      check(
        'about',
        'about.txt has its own committed introduction',
        !!firstAbout,
        'Commit the required personal information as one focused change.',
      ),
      check(
        'message',
        'Personal information commit uses the requested message',
        about?.message === 'Add personal information',
        'Use the published personal-information message.',
      ),
      check(
        'goals',
        'goals.txt has its own committed introduction',
        !!focusedGoals,
        'Commit the initial goals as one focused change with a descriptive message.',
      ),
      check(
        'notes',
        'notes.txt has its own committed introduction',
        !!firstNotes,
        'Commit the course notes as one focused change with a descriptive message.',
      ),
    ];
    const staged = view.status.some(
      ([file, head, work, index]) =>
        file === 'goals.txt' && head !== 0 && head !== index && work === index,
    );
    requirements.goals = [
      check(
        'tracked',
        'Initial goals are committed',
        !!firstGoals,
        'Commit the original goals before updating this tracked file.',
      ),
      check(
        'written',
        'Two new goals added while keeping the original goals',
        !!updateCommit || updated(working['goals.txt']),
        'Edit goals.txt and keep the original goals while adding two new goals.',
        true,
      ),
      check(
        'staged',
        'Updated goals staged or already committed',
        !!updateCommit || (staged && updated(working['goals.txt'])),
        'Stage the updated goals.txt file.',
        true,
      ),
      check(
        'committed',
        'A later commit on main saves the updated tracked file',
        !!updateCommit,
        'Commit the goals update on main, or merge the committed update into main. Use a message of at least two words. A clean tree after committing is expected.',
      ),
    ];
  }
  requirements.separate = requirements.separate.map((c) => {
    const file =
      c.id.startsWith('about') || ['message', 'personal-message'].includes(c.id)
        ? 'about.txt'
        : c.id.startsWith('goals')
          ? 'goals.txt'
          : c.id.startsWith('notes')
            ? 'notes.txt'
            : undefined;
    const birth = file ? intro(file) : undefined;
    const detected = file
      ? birth
        ? `${file}: first introduced in ${birth.oid.slice(0, 7)}; changed paths: ${changedPaths(birth).join(', ')}; message: ${birth.message}`
        : `${file}: no unique introductory commit reachable from main.`
      : [about, goals, notes].map((commit) => commit?.oid.slice(0, 7) || 'missing').join(' → ');
    return {
      ...c,
      expected: ['message', 'personal-message'].includes(c.id)
        ? 'Exact introductory commit message: Add personal information'
        : c.label,
      detected,
      hint: c.passed
        ? c.hint
        : birth || (!file && (about || goals || notes))
          ? 'A later commit cannot change an original introduction. Ask your instructor about an approved history correction or a fresh attempt before rewriting history.'
          : c.hint,
    };
  });
  const evidence: Record<string, string> = {
    repo: `Repository initialized: ${view.initialized}; active branch: ${view.branch || 'none'}; main commit: ${main?.oid.slice(0, 7) || 'none'}; name configured: ${!!view.config['user.name']?.trim()}; valid email: ${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.config['user.email'] || '')}.`,
    files: `Committed main files: ${Object.keys(main?.files || {}).join(', ') || 'none'}. Required content is checked against your profile and the published text.`,
    goals: `Main has ${lineage.length} commits; first goals commit: ${goals?.oid.slice(0, 7) || 'none'}; original nonempty lines: ${(goals?.files['goals.txt'] || '').split('\n').filter((line) => line.trim()).length}.`,
    feature: `feature/skills tip: ${feature?.oid.slice(0, 7) || 'none'}; required skills at tip: ${skillsOK(feature?.files['skills.txt'])}; valid first skills introduction: ${featureIntroduction?.oid.slice(0, 7) || 'none'}.`,
    isolation: `First skills introduction: ${skillsBirth?.oid.slice(0, 7) || 'none'}; parent commits: ${skillsBirth?.parents.map((p) => p.slice(0, 7)).join(', ') || 'none'}; message: ${skillsBirth?.message || 'none'}.`,
    merged: `Feature tip reachable from main: ${!!feature && lineage.some((c) => c.oid === feature.oid)}; required skills on main: ${skillsOK(main?.files['skills.txt'])}.`,
    clean: `Active branch: ${view.branch || 'none'}; unsaved paths: ${
      view.status
        .filter(([, h, w, i]) => h !== w || h !== i)
        .map(([file]) => file)
        .join(', ') || 'none'
    }.`,
    bonus: `feature/hobbies tip: ${view.branches['feature/hobbies']?.slice(0, 7) || 'none'}; qualifying divergent merge: ${bonusMerge?.oid.slice(0, 7) || 'none'}.`,
  };
  for (const [id, checks] of Object.entries(requirements)) {
    if (id === 'separate') continue;
    requirements[id] = checks.map((c) => ({
      ...c,
      expected: c.label,
      detected: evidence[id],
      hint:
        !c.passed && ['original-goals', 'meaningful-intros'].includes(c.id) && goals
          ? 'Later edits do not alter the original commit. Ask your instructor about an approved history correction or a fresh attempt.'
          : c.hint,
    }));
  }
  return { outcomes, requirements };
}
export function validateRepository(
  view: RepoView,
  identity: StudentIdentity,
  revision: 1 | 2 = 1,
  working: Record<string, string> = {},
): Outcome[] {
  return legacyEvaluation(view, identity, working, revision).outcomes;
}
export function legacyRequirementChecks(
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string>,
  revision: 1 | 2 = 1,
) {
  return legacyEvaluation(view, identity, working, revision).requirements;
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
