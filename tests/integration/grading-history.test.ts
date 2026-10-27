import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GitEngine, type CommitView, type RepoView } from '../../src/features/git-engine/engine';
import { VirtualFS } from '../../src/features/filesystem/VirtualFS';
import { gitHistory } from '../../src/features/assessments/gitHistory';
import {
  validateRepository,
  legacyRequirementChecks,
} from '../../src/features/assignments/assignment';
import { correctedAssignment } from '../../src/features/assessments/correctedAssignment';
import { outcomesFor, type Definition } from '../../src/features/assessments/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TaskInstructions } from '../../src/features/assignments/TaskInstructions';
import { requirementProgress } from '../../src/features/assessments/requirements';
import { verifyAssessment } from '../../src/features/assessments/verify';
const identity = { full_name: 'Audit Student', department: 'Engineering' };
const definition = (
  JSON.parse(readFileSync('tests/fixtures/published-assignment-01-v1.json', 'utf8')) as {
    document: Definition;
  }
).document;
const texts = {
  'about.txt': 'Name: Audit Student\nUniversity: Nahda University\nDepartment: Engineering',
  'goals.txt': 'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
  'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
};
async function run(e: GitEngine, command: string) {
  const result = await e.execute(command);
  expect(result.success, result.output).toBe(true);
}
async function commit(e: GitEngine, paths: string, message: string) {
  await run(e, 'git add ' + paths);
  await run(e, `git commit -m "${message}"`);
}
async function prepare(combined = false, message = 'Add personal information') {
  const e = new GitEngine();
  for (const c of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Audit Student"',
    'git config user.email audit@example.test',
  ])
    await run(e, c);
  for (const [file, text] of Object.entries(texts)) await e.write(file, text);
  if (combined) await commit(e, '.', message);
  else {
    await commit(e, 'about.txt', message);
    await commit(e, 'goals.txt', 'Add learning goals');
    await commit(e, 'notes.txt', 'Add session notes');
  }
  return e;
}
async function finish(e: GitEngine) {
  await e.write('goals.txt', texts['goals.txt'] + '\n4. Review code\n5. Build projects');
  await commit(e, 'goals.txt', 'Expand learning goals');
  await run(e, 'git switch -c feature/skills');
  await e.write('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
  await commit(e, 'skills.txt', 'Add collaboration skills');
  await run(e, 'git switch main');
  await run(e, 'git merge feature/skills');
}
const passed = (view: RepoView, id: string, revision: 1 | 2 = 1) =>
  validateRepository(view, identity, revision).find((o) => o.id === id)!.passed;
const c = (
  oid: string,
  parents: string[],
  files: Record<string, string>,
  message = 'Add required content',
): CommitView => ({ oid, parents, files, message, author: 'Audit Student' });
describe('history evidence regressions', () => {
  it('requires strict ancestry, includes deleted paths and ignores array ordering', () => {
    const a = c('a', [], { 'old.txt': 'old' }),
      b = c('b', ['a'], { 'about.txt': texts['about.txt'] });
    const h = gitHistory([b, a]);
    expect(h.before('a', 'a')).toBe(false);
    expect(h.before('a', 'b')).toBe(true);
    expect(h.changedPaths(b).sort()).toEqual(['about.txt', 'old.txt']);
    expect(h.focused(b, 'about.txt')).toBe(false);
    expect(gitHistory([a, b]).introduction('b', 'about.txt')?.oid).toBe('b');
  });
  it('keeps earliest introduction after deletion/recreation and refuses ambiguous births', () => {
    const a = c('a', [], { 'a.txt': 'first' }),
      b = c('b', ['a'], {}),
      d = c('d', ['b'], { 'a.txt': 'corrected' });
    expect(gitHistory([d, b, a]).introduction('d', 'a.txt')?.oid).toBe('a');
    const root = c('root', [], {}),
      left = c('left', ['root'], { 'a.txt': 'left' }),
      right = c('right', ['root'], { 'a.txt': 'right' }),
      merge = c('merge', ['left', 'right'], { 'a.txt': 'merged' });
    const h = gitHistory([merge, right, left, root]);
    expect(h.introduction('merge', 'a.txt')).toBeUndefined();
    expect(h.introduces(merge, 'a.txt')).toBe(false);
    expect(h.diverged('left', 'right')).toBe(true);
    expect(h.diverged('left', 'root')).toBe(false);
  });
  it('does not misidentify a merge receiving a file from one parent as its introduction', () => {
    const root = c('root', [], {}),
      a = c('a', ['root'], { 'skills.txt': 'skills' }),
      b = c('b', ['root'], {}),
      merge = c('merge', ['b', 'a'], { 'skills.txt': 'skills' });
    expect(gitHistory([merge, b, a, root]).introduction('merge', 'skills.txt')?.oid).toBe('a');
  });
});
describe('published grading scenarios A–H', () => {
  it('A, F, H: all eight mandatory tasks earn 75, bonus skipped earns zero, and repeated trusted grading is identical', async () => {
    const e = await prepare();
    await finish(e);
    for (const d of [definition, correctedAssignment(definition)]) {
      const payload = { snapshot: e.fs.snapshot(), answers: {}, events: [] };
      const first = await verifyAssessment(d, payload, identity, {});
      expect(first.practicalScore).toBe(75);
      expect(first.outcomes.filter((o) => !o.bonus).every((o) => o.passed)).toBe(true);
      expect(first.outcomes.find((o) => o.bonus)?.passed).toBe(false);
      expect(first.outcomes).toEqual(outcomesFor(d, await e.inspect(), identity));
      expect(await verifyAssessment(d, payload, identity, {})).toEqual(first);
    }
  });
  it('B, D: combined first introduction fails focus/order, while valid contents and independent goals update pass', async () => {
    const e = await prepare(true);
    await finish(e);
    await e.write('notes.txt', texts['notes.txt'] + '\nReview complete');
    await commit(e, 'notes.txt', 'Review course notes');
    const view = await e.inspect();
    for (const revision of [1, 2] as const) {
      expect(passed(view, 'files', revision)).toBe(true);
      expect(passed(view, 'separate', revision)).toBe(false);
      expect(passed(view, 'goals', revision)).toBe(true);
    }
    expect(
      legacyRequirementChecks(view, identity, {}, 2).separate.find((r) => r.id === 'message')
        ?.passed,
    ).toBe(true);
    const checks = legacyRequirementChecks(view, identity, {}).separate;
    expect(checks.find((r) => r.id === 'intro-order')?.passed).toBe(false);
    expect(checks.find((r) => r.id === 'about.txt-focused')?.detected).toContain('goals.txt');
    expect(checks.find((r) => r.id === 'about.txt-focused')?.hint).toContain(
      'A later commit cannot',
    );
  });
  it('C: wrong introductory message fails only the affected task, including exact case in revision 2', async () => {
    const e = await prepare(false, 'add personal information');
    await finish(e);
    const view = await e.inspect();
    for (const revision of [1, 2] as const) {
      expect(passed(view, 'separate', revision)).toBe(false);
      expect(
        validateRepository(view, identity, revision)
          .filter((o) => !o.bonus && !o.passed)
          .map((o) => o.id),
      ).toEqual(['separate']);
    }
  });
  it('E: later edits, file deletion and recreation do not replace a correct introduction', async () => {
    const e = await prepare();
    const original = gitHistory((await e.inspect()).commits).introduction(
      (await e.inspect()).branches.main,
      'about.txt',
    )!.oid;
    await e.write('about.txt', texts['about.txt'] + '\nLater details');
    await commit(e, 'about.txt', 'Update personal details');
    await run(e, 'rm about.txt');
    await commit(e, '.', 'Remove personal file');
    await e.write('about.txt', texts['about.txt']);
    await commit(e, 'about.txt', 'Restore personal file');
    const view = await e.inspect();
    expect(gitHistory(view.commits).introduction(view.branches.main, 'about.txt')?.oid).toBe(
      original,
    );
    expect(passed(view, 'separate')).toBe(true);
    expect(passed(view, 'separate', 2)).toBe(true);
  });
  it('G: later correctly named modification cannot repair a wrong first message; switching branches does not change main history credit', async () => {
    const e = await prepare(false, 'Save initial details');
    await e.write('about.txt', texts['about.txt'] + '\nLater details');
    await commit(e, 'about.txt', 'Add personal information');
    await run(e, 'git switch -c unrelated');
    await run(e, 'rm about.txt');
    await commit(e, '.', 'Remove personal file');
    await e.write('about.txt', texts['about.txt']);
    await commit(e, 'about.txt', 'Add personal information');
    expect(passed(await e.inspect(), 'separate')).toBe(false);
    await run(e, 'git switch main');
    expect(passed(await e.inspect(), 'separate')).toBe(false);
  });
  it('empty, untracked and staged repositories receive no history credit; detached snapshots are explicitly rejected', async () => {
    const e = new GitEngine();
    expect(passed(await e.inspect(), 'separate')).toBe(false);
    const prepared = await prepare();
    await prepared.write('notes.txt', 'changed notes');
    expect(passed(await prepared.inspect(), 'clean')).toBe(false);
    await run(prepared, 'git add notes.txt');
    expect(passed(await prepared.inspect(), 'clean')).toBe(false);
    const snapshot = prepared.fs.snapshot();
    snapshot.entries[prepared.dir + '/.git/HEAD'].data = Array.from(
      new TextEncoder().encode((await prepared.inspect()).branches.main + '\n'),
    );
    await expect(
      verifyAssessment(definition, { snapshot, answers: {}, events: [] }, identity, {}),
    ).rejects.toThrow('Detached');
    const restored = new GitEngine(VirtualFS.restore(prepared.fs.snapshot()));
    restored.cwd = prepared.cwd;
    expect(validateRepository(await restored.inspect(), identity)).toEqual(
      validateRepository(await prepared.inspect(), identity),
    );
  });
});

it('reproduces the reported 30/75 case without personal data and renders honest 3/8 feedback', async () => {
  const e = await prepare(true, 'Fix a big bug');
  await e.write('goals.txt', texts['goals.txt'] + '\n4. Review code\n5. Build projects');
  await commit(e, 'goals.txt', 'Expand learning goals');
  await e.write('about.txt', texts['about.txt'] + '\nUpdated details');
  await commit(e, 'about.txt', 'Add personal information');
  await e.write('notes.txt', texts['notes.txt'] + '\nReview complete');
  await commit(e, 'notes.txt', 'Update session notes');
  const view = await e.inspect();
  const result = await verifyAssessment(
    definition,
    { snapshot: e.fs.snapshot(), answers: {}, events: [] },
    identity,
    {},
  );
  expect(result.practicalScore).toBe(30);
  const progress = requirementProgress(definition, view, identity, {});
  const task = progress.find((p) => p.task.id === 'separate')!;
  expect(task.requirements).toHaveLength(8);
  expect(task.requirements.filter((c) => c.passed)).toHaveLength(3);
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(TaskInstructions, {
        definition,
        progress,
        taskId: 'separate',
        onTask: () => {},
        identity,
        checking: false,
        error: '',
        basePath: '/assessment',
      }),
    ),
  );
  expect(html).toContain('Expected:');
  expect(html).toContain('Detected:');
  expect(html).toContain('Fix a big bug');
  expect(html).toContain('A later commit cannot change an original introduction');
  expect(html).toContain('checklist items do not earn separate points');
});

