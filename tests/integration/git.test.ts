import { beforeEach, describe, it, expect } from 'vitest';
import { GitEngine } from '../../src/features/git-engine/engine';
import { VirtualFS } from '../../src/features/filesystem/VirtualFS';
import { validateRepository, practicalScore } from '../../src/features/assignments/assignment';
import { verifySnapshot } from '../../src/features/submissions/verify';
let e: GitEngine;
export async function run(engine: GitEngine, cmd: string) {
  const result = await engine.execute(cmd);
  expect(result.success, result.output).toBe(true);
  return result;
}
export async function setup(engine: GitEngine) {
  for (const cmd of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git --version',
    'git config --global user.name "Test Student"',
    'git config --global user.email student@example.edu',
    'git init -b main',
  ])
    await run(engine, cmd);
}
export async function complete(engine: GitEngine) {
  await setup(engine);
  const texts: Record<string, string> = {
    'about.txt': 'Name: Test Student\nUniversity: Nahda University\nDepartment: Engineering',
    'goals.txt': 'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
    'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
  };
  for (const [file, text] of Object.entries(texts)) await engine.write(file, text);
  for (const [file, msg] of [
    ['about.txt', 'Add personal information'],
    ['goals.txt', 'Add learning goals'],
    ['notes.txt', 'Add session notes'],
  ]) {
    await run(engine, 'git add ' + file);
    await run(engine, `git commit -m "${msg}"`);
  }
  await engine.write(
    'goals.txt',
    texts['goals.txt'] + '\n4. Review code\n5. Build useful projects',
  );
  await run(engine, 'git add goals.txt');
  await run(engine, 'git commit -m "Expand learning goals"');
  await run(engine, 'git switch -c feature/skills');
  await engine.write('skills.txt', 'Problem Solving\nCommunication\nTeamwork');
  await run(engine, 'git add skills.txt');
  await run(engine, 'git commit -m "Add collaboration skills"');
  await run(engine, 'git switch main');
  await run(engine, 'git merge feature/skills');
}
beforeEach(() => {
  e = new GitEngine();
});
describe('real Git repository semantics', () => {
  it('redacts likely credentials from supporting activity', async () => {
    const result = await e.execute('git config --global password accidentally-entered-value');
    expect(result.success).toBe(false);
    expect(JSON.stringify(e.events)).not.toContain('accidentally-entered-value');
  });
  it('reports short status with staged and unstaged columns', async () => {
    await setup(e);
    await e.write('a.txt', 'first');
    expect((await run(e, 'git status --short')).output).toBe('?? a.txt');
    await run(e, 'git add a.txt');
    await e.write('a.txt', 'second');
    expect((await run(e, 'git status -s')).output).toBe('AM a.txt');
  });
  it('rejects a dirty working file even when an attacker supplies a stale clean index', async () => {
    await complete(e);
    const snapshot = e.fs.snapshot();
    snapshot.entries[e.dir + '/about.txt'].data = Array.from(
      new TextEncoder().encode('forged working text'),
    );
    await expect(
      verifySnapshot(snapshot, { full_name: 'Test Student', department: 'Engineering' }),
    ).rejects.toThrow('Working files');
  });
  it('rejects commands without a repository and invalid pathspecs', async () => {
    expect((await e.execute('git add missing.txt')).success).toBe(false);
    await setup(e);
    expect((await e.execute('git add missing.txt')).success).toBe(false);
    expect((await e.inspect()).commits).toHaveLength(0);
  });
  it('keeps the staged snapshot separate from subsequent edits', async () => {
    await setup(e);
    await e.write('a.txt', 'staged');
    await run(e, 'git add a.txt');
    await e.write('a.txt', 'unstaged');
    const before = await e.inspect();
    expect(before.status[0]).toEqual(['a.txt', 0, 2, 3]);
    await run(e, 'git commit -m "Add initial snapshot"');
    const v = await e.inspect();
    expect(v.commits[0].files['a.txt']).toBe('staged');
    expect(await e.read('a.txt')).toBe('unstaged');
    expect((await e.execute('git status')).output).toContain('Changes not staged');
  });
  it('rejects empty and unconfigured commits', async () => {
    await setup(e);
    expect((await e.execute('git commit -m "Empty commit"')).success).toBe(false);
    const unconfigured = new GitEngine();
    for (const cmd of ['mkdir IEEE-Git-Task', 'cd IEEE-Git-Task', 'git init'])
      await run(unconfigured, cmd);
    await unconfigured.write('a.txt', 'hello');
    await run(unconfigured, 'git add a.txt');
    expect((await unconfigured.execute('git commit -m "Add content"')).success).toBe(false);
  });
  it('isolates branches and fast-forwards main without a merge commit', async () => {
    await complete(e);
    const v = await e.inspect();
    expect(v.commits).toHaveLength(5);
    expect(v.branches.main).toBe(v.branches['feature/skills']);
    await run(e, 'git branch checkpoint');
    await run(e, 'git switch -c next');
    await e.write('new.txt', 'new feature');
    await run(e, 'git add new.txt');
    await run(e, 'git commit -m "Add next feature"');
    await run(e, 'git switch main');
    expect(e.fs.entries[e.dir + '/new.txt']).toBeUndefined();
    await run(e, 'git switch next');
    expect(await e.read('new.txt')).toBe('new feature');
  });
  it('creates a merge commit for nonconflicting diverged histories', async () => {
    await complete(e);
    await run(e, 'git switch -c feature/hobbies');
    await e.write('hobbies.txt', 'Reading\nRunning\nDrawing');
    await run(e, 'git add hobbies.txt');
    await run(e, 'git commit -m "Add personal hobbies"');
    await run(e, 'git switch main');
    await run(e, 'echo "Assignment 1 completed." >> notes.txt');
    await run(e, 'git add notes.txt');
    await run(e, 'git commit -m "Record assignment completion"');
    expect((await run(e, 'git merge feature/hobbies')).output).toContain('Merge commit');
    const v = await e.inspect();
    expect(v.commits[0].parents).toHaveLength(2);
    expect(
      practicalScore(
        validateRepository(v, { full_name: 'Test Student', department: 'Engineering' }),
      ),
    ).toBe(85);
  });
  it('leaves a conflicting merge unchanged and reports failure', async () => {
    await setup(e);
    await e.write('a.txt', 'base\n');
    await run(e, 'git add a.txt');
    await run(e, 'git commit -m "Add base text"');
    await run(e, 'git switch -c feature');
    await e.write('a.txt', 'feature\n');
    await run(e, 'git add a.txt');
    await run(e, 'git commit -m "Change feature text"');
    await run(e, 'git switch main');
    await e.write('a.txt', 'main\n');
    await run(e, 'git add a.txt');
    await run(e, 'git commit -m "Change main text"');
    const head = await e.head();
    expect((await e.execute('git merge feature')).success).toBe(false);
    expect(await e.head()).toBe(head);
    expect(await e.read('a.txt')).toBe('main\n');
  });
  it('protects dirty tracked files when switching', async () => {
    await complete(e);
    await e.write('notes.txt', 'unsaved changes');
    expect((await e.execute('git switch feature/skills')).success).toBe(false);
    expect(await e.read('notes.txt')).toBe('unsaved changes');
  });
  it('recovers the complete repository including staging from a versioned snapshot', async () => {
    await complete(e);
    await e.write('notes.txt', 'new notes');
    await run(e, 'git add notes.txt');
    const recovered = new GitEngine(VirtualFS.restore(e.fs.snapshot()));
    expect(await recovered.inspect()).toEqual(await e.inspect());
  });
  it('verifies main assignment from history rather than client flags', async () => {
    await complete(e);
    const verified = await verifySnapshot(e.fs.snapshot(), {
      full_name: 'Test Student',
      department: 'Engineering',
    });
    expect(verified.score).toBe(75);
    await expect(
      verifySnapshot(e.fs.snapshot(), { full_name: 'Wrong Student', department: 'Engineering' }),
    ).rejects.toThrow('incomplete');
  });
  it('rejects forged object data and unsafe metadata', async () => {
    await complete(e);
    const data = e.fs.snapshot();
    const object = Object.keys(data.entries).find((p) =>
      /objects\/[a-f0-9]{2}\/[a-f0-9]{38}$/.test(p),
    )!;
    data.entries[object].data[5] ^= 1;
    await expect(
      verifySnapshot(data, { full_name: 'Test Student', department: 'Engineering' }),
    ).rejects.toThrow();
    const unsafe = e.fs.snapshot();
    unsafe.entries[e.dir + '/.git/shallow'] = { kind: 'file', data: [] };
    await expect(
      verifySnapshot(unsafe, { full_name: 'Test Student', department: 'Engineering' }),
    ).rejects.toThrow('metadata');
  });
  it('supports staged deletion and preserves untracked files on switch', async () => {
    await complete(e);
    await run(e, 'rm notes.txt');
    await run(e, 'git add notes.txt');
    expect((await e.inspect()).status.find(([p]) => p === 'notes.txt')?.[3]).toBe(0);
    await run(e, 'git commit -m "Remove session notes"');
    expect((await e.inspect()).commits[0].files['notes.txt']).toBeUndefined();
    await e.write('untracked.txt', 'keep me');
    await run(e, 'git switch feature/skills');
    expect(await e.read('untracked.txt')).toBe('keep me');
  });
});
