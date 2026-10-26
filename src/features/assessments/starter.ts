import { GitEngine } from '../git-engine/engine.ts';
import type { Definition } from './model.ts';
import { VirtualFS } from '../filesystem/VirtualFS.ts';
export async function createStarter(d: Definition) {
  if (d.starter.snapshot) {
    const e = new GitEngine(VirtualFS.restore(d.starter.snapshot), '/' + d.projectName);
    await e.inspect();
    e.cwd = e.dir;
    return e;
  }
  const engine = new GitEngine(undefined, '/' + d.projectName);
  if (!Object.keys(d.starter.files).length && !d.starter.initialize) return engine;
  await engine.fs.promises.mkdir(engine.dir);
  engine.cwd = engine.dir;
  for (const [p, text] of Object.entries(d.starter.files)) {
    const segments = p.split('/');
    let prefix = engine.dir;
    for (const folder of segments.slice(0, -1)) {
      prefix += '/' + folder;
      if (!engine.fs.entries[prefix]) await engine.fs.promises.mkdir(prefix);
    }
    await engine.write(p, text);
  }
  if (d.starter.initialize) {
    await engine.execute('git init');
    if (d.starter.commit && Object.keys(d.starter.files).length) {
      await engine.execute('git config user.name "Course starter"');
      await engine.execute('git config user.email starter@git-lab.invalid');
      await engine.execute('git add -A');
      const result = await engine.execute('git commit -m "Add course starter files"');
      if (!result.success) throw new Error(result.output);
    }
  }
  engine.events = [];
  return engine;
}