it('deleting or renaming a required final file loses content credit and restoring it recalculates fairly', async () => {
  const e = await prepare();
  await run(e, 'rm about.txt');
  await e.write('renamed.txt', texts['about.txt']);
  await commit(e, '.', 'Rename personal file');
  expect(passed(await e.inspect(), 'files')).toBe(false);
  expect(passed(await e.inspect(), 'separate')).toBe(true);
  await e.write('about.txt', texts['about.txt']);
  await commit(e, 'about.txt', 'Restore required file');
  expect(passed(await e.inspect(), 'files')).toBe(true);
});

it('untracked and staged introductions earn no committed-history credit', async () => {
  const e = new GitEngine();
  for (const command of ['mkdir IEEE-Git-Task', 'cd IEEE-Git-Task', 'git init'])
    await run(e, command);
  for (const [file, text] of Object.entries(texts)) await e.write(file, text);
  expect(passed(await e.inspect(), 'separate')).toBe(false);
  await run(e, 'git add .');
  expect(passed(await e.inspect(), 'separate')).toBe(false);
});

it('a same-parent or non-divergent merge cannot earn the optional bonus', () => {
  const root = c('root', [], {}),
    both = c('both', ['root'], {
      'hobbies.txt': 'Reading\nChess\nWalking',
      'notes.txt': 'Assignment 1 completed.',
    });
  const merge = c('merge', ['both', 'root'], both.files);
  const view: RepoView = {
    initialized: true,
    branch: 'main',
    branches: { main: 'merge', 'feature/hobbies': 'both' },
    commits: [merge, both, root],
    config: {},
    status: [],
  };
  expect(passed(view, 'bonus')).toBe(false);
});

