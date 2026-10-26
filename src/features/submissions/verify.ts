import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS.ts';
import { GitEngine } from '../git-engine/engine.ts';
import {
  validateRepository,
  practicalScore,
  questions,
  reflectionQuestions,
  type StudentIdentity,
} from '../assignments/assignment.ts';
// Hash compressed loose objects independently before asking the Git library to traverse them.
// Packed objects, alternates, grafts, shallow history and executable/symlink trees are excluded.
export async function inspectVerifiedSnapshot(snapshot: Snapshot, projectName = 'IEEE-Git-Task') {
  if (!/^[\w-]{1,60}$/.test(projectName)) throw new Error('Invalid project name');
  const fs = VirtualFS.restore(snapshot);
  const project = '/' + projectName + '/';
  const root = project + '.git/';
  let objects = 0;
  for (const [path, e] of Object.entries(fs.entries)) {
    if (e.kind === 'dir') continue;
    if (!path.startsWith(project)) throw new Error('Unexpected files outside assignment project');
    if (!path.startsWith(root)) {
      if (!path.endsWith('.txt')) throw new Error('Only text files are allowed');
      continue;
    }
    const relative = path.slice(root.length);
    if (relative.startsWith('objects/')) {
      if (!/^objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/.test(relative))
        throw new Error('Only loose Git objects are accepted');
      const stream = new Blob([new Uint8Array(e.data)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate'));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.length;
        if (size > 256_000) {
          await reader.cancel();
          throw new Error('Decompressed object too large');
        }
        chunks.push(result.value);
      }
      const object = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        object.set(chunk, offset);
        offset += chunk.length;
      }
      const zero = object.indexOf(0);
      const header = new TextDecoder().decode(object.slice(0, zero));
      if (
        zero < 0 ||
        !/^(commit|tree|blob) \d+$/.test(header) ||
        Number(header.split(' ')[1]) !== object.length - zero - 1
      )
        throw new Error('Malformed Git object');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', object)))
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== relative.slice(8).replace('/', ''))
        throw new Error('Git object hash mismatch');
      if (header.startsWith('tree ')) {
        const body = object.slice(zero + 1);
        let i = 0;
        while (i < body.length) {
          const space = body.indexOf(32, i);
          const end = body.indexOf(0, space);
          if (space < 0 || end < 0 || end + 21 > body.length) throw new Error('Malformed tree');
          const mode = new TextDecoder().decode(body.slice(i, space));
          const name = new TextDecoder().decode(body.slice(space + 1, end));
          if (
            !['100644', '40000', '040000'].includes(mode) ||
            !name ||
            name === '.' ||
            name === '..' ||
            name === '.git' ||
            /[\/\\\x00-\x1f]/.test(name)
          )
            throw new Error('Unsafe tree entry');
          i = end + 21;
        }
      }
      if (++objects > 700) throw new Error('Object limit exceeded');
    } else if (
      !['HEAD', 'config', 'index'].includes(relative) &&
      !/^refs\/heads\/[\w/-]+$/.test(relative)
    )
      throw new Error('Unsupported repository metadata');
  }
  const config = fs.entries[root + 'config']
    ? ((await fs.promises.readFile(root + 'config', 'utf8')) as string)
    : '';
  if (
    /\b(include|includeIf|alternates|worktree|hooksPath|remote|replace|objectFormat)\b/i.test(
      config,
    )
  )
    throw new Error('Unsafe repository configuration');
  const engine = new GitEngine(fs, '/' + projectName);
  if(fs.entries[root+'HEAD']){const head=await fs.promises.readFile(root+'HEAD','utf8') as string;if(!/^ref: refs\/heads\/[\w./-]+\s*$/.test(head))throw new Error('Detached or malformed HEAD is outside the supported course grammar');}
  const view = await engine.inspect();
  return { engine, view };
}
export async function verifySnapshot(snapshot: Snapshot, identity: StudentIdentity) {
  const { engine, view } = await inspectVerifiedSnapshot(snapshot);
  const fs = engine.fs,
    root = engine.dir + '/.git/';
  if (view.branch !== 'main' || !view.initialized) throw new Error('Finish on main');
  // The supplied index is recovery data, not proof that working files match HEAD.
  const headFiles = await engine.files(view.branches.main || '');
  const workingFiles = Object.entries(fs.entries).filter(
    ([path, e]) => e.kind === 'file' && !path.startsWith(root),
  );
  if (
    workingFiles.length !== Object.keys(headFiles).length ||
    workingFiles.some(
      ([path, e]) =>
        new TextDecoder().decode(new Uint8Array(e.data)) !==
        headFiles[path.slice('/IEEE-Git-Task/'.length)],
    )
  )
    throw new Error('Working files must exactly match the committed main tree');
  const results = validateRepository(view, identity);
  if (results.some((r) => !r.bonus && !r.passed))
    throw new Error('Required practical repository outcomes are incomplete');
  return { view, results, score: practicalScore(results) };
}
export function validateAnswers(answers: unknown): Record<string, string> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    throw new Error('Invalid answers');
  const values = answers as Record<string, unknown>;
  const allowed = new Set([...questions, ...reflectionQuestions].map((q) => q.id));
  if (Object.keys(values).some((id) => !allowed.has(id))) throw new Error('Unknown question');
  for (const q of [...questions, ...reflectionQuestions.slice(0, 2)])
    if (typeof values[q.id] !== 'string' || !(values[q.id] as string).trim())
      throw new Error('All required written answers and reflections must be completed');
  for (const value of Object.values(values))
    if (typeof value !== 'string' || value.length > 8000) throw new Error('Invalid answer length');
  return values as Record<string, string>;
}
