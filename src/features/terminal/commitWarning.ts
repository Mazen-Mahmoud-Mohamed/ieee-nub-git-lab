import { gitHistory } from '../assessments/gitHistory';
import type { RepoView } from '../git-engine/engine';
import type { Definition } from '../assessments/model';
export function introductoryCommitWarning(definition: Definition, view: RepoView): string {
  if (
    !definition.sections.some((s) =>
      s.tasks.some((t) => t.rules.some((r) => r.type === 'legacy' && r.outcomeId === 'separate')),
    )
  )
    return '';
  const staged = view.status.filter(([, head, , index]) => head !== index);
  const previous = gitHistory(view.commits).ancestors(view.branches[view.branch] || '');
  const introductions = staged.filter(
    ([file, head, , index]) =>
      head === 0 &&
      index !== 0 &&
      !previous.some((c) => file in c.files) &&
      ['about.txt', 'goals.txt', 'notes.txt'].includes(file),
  );
  if (!introductions.length || staged.length < 2) return '';
  return `History warning: ${introductions.map(([file]) => file).join(', ')} would be introduced alongside other staged changes (${staged.map(([file]) => file).join(', ')}). Starting files need separate focused commits. Later commits cannot split an introductory commit. Review git status and your staging before committing. This valid Git operation is still allowed, but may lose introductory-history points.`;
}