it('revision 1 requires the goals update strictly after notes, while revision 2 preserves its published any-order contract', async () => {
  const e = new GitEngine();
  for (const command of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Audit Student"',
    'git config user.email audit@example.test',
  ])
    await run(e, command);
  for (const [file, text] of Object.entries(texts)) await e.write(file, text);
  await commit(e, 'about.txt', 'Add personal information');
  await commit(e, 'goals.txt', 'Add learning goals');
  await e.write('goals.txt', texts['goals.txt'] + '\n4. Review code\n5. Build projects');
  await commit(e, '.', 'Add notes and goals');
  await e.write('extra.txt', 'review');
  await commit(e, 'extra.txt', 'Save review details');
  const view = await e.inspect();
  expect(passed(view, 'goals')).toBe(false);
  expect(
    legacyRequirementChecks(view, identity, {}).goals.find((r) => r.id === 'later-goals')?.passed,
  ).toBe(false);
  expect(passed(view, 'goals', 2)).toBe(true);
});

it('bonus parents must contribute separate histories, and generic isolation cannot be repaired by recreating an inherited file', () => {
  const root = c('root', [], { 'skills.txt': 'old skills' }),
    left = c('left', ['root'], {
      'skills.txt': 'old skills',
      'hobbies.txt': 'Reading\nChess\nWalking',
      'notes.txt': 'Assignment 1 completed.',
    }),
    right = c('right', ['root'], { 'skills.txt': 'old skills', 'other.txt': 'unrelated' }),
    merge = c('merge', ['left', 'right'], left.files);
  const view: RepoView = {
    initialized: true,
    branch: 'main',
    branches: { main: 'merge', 'feature/hobbies': 'left' },
    commits: [merge, right, left, root],
    config: {},
    status: [],
  };
  expect(gitHistory(view.commits).diverged('left', 'right')).toBe(true);
  expect(passed(view, 'bonus')).toBe(false);
  const removed = c('removed', ['root'], {}),
    restored = c('restored', ['removed'], { 'skills.txt': 'new skills' });
  view.commits = [restored, removed, root];
  view.branches = { main: 'restored', 'feature/skills': 'restored' };
  const d: Definition = {
    ...definition,
    sections: [
      {
        id: 's',
        title: 'Isolation',
        description: '',
        steps: [],
        tasks: [
          {
            id: 'isolation',
            title: 'Branch isolation',
            instructions: 'Introduce skills after a parent',
            points: 10,
            bonus: false,
            rules: [{ type: 'isolation', source: 'feature/skills', path: 'skills.txt' }],
          },
        ],
      },
    ],
  };
  expect(outcomesFor(d, view, identity)[0].passed).toBe(false);
});

