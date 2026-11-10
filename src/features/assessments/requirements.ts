import { evaluateCriterion } from './independentCriteria.ts';
import type { RepoView } from '../git-engine/engine.ts';
import {
  type RequirementCheck,
  type StudentIdentity,
} from '../assignments/assignment.ts';
import type { Definition, Task } from './model.ts';
import { ruleEvidence } from './ruleEvidence.ts';
export type RequirementState = 'completed' | 'incomplete' | 'checking' | 'unverifiable';
export type Requirement = RequirementCheck & {
  status: RequirementState;
  points?: number;
  earned?: number;
};
export type TaskProgress = {
  task: Task;
  passed: boolean;
  earned: number;
  requirements: Requirement[];
  next: string;
};
export function requirementProgress(
  d: Definition,
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string>,
  checking = false,
  unavailable = '',
): TaskProgress[] {
  const passes = ruleEvidence(view, identity, working);
  const at = (ref = 'main') =>
    ref === 'working'
      ? working
      : view.commits.find((c) => c.oid === view.branches[ref])?.files || {};
  const check = (
    id: string,
    label: string,
    passed: boolean | null,
    hint: string,
    preparation = false,
  ): RequirementCheck => ({ id, label, passed, hint, preparation });
  return d.sections
    .flatMap((s) => s.tasks)
    .map((task) => {
      const checks = task.rules.flatMap((r, i): RequirementCheck[] => {
        const prefix = 'rule-' + i + '-';
        let rows: RequirementCheck[];
        switch (r.type) {
          case 'criterion': {
            const result = evaluateCriterion(r.outcomeId || '', view, identity, working);
            rows = [
              {
                ...check('criterion', task.title, result.passed, task.instructions),
                detected: result.evidence,
                expected: task.title,
              },
            ];
            break;
          }
          case 'repository':
            rows = [
              check(
                'initialized',
                'Git repository initialized',
                view.initialized,
                'Initialize this assessment project as a Git repository.',
              ),
            ];
            if (r.branch)
              rows.push(
                check(
                  'branch',
                  'Current branch is ' + r.branch,
                  view.initialized && view.branch === r.branch,
                  'Switch to the required branch.',
                ),
              );
            if (r.clean)
              rows.push(
                check(
                  'clean',
                  'Working files match the saved Git state',
                  view.initialized && view.status.every(([, h, w, s]) => h === w && h === s),
                  'Check files that still need to be committed.',
                ),
              );
            break;
          case 'file': {
            const ref = r.ref || 'main',
              file = r.path || '',
              target = at(ref),
              exists = target[file] !== undefined;
            rows = [];
            if (ref !== 'working')
              rows.push(
                check(
                  'created',
                  file + ' created in this project',
                  working[file] !== undefined || exists,
                  'Create the text file in this project folder.',
                  true,
                ),
              );
            rows.push(
              check(
                'exists',
                file + (ref === 'working' ? ' exists in working files' : ' committed on ' + ref),
                exists,
                ref === 'working'
                  ? 'Create the file in this project.'
                  : 'Save the file in the required branch history.',
              ),
            );
            if (r.match && r.match !== 'exists') {
              const unknownIdentity =
                ((r.value || '').includes('{{name}}') && !identity.full_name.trim()) ||
                ((r.value || '').includes('{{department}}') && !identity.department.trim());
              if (ref !== 'working')
                rows.push(
                  check(
                    'draft',
                    file + ' required content written',
                    unknownIdentity ? null : passes({ ...r, ref: 'working' }) || passes(r),
                    'Edit the file using the built-in Text Editor.',
                    true,
                  ),
                );
              rows.push(
                check(
                  'content',
                  file +
                    (r.match === 'lines'
                      ? ' has at least ' + (r.min || 1) + ' non-empty lines'
                      : ' matches the required ' + (r.match === 'exact' ? 'content' : 'text')) +
                    (ref === 'working' ? ' in working files' : ' on ' + ref),
                  unknownIdentity ? null : passes(r),
                  unknownIdentity
                    ? 'Complete your profile or practice identity to verify this content.'
                    : 'Compare the file with this task’s content requirements.',
                ),
              );
            }
            break;
          }
          case 'branch':
            rows = [
              check(
                'exists',
                r.branch + ' has committed branch history',
                passes(r),
                'Create the required branch from saved history.',
              ),
            ];
            break;
          case 'commits':
            rows = [
              check(
                'count',
                'At least ' + (r.min || 1) + ' commits in ' + (r.ref || 'main') + ' history',
                passes(r),
                'Save meaningful changes in the required branch history.',
              ),
            ];
            break;
          case 'message':
            rows = [
              check(
                'message',
                'Required commit message appears in ' + (r.ref || 'main'),
                passes(r),
                'Check the task’s requested commit message.',
              ),
            ];
            break;
          case 'merged':
            rows = [
              check(
                'source',
                'Source branch ' + r.source + ' has committed history',
                !!view.branches[r.source || ''],
                'Save work in the source branch.',
              ),
              check(
                'target',
                'Target branch ' + (r.target || 'main') + ' has committed history',
                !!view.branches[r.target || 'main'],
                'The receiving branch needs committed history.',
              ),
              check(
                'merged',
                r.source +
                  ' history included in ' +
                  (r.target || 'main') +
                  (r.mergeCommit ? ' through a merge commit' : ''),
                passes(r),
                'Join the source history into the receiving branch as required.',
              ),
            ];
            break;
          case 'isolation':
            rows = [
              check(
                'introduction',
                r.path + ' introduced by a new commit in ' + r.source,
                passes(r),
                'Introduce the file after its parent history on the intended branch.',
              ),
            ];
            break;
          default:
            rows = [
              check(
                'unsupported',
                'Published requirement is supported',
                null,
                'This rule could not be verified. Contact the instructor.',
              ),
            ];
        }
        return rows.map((row) => ({ ...row, id: prefix + row.id }));
      });
      const requirements = checks.map(
        (c) =>
          ({
            ...c,
            preparation: c.preparation || task.points === 0,
            points:
              task.points > 0 && !c.preparation
                ? task.requirementWeights?.[task.id + ':' + c.id] || 0
                : undefined,
            earned:
              task.points > 0 &&
              !c.preparation &&
              !unavailable &&
              c.passed === true
                ? task.requirementWeights?.[task.id + ':' + c.id] || 0
                : 0,
            id: task.id + ':' + c.id,
            status: unavailable
              ? 'unverifiable'
              : checking
                ? 'checking'
                : c.passed === null
                  ? 'unverifiable'
                  : c.passed
                    ? 'completed'
                    : 'incomplete',
          }) as Requirement,
      );
      const passed = !unavailable &&
        requirements.filter((c) => task.points === 0 || !c.preparation).every((c) => c.passed === true);
      return {
        task,
        earned: Math.round(requirements.reduce((sum, c) => sum + (c.earned || 0), 0) * 100) / 100,
        passed,
        requirements,
        next:
          unavailable ||
          requirements.find((c) => c.passed !== true)?.hint ||
          'This scored task is complete. Continue to the next task.',
      };
    });
}

// Stable check IDs are part of each published document's scoring contract.
export function requirementCatalog(task: Task) {
  if (task.points === 0) return [];
  const d = { gradingPolicy: 'independent-v2', sections: [{ tasks: [task] }] } as Definition;
  return requirementProgress(
    d,
    { initialized: false, branch: 'main', branches: {}, commits: [], status: [], config: {} },
    { full_name: '', department: '' },
    {},
  )[0].requirements.filter((c) => !c.preparation);
}
