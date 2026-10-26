import { inspectVerifiedSnapshot } from '../submissions/verify.ts';
import {
  assertDefinition,
  gradeObjective,
  outcomesFor,
  sanitizeAnswers,
  type Definition,
} from './model.ts';
import type { Snapshot } from '../filesystem/VirtualFS.ts';
import type { StudentIdentity } from '../assignments/assignment.ts';
export async function verifyAssessment(
  d: Definition,
  payload: {
    snapshot: Snapshot;
    answers: unknown;
    events: unknown;
    cwd?: string;
    config?: Record<string, string>;
  },
  identity: StudentIdentity,
  keys: Record<string, { correctAnswers: string[] }>,
) {
  assertDefinition(d);
  const answers = sanitizeAnswers(d, payload.answers);
  const { engine, view } = await inspectVerifiedSnapshot(payload.snapshot, d.projectName);
  if (!Array.isArray(payload.events) || payload.events.length > 1000)
    throw new Error('Invalid activity');
  const events = payload.events.map((e, i) => {
    if (
      !e ||
      typeof e.command !== 'string' ||
      e.command.length > 2000 ||
      typeof e.output !== 'string' ||
      e.output.length > 20000 ||
      typeof e.success !== 'boolean' ||
      typeof e.branch !== 'string' ||
      e.branch.length > 150 ||
      typeof e.head !== 'string' ||
      e.head.length > 40 ||
      !Number.isFinite(Date.parse(e.timestamp))
    )
      throw new Error('Invalid activity event');
    return {
      sequence: i + 1,
      timestamp: e.timestamp,
      command: e.command,
      success: e.success,
      branch: e.branch,
      head: e.head,
      output: e.output,
    };
  });
  const working = Object.fromEntries(
    await Promise.all(
      Object.keys(engine.fs.entries)
        .filter(
          (p) =>
            p.startsWith(engine.dir + '/') &&
            !p.includes('/.git/') &&
            p.endsWith('.txt') &&
            engine.fs.entries[p].kind === 'file',
        )
        .map(async (p) => [p.slice(engine.dir.length + 1), await engine.read(p)]),
    ),
  );
  const outcomes = outcomesFor(d, view, identity, working);
  // Never let a forged Git index award a clean-working-tree condition.
  if (view.initialized) {
    const head = await engine.head();
    const files = head ? await engine.files(head) : {};
    if (
      JSON.stringify(Object.entries(files).sort()) !==
      JSON.stringify(Object.entries(working).sort())
    )
      for (const t of d.sections.flatMap((s) => s.tasks))
        if (
          t.rules.some(
            (r) =>
              (r.type === 'repository' && r.clean) ||
              (r.type === 'legacy' && r.outcomeId === 'clean'),
          )
        ) {
          const o = outcomes.find((o) => o.id === t.id);
          if (o) o.passed = false;
        }
  }
  const grades = gradeObjective(d, answers, keys);
  const config = Object.fromEntries(
    Object.entries(payload.config || {}).filter(
      ([key, value]) =>
        ['user.name', 'user.email', 'init.defaultBranch'].includes(key) &&
        typeof value === 'string' &&
        value.length <= 150,
    ),
  );
  for (const [key, value] of Object.entries(view.config)) if (value) config[key] = value;
  return {
    payload: {
      snapshot: payload.snapshot,
      answers,
      events,
      cwd:
        typeof payload.cwd === 'string' && engine.fs.entries[payload.cwd]?.kind === 'dir'
          ? payload.cwd
          : engine.dir,
      config,
    },
    outcomes,
    grades,
    practicalScore: outcomes.filter((o) => o.passed).reduce((s, o) => s + o.points, 0),
    objectiveScore: grades.reduce((s, g) => s + g.points, 0),
  };
}
