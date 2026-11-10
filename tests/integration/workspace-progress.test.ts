import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { describe, it, expect } from 'vitest';
import { GitEngine } from '../../src/features/git-engine/engine';
import {
  blankDefinition,
  type Definition,
} from '../../src/features/assessments/model';
import { requirementProgress } from '../../src/features/assessments/requirements';
import { SerialQueue } from '../../src/services/SerialQueue';
const identity = { full_name: 'mazen', department: 'Engineering' };
const files = (e: GitEngine) =>
  Object.fromEntries(
    Object.entries(e.fs.entries)
      .filter(
        ([p, x]) =>
          p.startsWith(e.dir + '/') &&
          !p.includes('/.git/') &&
          p.endsWith('.txt') &&
          x.kind === 'file',
      )
      .map(([p, x]) => [
        p.slice(e.dir.length + 1),
        new TextDecoder().decode(new Uint8Array(x.data)),
      ]),
  );
async function cmd(e: GitEngine, s: string) {
  const r = await e.execute(s);
  expect(r.success, r.output).toBe(true);
}
const check = (p: ReturnType<typeof requirementProgress>, label: string) =>
  p.flatMap((x) => x.requirements).find((r) => r.label === label)!;
describe('workspace requirements from real Git state', () => {
  it('uses arbitrary published paths and distinguishes draft, committed and dirty state', async () => {
    const d: Definition = {
      ...blankDefinition('assignment'),
      projectName: 'Custom-Git',
      sections: [
        {
          id: 'custom',
          title: 'Custom files',
          description: '',
          steps: [],
          tasks: [
            {
              id: 'custom-task',
              title: 'Save summary',
              instructions: 'Write a summary.',
              points: 3,
              bonus: false,
              rules: [
                { type: 'repository', branch: 'main', clean: true },
                {
                  type: 'file',
                  path: 'summary.txt',
                  ref: 'main',
                  match: 'contains',
                  value: '{{name}}',
                },
              ],
            },
          ],
        },
      ],
    };
    const e = new GitEngine(undefined, '/Custom-Git');
    for (const c of ['mkdir Custom-Git', 'cd Custom-Git', 'git init']) await cmd(e, c);
    await e.write('summary.txt', 'mazen');
    let p = requirementProgress(d, await e.inspect(), identity, files(e));
    expect(check(p, 'summary.txt created in this project').passed).toBe(true);
    expect(p[0].passed).toBe(false);
    expect(check(p, 'summary.txt committed on main').passed).toBe(false);
    expect(
      requirementProgress(
        d,
        await e.inspect(),
        { full_name: '', department: '' },
        files(e),
      )[0].requirements.some((c) => c.status === 'unverifiable'),
    ).toBe(true);
    expect(
      requirementProgress(d, await e.inspect(), identity, files(e), true)[0].requirements.every(
        (c) => c.status === 'checking',
      ),
    ).toBe(true);
    for (const c of [
      'git config user.name "mazen"',
      'git config user.email "student@example.com"',
      'git add summary.txt',
      'git commit -m "Save summary"',
    ])
      await cmd(e, c);
    expect(requirementProgress(d, await e.inspect(), identity, files(e))[0].passed).toBe(true);
    const unavailable = requirementProgress(
      d,
      await e.inspect(),
      identity,
      files(e),
      false,
      'Inspection failed',
    )[0];
    expect(unavailable.passed).toBe(false);
    expect(unavailable.requirements.every((r) => r.status === 'unverifiable')).toBe(true);
    expect(
      requirementProgress(d, await e.inspect(), { full_name: '', department: '' }, files(e))[0]
        .passed,
    ).toBe(false);
    await e.write('summary.txt', 'changed');
    p = requirementProgress(d, await e.inspect(), identity, files(e));
    expect(check(p, 'Working files match the saved Git state').passed).toBe(false);
    expect(p[0].passed).toBe(false);
  });
  it('does not count files outside the project or pretend nano succeeded', async () => {
    const e = new GitEngine();
    await cmd(e, 'touch about.txt');
    expect(
      check(
        requirementProgress(taskOneDefinition(), await e.inspect(), identity, files(e)),
        'Create about.txt',
      ).passed,
    ).toBe(false);
    const result = await e.execute('nano about.txt');
    expect(result.success).toBe(false);
    expect(result.output).toContain('open it in Files');
    expect(await e.read('/about.txt')).toBe('');
  });
  it('serializes rapid editor, staging and commit operations without losing staged snapshots', async () => {
    const q = new SerialQueue(),
      e = new GitEngine();
    for (const c of [
      'mkdir IEEE-Git-Task',
      'cd IEEE-Git-Task',
      'git init',
      'git config user.name "mazen"',
      'git config user.email "student@example.com"',
    ])
      await cmd(e, c);
    await Promise.all([
      q.run(() => e.write('about.txt', 'staged version')),
      q.run(() => e.execute('git add about.txt')),
      q.run(() => e.write('about.txt', 'new working version')),
      q.run(() => e.execute('git commit -m "Save staged version"')),
    ]);
    const view = await e.inspect();
    expect(view.commits[0].files['about.txt']).toBe('staged version');
    expect(await e.read('about.txt')).toBe('new working version');
    expect(view.status[0][1]).not.toBe(view.status[0][2]);
    await expect(
      q.run(async () => {
        throw Error('failure');
      }),
    ).rejects.toThrow('failure');
    await expect(q.run(async () => 42)).resolves.toBe(42);
  });
});
