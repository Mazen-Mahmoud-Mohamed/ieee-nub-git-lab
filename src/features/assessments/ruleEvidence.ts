import type { StudentIdentity } from '../assignments/assignment.ts';
import type { RepoView } from '../git-engine/engine.ts';
import { gitHistory } from './gitHistory.ts';
import { evaluateCriterion } from './independentCriteria.ts';
import type { Rule } from './model.ts';

export function ruleEvidence(view: RepoView, identity: StudentIdentity, working: Record<string, string>) {
  const commits = new Map(view.commits.map((c) => [c.oid, c]));
  const history = gitHistory(view.commits);
  const ancestors = (ref: string) => history.ancestors(view.branches[ref] || '');
  const files = (ref = 'main') =>
    ref === 'working' ? working : commits.get(view.branches[ref])?.files || {};
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const reaches = history.reaches;
  const passes = (r: Rule): boolean => {
    switch (r.type) {
      case 'criterion':
        return evaluateCriterion(r.outcomeId || '', view, identity, working).passed;
      case 'repository':
        return (
          view.initialized &&
          (!r.branch || view.branch === r.branch) &&
          (!r.clean || view.status.every(([, h, w, s]) => h === w && h === s))
        );
      case 'branch':
        return !!view.branches[r.branch || ''];
      case 'file': {
        const text = files(r.ref)[r.path || ''];
        if (text === undefined) return false;
        const expected = (r.value || '')
          .replaceAll('{{name}}', identity.full_name)
          .replaceAll('{{department}}', identity.department);
        return r.match === 'exact'
          ? norm(text) === norm(expected)
          : r.match === 'contains'
            ? norm(text).includes(norm(expected))
            : r.match === 'lines'
              ? text.split('\n').filter((s) => s.trim()).length >= (r.min || 1)
              : true;
      }
      case 'commits':
        return ancestors(r.ref || 'main').length >= (r.min || 1);
      case 'message':
        return ancestors(r.ref || 'main').some((c) => c.message.includes(r.value || ''));
      case 'merged': {
        const source = view.branches[r.source || ''];
        const line = ancestors(r.target || 'main');
        return (
          !!source &&
          line.some((c) => c.oid === source) &&
          (!r.mergeCommit ||
            line.some(
              (c) =>
                c.parents.length > 1 &&
                c.parents.some(
                  (p) =>
                    reaches(p, source) &&
                    c.parents.some(
                      (other) => !reaches(other, source) && history.diverged(p, other),
                    ),
                ),
            ))
        );
      }
      case 'isolation': {
        const birth = history.introduction(view.branches[r.source || ''] || '', r.path!);
        return !!birth && birth.parents.length > 0;
      }
    }
  };
  return passes;
}
