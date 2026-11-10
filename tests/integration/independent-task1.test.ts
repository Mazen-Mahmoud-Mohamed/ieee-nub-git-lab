import { describe, it, expect } from 'vitest';
import { GitEngine } from '../../src/features/git-engine/engine';
import { VirtualFS } from '../../src/features/filesystem/VirtualFS';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { verifyAssessment } from '../../src/features/assessments/verify';
import {
  assertDefinition,
  totals,
  gradeObjective,
  outcomesFor,
  sanitizeAnswers,
} from '../../src/features/assessments/model';
const identity = { full_name: 'Audit Student', department: 'Engineering' };
const about = 'Name: Audit Student\nUniversity: Nahda University\nDepartment: Engineering';
const goals = 'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects';
const notes = 'Git Course - Session 1\nIEEE NUB Student Branch';
async function run(e: GitEngine, c: string) {
  const r = await e.execute(c);
  expect(r.success, r.output).toBe(true);
}
async function commit(e: GitEngine, f: string, m: string) {
  await run(e, 'git add ' + f);
  await run(e, `git commit -m "${m}"`);
}
async function setup() {
  const e = new GitEngine();
  for (const c of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Audit Student"',
    'git config user.email audit@example.test',
  ])
    await run(e, c);
  return e;
}
async function score(e: GitEngine) {
  return verifyAssessment(
    taskOneDefinition(),
    { snapshot: e.fs.snapshot(), answers: {}, events: [] },
    identity,
    {},
  );
}
const earned = (r: Awaited<ReturnType<typeof score>>, id: string) =>
  r.outcomes.find((o) => o.id === 't1-' + id)!.earned;
