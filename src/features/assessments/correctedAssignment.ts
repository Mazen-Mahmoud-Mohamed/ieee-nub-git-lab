import { firstAssessment, type Definition, assertDefinition, totals } from './model.ts';
// A new published version, never a rewrite of version 1 or an active attempt.
export function correctedAssignment(source: Definition = firstAssessment): Definition {
  const descriptions: Record<string, string> = {
    repo: 'Initialize this project on main and configure your Git name and email.',
    files: 'Write the three required files using the editor; use your profile name and department.',
    separate:
      'Commit each starting file separately on main, in any order, with a message of at least two words; use “Add personal information” for about.txt.',
    goals:
      'Keep your initial goals, add two new goals, then stage and commit the updated tracked file on main with a message of at least two words.',
    feature: 'Commit the three required skills on feature/skills.',
    isolation:
      'Introduce skills.txt in the feature history after an existing parent commit, using a message of at least two words.',
    merged: 'Bring the committed feature/skills history and required skills into main.',
    clean: 'Finish on main with no staged or unstaged changes.',
    bonus: 'Join separate hobbies and completion-note histories through a merge commit.',
  };
  const titles: Record<string, string> = {
    repo: 'Initialize Git and configure identity',
    files: 'Write the required project files',
    separate: 'Commit each starting file separately',
    goals: 'Update and commit your goals',
    feature: 'Commit skills on the feature branch',
    isolation: 'Verify branch isolation',
    merged: 'Merge the skills into main',
    clean: 'Finish with a clean main branch',
    bonus: 'Optional: merge divergent hobbies work',
  };
  const d = structuredClone(source);
  d.gateTheory = false;
  d.instructions =
    'Use the editor for text changes and the terminal for Git. Choose any task to inspect its requirements. Questions are accessible throughout; required work is checked before submission.';
  d.sections = d.sections.map((s) => ({
    ...s,
    steps: s.steps.map((step) =>
      step.replace(
        'Introduce goals.txt and notes.txt in separate commits with meaningful messages.',
        'Introduce each starting file in its own focused commit with a descriptive message. Their order does not matter.',
      ),
    ),
    tasks: s.tasks.map((t) => ({
      ...t,
      title: titles[t.id] || t.title,
      instructions: descriptions[t.id] || t.instructions,
      rules: t.rules.map((r) => (r.type === 'legacy' ? { ...r, revision: 2 } : r)),
    })),
  }));
  assertDefinition(d);
  const p = totals(d);
  if (p.practical !== 75 || p.theory !== 25 || p.bonus !== 10)
    throw Error('Assignment 01 totals must remain 100 + 10 bonus');
  return d;
}