it('generic merge-commit rules preserve valid multi-parent merges', () => {
  const root = c('root', [], {}),
    a = c('a', ['root'], { 'a.txt': 'a' }),
    b = c('b', ['root'], { 'b.txt': 'b' }),
    d = c('d', ['root'], { 'd.txt': 'd' }),
    merge = c('merge', ['a', 'b', 'd'], { ...a.files, ...b.files, ...d.files });
  const view: RepoView = {
    initialized: true,
    branch: 'main',
    branches: { main: 'merge', feature: 'a' },
    commits: [merge, a, b, d, root],
    config: {},
    status: [],
  };
  const definitionWithMerge: Definition = {
    ...definition,
    sections: [
      {
        id: 's',
        title: 'Merge',
        description: '',
        steps: [],
        tasks: [
          {
            id: 'merged',
            title: 'Merge feature',
            instructions: 'Include feature through a merge commit',
            points: 10,
            bonus: false,
            rules: [{ type: 'merged', source: 'feature', target: 'main', mergeCommit: true }],
          },
        ],
      },
    ],
  };
  expect(outcomesFor(definitionWithMerge, view, identity)[0].passed).toBe(true);
});

it('a fresh course starter removes bad history without inheriting or weakening its grade', async () => {
  const { createStarter } = await import('../../src/features/assessments/starter');
  const previous = await prepare(true, 'Fix a big bug');
  const original = previous.fs.snapshot();
  const e = await createStarter(definition);
  expect(passed(await previous.inspect(), 'separate')).toBe(false);
  expect((await e.inspect()).commits).toHaveLength(0);
  expect((await e.inspect()).initialized).toBe(false);
  for (const command of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Audit Student"',
    'git config user.email audit@example.test',
  ])
    await run(e, command);
  for (const [file, text] of Object.entries(texts)) await e.write(file, text);
  await commit(e, 'about.txt', 'Add personal information');
  await commit(e, 'goals.txt', 'Add learning goals');
  await commit(e, 'notes.txt', 'Add session notes');
  await finish(e);
  expect(
    (
      await verifyAssessment(
        definition,
        { snapshot: e.fs.snapshot(), answers: {}, events: [] },
        identity,
        {},
      )
    ).practicalScore,
  ).toBe(75);
  expect(previous.fs.snapshot()).toEqual(original);
});
