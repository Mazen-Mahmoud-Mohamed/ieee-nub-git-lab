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
  await run(e, 'git add about.txt');
  await run(e, 'git commit -m "Save first version"');
  await e.write('about.txt', 'other version');
  expect((await e.inspect()).status[0]).toEqual(['about.txt', 1, 1, 1]);
  await run(e, 'git add about.txt');
  const result = await e.execute('git commit -m "Save other version"');
  expect(result.success).toBe(true);
  expect((await e.inspect()).commits[0].files['about.txt']).toBe('other version');
});
