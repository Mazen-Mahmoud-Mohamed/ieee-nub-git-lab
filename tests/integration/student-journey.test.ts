import { describe, it, expect } from 'vitest';
import { GitEngine } from '../../src/features/git-engine/engine';
import { VirtualFS } from '../../src/features/filesystem/VirtualFS';
async function run(e: GitEngine, cmd: string) {
  const r = await e.execute(cmd);
  expect(r.success, r.output).toBe(true);
}
describe('tracked file edits and subsequent commits', () => {
  it('detects same-size tracked edits, re-stages them and commits the new snapshot with its parent', async () => {
    const e = new GitEngine();
    for (const c of [
      'mkdir IEEE-Git-Task',
      'cd IEEE-Git-Task',
      'git init',
      'git config user.name "Student"',
      'git config user.email student@example.test',
    ])
      await run(e, c);
    await e.write('about.txt', 'first version');
    await run(e, 'git add about.txt');
    await run(e, 'git commit -m "Save first version"');
    const first = (await e.inspect()).branches.main;
    await e.write('about.txt', 'other version');
    expect((await e.inspect()).status.find((s) => s[0] === 'about.txt')).toEqual([
      'about.txt',
      1,
      2,
      1,
    ]);
    await run(e, 'git add about.txt');
    expect((await e.inspect()).status.find((s) => s[0] === 'about.txt')).toEqual([
      'about.txt',
      1,
      2,
      2,
    ]);
    await run(e, 'git commit -m "Save other version"');
    const view = await e.inspect();
    expect(view.commits[0].files['about.txt']).toBe('other version');
    expect(view.commits[0].parents).toEqual([first]);
    expect(view.status[0]).toEqual(['about.txt', 1, 1, 1]);
    const restored = new GitEngine(VirtualFS.restore(e.fs.snapshot()));
    restored.cwd = e.cwd;
    await restored.write('about.txt', 'final version');
    expect((await restored.inspect()).status[0]).toEqual(['about.txt', 1, 2, 1]);
  });
});
import { readFileSync } from 'node:fs';
import { correctedAssignment } from '../../src/features/assessments/correctedAssignment';
import { outcomesFor, totals, type Definition } from '../../src/features/assessments/model';
import { requirementProgress } from '../../src/features/assessments/requirements';
import { verifyAssessment } from '../../src/features/assessments/verify';
const published = JSON.parse(
  readFileSync('tests/fixtures/published-assignment-01-v1.json', 'utf8'),
) as { version: number; document: Definition };
const identity = { full_name: 'Audit Student', department: 'Engineering' };
const working = (e: GitEngine) =>
  Object.fromEntries(
    Object.entries(e.fs.entries)
      .filter(([p, x]) => p.startsWith(e.dir + '/') && !p.includes('/.git/') && x.kind === 'file')
      .map(([p, x]) => [
        p.slice(e.dir.length + 1),
        new TextDecoder().decode(new Uint8Array(x.data)),
      ]),
  );
async function prepare() {
  const e = new GitEngine();
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git config --global user.name "Audit Student"',
    'git config --global user.email audit@example.test',
    'git init',
  ])
    await run(e, cmd);
  await e.write(
    'about.txt',
    'Name: Audit Student\r\nUniversity: Nahda University\r\nDepartment: Engineering',
  );
  await e.write(
    'goals.txt',
    'My Goals:\n- Learn Git\n- Understand version control\n- Work on team projects',
  );
  await e.write('notes.txt', 'Git Course - Session 1\nIEEE NUB Student Branch');
  return e;
}
async function commit(e: GitEngine, file: string, message: string) {
  await run(e, 'git add ' + file);
  await run(e, 'git commit -m "' + message + '"');
}
async function baseHistory() {
  const e = await prepare();
  await commit(e, 'notes.txt', 'Add session notes');
  await commit(e, 'about.txt', 'Add personal information');
  await commit(e, 'goals.txt', 'Add learning goals');
  return e;
}
const task = (d: Definition, e: GitEngine) =>
  e.inspect().then((view) => requirementProgress(d, view, identity, working(e)));

