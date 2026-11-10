import type { RepoView, CommitView } from '../git-engine/engine.ts';
import type { StudentIdentity } from '../assignments/assignment.ts';
import { gitHistory } from './gitHistory.ts';
export const criterionIds = [
  'initialized',
  'identity-name',
  'identity-email',
  'main-branch',
  'about-exists',
  'about-content',
  'goals-exists',
  'goals-content',
  'notes-exists',
  'notes-content',
  'about-focused',
  'about-message',
  'goals-focused',
  'goals-message',
  'notes-focused',
  'notes-message',
  'goals-expanded',
  'four-commits',
  'skills-branch',
  'skills-content',
  'skills-commit',
  'skills-isolation',
  'skills-merged',
  'main-skills',
  'clean',
] as const;
export type CriterionId = (typeof criterionIds)[number];
const norm = (s = '') => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const lines = (s = '') => s.split('\n').map(norm);
export function evaluateCriterion(
  id: string,
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string>,
) {
  const h = gitHistory(view.commits);
  const reachable = new Map(
    Object.values(view.branches)
      .flatMap((t) => h.ancestors(t))
      .map((c) => [c.oid, c]),
  );
  const commits = [...reachable.values()];
  const feature = h.ancestors(view.branches['feature/skills'] || '');
  const main = h.byId.get(view.branches.main);
  const meaningful = (c: CommitView) =>
    c.message.trim().length >= 8 && c.message.trim().split(/\s+/).length >= 2;
  const focused = (c: CommitView, file: string) =>
    c.parents.length <= 1 &&
    file in c.files &&
    h.changedPaths(c).length === 1 &&
    h.changedPaths(c)[0] === file;
  const goals = (s = '') =>
    lines(s)
      .filter((x) => /^\d+[.)]\s*\S/.test(x))
      .map((x) => x.replace(/^\d+[.)]\s*/, ''));
  const baseGoals = ['learn git', 'understand version control', 'work on team projects'];
  const has = (s: string | undefined, expected: string[]) =>
    expected.every((x) => lines(s).includes(norm(x)));
  const skills = (s: string | undefined) =>
    has(s, ['Problem Solving', 'Communication', 'Teamwork']);
  let evidence: string | undefined;
  let passed = false;
  switch (id) {
    case 'initialized':
      passed = view.initialized;
      break;
    case 'identity-name':
      passed = !!view.config['user.name']?.trim();
      break;
    case 'identity-email':
      passed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.config['user.email'] || '');
      break;
    case 'main-branch':
      passed = view.initialized && (view.branch === 'main' || !!view.branches.main);
      break;
    case 'about-exists':
    case 'goals-exists':
    case 'notes-exists':
      passed = Object.hasOwn(working, id.split('-')[0] + '.txt');
      break;
    case 'about-content':
      passed =
        !!identity.full_name.trim() &&
        !!identity.department.trim() &&
        has(working['about.txt'], [
          `Name: ${identity.full_name}`,
          'University: Nahda University',
          `Department: ${identity.department}`,
        ]);
      break;
    case 'goals-content':
      passed =
        lines(working['goals.txt']).includes('my goals:') &&
        baseGoals.every((x) => goals(working['goals.txt']).includes(x));
      break;
    case 'notes-content':
      passed = has(working['notes.txt'], ['Git Course - Session 1', 'IEEE NUB Student Branch']);
      break;
    case 'about-focused':
    case 'goals-focused':
    case 'notes-focused':
      evidence = commits.find((c) => focused(c, id.split('-')[0] + '.txt'))?.oid;
      break;
    case 'about-message':
      evidence = commits.find(
        (c) =>
          h.changedPaths(c).includes('about.txt') &&
          c.message.trim() === 'Add personal information',
      )?.oid;
      break;
    case 'goals-message':
    case 'notes-message':
      evidence = commits.find(
        (c) => h.changedPaths(c).includes(id.split('-')[0] + '.txt') && meaningful(c),
      )?.oid;
      break;
    case 'goals-expanded':
      evidence = commits.find((c) => {
        const previous = h.byId.get(c.parents[0])?.files['goals.txt'];
        if (previous === undefined) return false;
        const before = new Set(goals(previous)),
          after = new Set(goals(c.files['goals.txt']));
        return (
          baseGoals.every((x) => before.has(x) && after.has(x)) &&
          [...before].every((x) => after.has(x)) &&
          [...after].filter((x) => !before.has(x)).length >= 2
        );
      })?.oid;
      break;
    case 'four-commits':
      passed = commits.length >= 4;
      break;
    case 'skills-branch':
      passed = !!view.branches['feature/skills'];
      break;
    case 'skills-content':
      passed =
        skills(working['skills.txt']) ||
        skills(h.byId.get(view.branches['feature/skills'])?.files['skills.txt']);
      break;
    case 'skills-commit':
      evidence = commits.find(
        (c) => skills(c.files['skills.txt']) && h.changedPaths(c).includes('skills.txt'),
      )?.oid;
      break;
    case 'skills-isolation':
      evidence = feature.find(
        (c) =>
          c.parents.length === 1 &&
          h.byId.has(c.parents[0]) &&
          !('skills.txt' in h.byId.get(c.parents[0])!.files) &&
          'skills.txt' in c.files,
      )?.oid;
      break;
    case 'skills-merged':
      passed =
        !!main &&
        !!view.branches['feature/skills'] &&
        h.reaches(main.oid, view.branches['feature/skills']);
      break;
    case 'main-skills':
      passed = skills(main?.files['skills.txt']);
      break;
    case 'clean':
      passed =
        view.initialized &&
        view.status.every(([, head, work, index]) => head === work && head === index);
      break;
  }
  passed ||= !!evidence;
  return {
    passed,
    evidence:
      evidence || (passed ? 'Verified current repository state' : 'No matching verified evidence'),
    reason: passed ? 'Requirement satisfied.' : 'Requirement is not yet satisfied.',
  };
}