describe('independent Task 1 verified recovery', () => {
  it('recovers identity configured later and never awards an uninitialized main branch', async () => {
    const e = new GitEngine();
    let r = await score(e);
    expect(earned(r, 'main-branch')).toBe(0);
    await run(e, 'mkdir IEEE-Git-Task');
    await run(e, 'cd IEEE-Git-Task');
    await run(e, 'git init');
    r = await score(e);
    expect(earned(r, 'identity-name')).toBe(0);
    await run(e, 'git config --global user.name "Audit Student"');
    await run(e, 'git config --global user.email audit@example.test');
    r = await score(e);
    expect(earned(r, 'identity-name')).toBe(2);
    expect(earned(r, 'identity-email')).toBe(2);
  });
  it('has exactly 150 points without bonus and unrestricted partial submission', () => {
    const d = taskOneDefinition();
    expect(totals(d)).toMatchObject({ practical: 100, theory: 50, bonus: 0 });
    expect(d.gateTheory || d.requireComplete).toBe(false);
    d.questions[0].points++;
    expect(() => assertDefinition(d)).toThrow();
  });
  it('recovers late goals, corrected content and qualifying later commits without unrelated deductions', async () => {
    const e = await setup();
    await e.write('about.txt', 'wrong');
    await e.write('notes.txt', notes);
    await commit(e, '.', 'wrong');
    const before = await score(e);
    expect(earned(before, 'about-content')).toBe(0);
    expect(earned(before, 'notes-content')).toBe(4);
    await e.write('about.txt', about);
    await commit(e, 'about.txt', 'Add personal information');
    let r = await score(e);
    expect(earned(r, 'about-content')).toBe(4);
    expect(earned(r, 'about-focused')).toBe(6);
    expect(earned(r, 'about-message')).toBe(2);
    expect(earned(r, 'notes-content')).toBe(4);
    await e.write('goals.txt', goals);
    await commit(e, 'goals.txt', 'Add learning goals');
    await e.write('goals.txt', goals + '\n4. Review code\n5. Build projects');
    await commit(e, 'goals.txt', 'Expand learning goals');
    r = await score(e);
    expect(earned(r, 'goals-content')).toBe(4);
    expect(earned(r, 'goals-expanded')).toBe(10);
    expect(await score(e)).toEqual(r);
    const restored = new GitEngine(VirtualFS.restore(e.fs.snapshot()));
    expect((await score(restored)).outcomes).toEqual(r.outcomes);
  });
  it('awards full practical credit in a different order including late branch and merge', async () => {
    const e = await setup();
    await e.write('notes.txt', notes);
    await commit(e, 'notes.txt', 'Add course notes');
    await e.write('goals.txt', goals);
    await commit(e, 'goals.txt', 'Add learning goals');
    await e.write('about.txt', about);
    await commit(e, 'about.txt', 'Add personal information');
    await e.write('goals.txt', goals + '\n4. Review code\n5. Build projects');
    await commit(e, 'goals.txt', 'Expand learning goals');
    const before = await score(e);
    expect(earned(before, 'skills-merged')).toBe(0);
    expect(earned(before, 'about-focused')).toBe(6);
    await run(e, 'git switch -c feature/skills');
    await e.write('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
    await commit(e, 'skills.txt', 'Add team skills');
    await run(e, 'git switch main');
    await run(e, 'git merge feature/skills');
    const r = await score(e);
    expect(r.practicalScore).toBe(100);
    expect(r.outcomes.every((o) => o.passed)).toBe(true);
  });
  it('does not trust forged grades, messages in command logs or payload config', async () => {
    const e = await setup();
    const payload = {
      snapshot: e.fs.snapshot(),
      answers: {},
      events: [],
      practical: 150,
      outcomes: [{ passed: true }],
      config: { 'user.name': 'Forged' },
    };
    const r = await verifyAssessment(taskOneDefinition(), payload, identity, {});
    expect(r.practicalScore).toBeLessThan(100);
    expect(earned(r, 'about-message')).toBe(0);
  });
  it('grades typed answers independently with safe exact normalization and alternatives', () => {
    const d = taskOneDefinition();
    d.questions = [
      {
        id: 'blank',
        prompt: 'Command?',
        kind: 'fill-blank',
        points: 5,
        options: [],
        manual: false,
        required: false,
      },
    ];
    const keys = { blank: { correctAnswers: ['git status', 'git status --short'] } };
    for (const a of [' Git   STATUS ', 'git status --short'])
      expect(gradeObjective(d, { blank: a }, keys)[0].points).toBe(5);
    for (const a of ['not git status', 'git status nonsense', '', 'git-status'])
      expect(gradeObjective(d, { blank: a }, keys)[0].points).toBe(0);
  });
});

const permutations = [
  ['about', 'goals', 'notes'],
  ['about', 'notes', 'goals'],
  ['goals', 'about', 'notes'],
  ['goals', 'notes', 'about'],
  ['notes', 'about', 'goals'],
  ['notes', 'goals', 'about'],
];
async function completed(order: string[]) {
  const e = await setup();
  const texts: Record<string, string> = { about, goals, notes };
  for (const name of order) {
    await e.write(name + '.txt', texts[name]);
    await commit(
      e,
      name + '.txt',
      name === 'about' ? 'Add personal information' : 'Add ' + name + ' content',
    );
  }
  await e.write('goals.txt', goals + '\n4. Review code\n5. Build projects');
  await commit(e, 'goals.txt', 'Expand learning goals');
  await run(e, 'git switch -c feature/skills');
  await e.write('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
  await commit(e, 'skills.txt', 'Add team skills');
  await run(e, 'git switch main');
  await run(e, 'git merge feature/skills');
  return e;
}
it.each(permutations.map((order) => [order.join(', '), order] as const))(
  'awards identical 25-criterion full marks for order %s',
  async (_label, order) => {
    const e = await completed([...order]);
    const result = await score(e);
    expect(result.practicalScore).toBe(100);
    expect(result.outcomes).toHaveLength(25);
    expect(result.outcomes.map((o) => [o.id, o.earned])).toEqual(
      taskOneDefinition()
        .sections.flatMap((s) => s.tasks)
        .map((t) => [t.id, t.points]),
    );
  },
);
it('evaluates all 25 criteria independently when reordered, isolated or surrounded by failed criteria', async () => {
  const e = await completed(permutations[0]);
  const d = taskOneDefinition(),
    view = await e.inspect();
  const working = Object.fromEntries(
    await Promise.all(
      ['about', 'goals', 'notes', 'skills'].map(async (name) => [
        name + '.txt',
        await e.read(name + '.txt'),
      ]),
    ),
  );
  const full = outcomesFor(d, view, identity, working);
  for (const task of d.sections[0].tasks) {
    const isolated = { ...d, sections: [{ ...d.sections[0], tasks: [task] }] };
    expect(outcomesFor(isolated, view, identity, working)[0]).toEqual(
      full.find((o) => o.id === task.id),
    );
  }
  const reordered = {
    ...d,
    sections: [{ ...d.sections[0], tasks: [...d.sections[0].tasks].reverse() }],
  };
  expect(outcomesFor(reordered, view, identity, working).reverse()).toEqual(full);
  const dirty = { ...working, 'about.txt': 'incorrect' };
  const failed = outcomesFor(d, view, identity, dirty);
  expect(failed.find((o) => o.id === 't1-about-content')!.earned).toBe(0);
  for (const o of full.filter((o) => o.id !== 't1-about-content'))
    expect(failed.find((x) => x.id === o.id)).toEqual(o);
  expect(
    d.sections.flatMap((s) => s.tasks).every((t) => t.rules.every((r) => r.type === 'criterion')),
  ).toBe(true);
});
it('supports every automatic format independently and never automatically grades manual responses', () => {
  const d = taskOneDefinition();
  delete d.courseSlot;
  const kinds = ['single', 'boolean', 'choice-complete', 'fill-blank'] as const;
  d.questions = kinds.map((kind, i) => ({
    id: 'auto-' + i,
    prompt: 'Complete the answer',
    kind,
    points: i + 1,
    options: kind === 'fill-blank' ? [] : ['Correct', 'Wrong'],
    manual: false,
    required: false,
  }));
  d.questions.push({ ...d.questions[0], id: 'manual', manual: true, points: 10 });
  const keys = Object.fromEntries(
    kinds.map((_, i) => ['auto-' + i, { correctAnswers: ['Correct'] }]),
  );
  const answers = Object.fromEntries(kinds.map((_, i) => ['auto-' + i, 'Correct']));
  assertDefinition(d);
  expect(gradeObjective(d, sanitizeAnswers(d, answers), keys).map((g) => g.points)).toEqual([
    1, 2, 3, 4,
  ]);
  for (let i = 0; i < 4; i++) {
    const grades = gradeObjective(d, { ...answers, ['auto-' + i]: 'Wrong' }, keys);
    expect(grades.map((g) => g.points)).toEqual([1, 2, 3, 4].map((n, j) => (j === i ? 0 : n)));
  }
  expect(() => sanitizeAnswers(d, { 'auto-2': 'Correct\nWrong' })).toThrow();
});
it('forged successful command logs cannot replace missing Git evidence', async () => {
  const e = await setup();
  const baseline = await score(e);
  const r = await verifyAssessment(
    taskOneDefinition(),
    {
      snapshot: e.fs.snapshot(),
      answers: {},
      events: [
        {
          command: 'git commit -m "Add personal information"',
          output: 'Success',
          success: true,
          branch: 'main',
          head: 'a'.repeat(40),
          timestamp: new Date().toISOString(),
        },
      ],
    },
    identity,
    {},
  );
  expect(r.outcomes).toEqual(baseline.outcomes);
  expect(r.practicalScore).toBe(baseline.practicalScore);
});