describe('published Assignment 01 scoring audit', () => {
  it('audits exact maxima and preserves the original published document and revision 1 scoring', async () => {
    const original = JSON.stringify(published.document),
      d = correctedAssignment(published.document);
    expect(published.version).toBe(1);
    expect(totals(d)).toEqual({ practical: 75, theory: 25, bonus: 10 });
    expect(
      d.sections.map((s) => s.tasks.filter((t) => !t.bonus).reduce((n, t) => n + t.points, 0)),
    ).toEqual([15, 20, 20, 20, 0]);
    expect(JSON.stringify(published.document)).toBe(original);
    expect(d.questions).toEqual(published.document.questions);
    expect(d.gateTheory).toBe(false);
    const e = await prepare();
    expect((await task(published.document, e)).filter((t) => t.passed)).toHaveLength(0);
    expect((await task(d, e)).filter((t) => t.passed).reduce((n, t) => n + t.task.points, 0)).toBe(
      15,
    );
  });
  it('recognizes a modified tracked file before staging, after staging and after its subsequent commit without requiring it to stay staged', async () => {
    const d = correctedAssignment(published.document),
      e = await baseHistory();
    expect((await task(published.document, e)).find((t) => t.task.id === 'separate')?.passed).toBe(
      false,
    );
    expect((await task(d, e)).find((t) => t.task.id === 'separate')?.passed).toBe(true);
    await e.write('goals.txt', (await e.read('goals.txt')) + '\n- Review code\n- Build projects');
    const progress = await task(d, e);
    let update = progress.find((t) => t.task.id === 'goals')!;
    expect(update.passed).toBe(false);
    expect(update.requirements.find((r) => r.id.endsWith('written'))?.passed).toBe(true);
    expect(update.requirements.find((r) => r.id.endsWith('staged'))?.passed).toBe(false);
    expect((await e.inspect()).status.find((r) => r[0] === 'goals.txt')).toEqual([
      'goals.txt',
      1,
      2,
      1,
    ]);
    await run(e, 'git add goals.txt');
    update = (await task(d, e)).find((t) => t.task.id === 'goals')!;
    expect(update.requirements.find((r) => r.id.endsWith('staged'))?.passed).toBe(true);
    expect(update.passed).toBe(false);
    const parent = (await e.inspect()).branches.main;
    await run(e, 'git commit -m "Expand learning goals"');
    const view = await e.inspect();
    expect(view.commits[0].parents).toEqual([parent]);
    expect(view.commits[0].files['goals.txt']).toContain('Build projects');
    update = (await task(d, e)).find((t) => t.task.id === 'goals')!;
    expect(update.passed).toBe(true);
    expect(update.requirements.every((r) => r.passed)).toBe(true);
    expect(view.status.find((r) => r[0] === 'goals.txt')).toEqual(['goals.txt', 1, 1, 1]);
  });
  it('agrees with trusted grading for every required task and optional bonus, ignoring forged completion logs', async () => {
    const d = correctedAssignment(published.document),
      e = await baseHistory();
    await e.write('goals.txt', (await e.read('goals.txt')) + '\n4. Review code\n5. Build projects');
    await commit(e, 'goals.txt', 'Expand learning goals');
    await run(e, 'git switch -c feature/skills');
    await e.write('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
    await commit(e, 'skills.txt', 'Add personal skills');
    const feature = await e.inspect();
    expect((await task(d, e)).find((t) => t.task.id === 'goals')?.passed).toBe(true);
    await run(e, 'git switch main');
    expect(working(e)['skills.txt']).toBeUndefined();
    expect((await task(d, e)).find((t) => t.task.id === 'feature')?.passed).toBe(true);
    await run(e, 'git merge feature/skills');
    const answers = Object.fromEntries(
      d.questions
        .filter((q) => q.required)
        .map((q) => [q.id, 'My own explanation of the observed repository state.']),
    );
    let verified = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers, events: [] },
      identity,
      {},
    );
    expect(verified.practicalScore).toBe(75);
    expect(verified.outcomes.filter((o) => !o.bonus).every((o) => o.passed)).toBe(true);
    expect(verified.grades).toHaveLength(0);
    const client = outcomesFor(d, await e.inspect(), identity, working(e));
    expect(client).toEqual(verified.outcomes);
    expect((await e.inspect()).branches.main).toBe(feature.branches['feature/skills']);
    await run(e, 'git switch -c feature/hobbies');
    await e.write('hobbies.txt', 'Reading\nChess\nWalking');
    await commit(e, 'hobbies.txt', 'Add personal hobbies');
    await run(e, 'git switch main');
    await e.write('notes.txt', (await e.read('notes.txt')) + '\nAssignment 1 completed.');
    await commit(e, 'notes.txt', 'Record assignment completion');
    await run(e, 'git merge feature/hobbies');
    verified = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers, events: [] },
      identity,
      {},
    );
    expect(verified.practicalScore).toBe(85);
    expect(verified.outcomes.every((o) => o.passed)).toBe(true);
    const forged = new GitEngine();
    const noWork = await verifyAssessment(
      d,
      { snapshot: forged.fs.snapshot(), answers, events: [] },
      identity,
      {},
    );
    expect(noWork.practicalScore).toBe(0);
  });
});

it('records the original zero-stat defect without trusting a successful command message', async () => {
  const fs = new VirtualFS(),
    original = fs.promises.stat;
  const zero = async (path: string) => ({
    ...(await original(path)),
    mtimeMs: 0,
    ctimeMs: 0,
    ino: 0,
  });
  fs.promises.stat = zero;
  fs.promises.lstat = zero;
  const e = new GitEngine(fs);
  for (const c of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name "Audit Student"',
    'git config user.email audit@example.test',
  ])
    await run(e, c);
  await e.write('about.txt', 'first version');
  await commit(e, 'about.txt', 'Save first version');
  await e.write('about.txt', 'other version');
  expect((await e.inspect()).status[0]).toEqual(['about.txt', 1, 1, 1]);
  await run(e, 'git add about.txt');
  const result = await e.execute('git commit -m "Save other version"');
  expect(result.success).toBe(true);
  expect((await e.inspect()).commits[0].files['about.txt']).toBe('other version');
});
