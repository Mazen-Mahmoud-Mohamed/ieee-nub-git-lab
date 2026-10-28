import { firstAssessment, type Definition } from '../../src/features/assessments/model';
import { requirementCatalog } from '../../src/features/assessments/requirements';
// Explicit instructor choices for release tests, never automatically assigned by the app.
export function weightedFundamentalsFixture(source: Definition = firstAssessment) {
  const d = structuredClone(source);
  d.gradingPolicy = 'requirements-v1';
  d.requireComplete = false;
  d.gateTheory = false;
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
  for (const task of d.sections.flatMap((s) => s.tasks)) {
    const modern = task.rules.some((r) => r.revision === 2);
    const points =
      modern && task.id === 'files'
        ? [1, 3, 1, 2, 1, 2]
        : modern && task.id === 'separate'
          ? [2, 1, 1, 1, 1, 1, 1, 1, 1]
          : modern && task.id === 'goals'
            ? [3, 7]
            : weights[task.id];
    const checks = requirementCatalog(task);
    if (checks.length !== points?.length) throw Error('Incomplete test rubric: ' + task.title);
    task.requirementWeights = Object.fromEntries(checks.map((c, i) => [c.id, points[i]]));
  }
  return d;
}
