import { assertDefinition, sumPoints, type Definition } from './model';
import { requirementCatalog } from './requirements';

// Explicit proposed instructor weights, never a backfill of published versions.
const weights: Record<string, number[]> = {
  repo: [2, 1, 1, 1],
  files: [4, 3, 3],
  separate: [2, 1, 1, 1, 1, 1, 2, 1],
  goals: [2, 2, 4, 2],
  feature: [2, 4, 4],
  isolation: [3, 3, 4],
  merged: [2, 2, 5, 6],
  clean: [1, 1, 3],
  bonus: [2, 5, 3],
};
export function prepareFundamentalsScoring(source: Definition): Definition {
  const draft = structuredClone(source);
  const tasks = draft.sections.flatMap((s) => s.tasks);
  if (
    tasks.length !== Object.keys(weights).length ||
    new Set(tasks.map((t) => t.id)).size !== tasks.length
  )
    throw new Error(
      'This proposal needs the original nine Git Fundamentals tasks. Configure changed tasks individually.',
    );
  draft.gradingPolicy = 'requirements-v1';
  draft.requireComplete = false;
  draft.gateTheory = false;
  draft.instructions =
    'Work in Files and Terminal. Each scored requirement earns its own points. You can move between tasks, answer questions and submit unfinished work. Only earned points count; written responses follow the instructor review policy.';
  for (const task of tasks) {
    if (
      task.rules.length !== 1 ||
      task.rules[0].type !== 'legacy' ||
      task.rules[0].outcomeId !== task.id
    )
      throw new Error(
        'Task rules differ from Git Fundamentals. Review requirement weights individually.',
      );
    const modern = task.rules[0].revision === 2;
    const points =
      modern && task.id === 'files'
        ? [1, 3, 1, 2, 1, 2]
        : modern && task.id === 'separate'
          ? [2, 1, 1, 1, 1, 1, 1, 1, 1]
          : modern && task.id === 'goals'
            ? [3, 7]
            : weights[task.id];
    const checks = requirementCatalog(task);
    if (!points || checks.length !== points.length || sumPoints(points) !== task.points)
      throw new Error(
        'Task requirements or maximum points have changed. Review weights individually.',
      );
    task.requirementWeights = Object.fromEntries(checks.map((check, i) => [check.id, points[i]]));
  }
  assertDefinition(draft);
  return draft;
}
