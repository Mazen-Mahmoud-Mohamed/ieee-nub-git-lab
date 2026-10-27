import type { RepoView } from '../git-engine/engine.ts';
import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS.ts';
import {
  assignment,
  questions,
  reflectionQuestions,
  validateRepository,
  legacyRequirementChecks,
  type StudentIdentity,
  type Outcome,
} from '../assignments/assignment.ts';
export type Rule = {
  type:
    'repository' | 'file' | 'branch' | 'commits' | 'message' | 'merged' | 'isolation' | 'legacy';
  branch?: string;
  clean?: boolean;
  path?: string;
  ref?: string;
  match?: 'exists' | 'exact' | 'contains' | 'lines';
  value?: string;
  min?: number;
  source?: string;
  target?: string;
  mergeCommit?: boolean;
  outcomeId?: string;
  revision?: 1 | 2;
};
export type Task = {
  id: string;
  title: string;
  instructions: string;
  points: number;
  bonus: boolean;
  rules: Rule[];
};
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  kind: 'single' | 'multiple' | 'boolean' | 'short' | 'long' | 'scenario' | 'interpretation';
  points: number;
  options: string[];
  manual: boolean;
  required: boolean;
  correctAnswers?: string[];
  explanation?: string;
};
export type Definition = {
  schemaVersion: 1;
  title: string;
  description: string;
  instructions: string;
  type: 'assignment' | 'exam';
  format: 'practical' | 'theory' | 'mixed';
  projectName: string;
  durationMinutes: number;
  attemptLimit: number;
  startsAt: string | null;
  endsAt: string | null;
  deadline: string | null;
  releaseImmediately: boolean;
  reviewAnswers: boolean;
  gateTheory: boolean;
  requireComplete: boolean;
  starter: {
    files: Record<string, string>;
    initialize: boolean;
    commit: boolean;
    snapshot?: Snapshot;
  };
  sections: Array<{
    id: string;
    title: string;
    description: string;
    steps: string[];
    tasks: Task[];
  }>;
  questions: AssessmentQuestion[];
};
export type AssessmentRecord = {
  id: string;
  version: number;
  visible: boolean;
  archived: boolean;
  type: 'assignment' | 'exam';
  title: string;
  description: string;
  definition?: Definition;
};
export type AttemptState = {
  id: string;
  assignment_id: string;
  assignment_version: number;
  status: string;
  receipt: string | null;
  created_at: string;
  deadline_at: string | null;
  checkpoint_revision: number;
  auto_submitted: boolean;
  server_now: string;
  definition: Definition;
  payload?: {
    snapshot: import('../filesystem/VirtualFS.ts').Snapshot;
    answers: Record<string, string>;
    events: import('../git-engine/engine.ts').Activity[];
    cwd?: string;
    config?: Record<string, string>;
  };
  released?: boolean;
};
export function blankDefinition(type: 'assignment' | 'exam' = 'assignment'): Definition {
  return {
    schemaVersion: 1,
    title: type === 'exam' ? 'New Git exam' : 'New Git assignment',
    description: '',
    instructions: '',
    type,
    format: 'mixed',
    projectName: 'Git-Exercise',
    durationMinutes: type === 'exam' ? 30 : 0,
    attemptLimit: 1,
    startsAt: null,
    endsAt: null,
    deadline: null,
    releaseImmediately: false,
    reviewAnswers: true,
    gateTheory: false,
    requireComplete: false,
    starter: { files: {}, initialize: false, commit: false },
    sections: [],
    questions: [],
  };
}
const legacyOutcomes: Record<string, Array<[string, string, number]>> = {
  init: [
    ['repo', 'Local repository on main with configured identity', 5],
    ['files', 'Required project files contain your information and course content', 10],
  ],
  commits: [
    ['separate', 'The first three files were introduced in separate focused commits', 10],
    ['goals', 'Two additional goals saved in a later meaningful commit', 10],
  ],
  branches: [
    ['feature', 'feature/skills contains the three committed skills', 10],
    ['isolation', 'History shows skills introduced after the branch point', 10],
  ],
  merge: [
    ['merged', 'Feature history and skills are present on main', 15],
    ['clean', 'Finish on main with a clean working tree', 5],
  ],
  bonus: [['bonus', 'Diverged hobbies and completion histories joined by a merge commit', 10]],
};
export const firstAssessment: Definition = {
  ...blankDefinition(),
  title: assignment.title,
  description: assignment.description,
  instructions:
    'Complete the local Git tasks using plain text files. Then answer the theory questions and reflections.',
  projectName: 'IEEE-Git-Task',
  gateTheory: true,
  requireComplete: true,
  sections: assignment.sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    steps: s.steps,
    tasks: legacyOutcomes[s.id].map(([id, title, points]) => ({
      id,
      title,
      instructions: s.steps.join('\n'),
      points,
      bonus: s.id === 'bonus',
      rules: [{ type: 'legacy', outcomeId: id }],
    })),
  })),
  questions: [...questions, ...reflectionQuestions].map((q) => ({
    ...q,
    options: [],
    manual: true,
    required: q.id !== 'bonus',
  })),
};
export const taskList = (d: Definition) => d.sections.flatMap((s) => s.tasks);
export const totals = (d: Definition) => ({
  practical: taskList(d)
    .filter((t) => !t.bonus)
    .reduce((s, t) => s + t.points, 0),
  theory: d.questions.reduce((s, q) => s + q.points, 0),
  bonus: taskList(d)
    .filter((t) => t.bonus)
    .reduce((s, t) => s + t.points, 0),
});
const bounded = (x: unknown, n = 8000) => typeof x === 'string' && x.length <= n;
const identifier = (x: unknown) => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
export function validFile(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length <= 180 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !/[\x00-\x1f]/.test(path) &&
    path.split('/').every((p) => !!p && p !== '.' && p !== '..' && p !== '.git') &&
    path.endsWith('.txt')
  );
}
export function assertDefinition(value: unknown): asserts value is Definition {
  const d = value as Definition;
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !bounded(d.title, 180) ||
    !d.title.trim() ||
    !bounded(d.description) ||
    !bounded(d.instructions) ||
    !['assignment', 'exam'].includes(d.type) ||
    !['practical', 'theory', 'mixed'].includes(d.format) ||
    !/^[\w-]{1,60}$/.test(d.projectName) ||
    !Number.isInteger(d.attemptLimit) ||
    d.attemptLimit < 1 ||
    d.attemptLimit > 20 ||
    !Number.isInteger(d.durationMinutes) ||
    d.durationMinutes < 0 ||
    d.durationMinutes > 1440 ||
    (d.type === 'exam' && d.durationMinutes < 1)
  )
    throw new Error('Invalid assessment details, duration or attempt limit');
  for (const key of ['startsAt', 'endsAt', 'deadline'] as const)
    if (d[key] !== null && (!bounded(d[key], 50) || !Number.isFinite(Date.parse(d[key]!))))
      throw new Error('Invalid date');
  if (d.startsAt && d.endsAt && Date.parse(d.startsAt) >= Date.parse(d.endsAt))
    throw new Error('End must follow start');
  for (const key of [
    'releaseImmediately',
    'reviewAnswers',
    'gateTheory',
    'requireComplete',
  ] as const)
    if (typeof d[key] !== 'boolean') throw new Error('Invalid grading setting');
  if (
    !d.starter ||
    typeof d.starter.initialize !== 'boolean' ||
    typeof d.starter.commit !== 'boolean' ||
    !d.starter.files ||
    Object.keys(d.starter.files).length > 30 ||
    Object.entries(d.starter.files).some(([p, t]) => !validFile(p) || !bounded(t, 20000))
  )
    throw new Error('Invalid starter files');
  if (d.starter.snapshot) VirtualFS.restore(d.starter.snapshot);
  if (
    !Array.isArray(d.sections) ||
    d.sections.length > 20 ||
    !Array.isArray(d.questions) ||
    d.questions.length > 100
  )
    throw new Error('Too many sections or questions');
  const ids = new Set<string>();
  const add = (id: string) => {
    if (!identifier(id) || ids.has(id)) throw new Error('IDs must be unique');
    ids.add(id);
  };
  const sectionIds = new Set<string>();
  for (const s of d.sections) {
    if (!identifier(s.id) || sectionIds.has(s.id))
      throw new Error('Invalid or duplicate section ID');
    sectionIds.add(s.id);
    if (
      !bounded(s.title, 180) ||
      !bounded(s.description) ||
      !Array.isArray(s.steps) ||
      s.steps.length > 30 ||
      s.steps.some((x) => !bounded(x)) ||
      !Array.isArray(s.tasks) ||
      s.tasks.length > 30
    )
      throw new Error('Invalid section');
    for (const t of s.tasks) {
      add(t.id);
      if (
        !bounded(t.title, 180) ||
        !bounded(t.instructions) ||
        !Number.isFinite(t.points) ||
        t.points < 0 ||
        t.points > 1000 ||
        typeof t.bonus !== 'boolean' ||
        !Array.isArray(t.rules) ||
        !t.rules.length ||
        t.rules.length > 20
      )
        throw new Error('Invalid practical task');
      for (const r of t.rules) {
        if (r.revision !== undefined && (r.type !== 'legacy' || ![1, 2].includes(r.revision)))
          throw new Error('Unsupported compatibility revision');
        if (
          ![
            'repository',
            'file',
            'branch',
            'commits',
            'message',
            'merged',
            'isolation',
            'legacy',
          ].includes(r.type)
        )
          throw new Error('Unsupported validation rule');
        if (r.path !== undefined && !validFile(r.path))
          throw new Error('Rules require safe .txt paths');
        if (['file', 'isolation'].includes(r.type) && !validFile(r.path))
          throw new Error('A file validation rule needs a safe .txt path');
        if (
          r.type === 'file' &&
          r.match !== undefined &&
          !['exists', 'exact', 'contains', 'lines'].includes(r.match)
        )
          throw new Error('Unsupported content rule');
        if (
          (r.type === 'branch' && !r.branch) ||
          (['merged', 'isolation'].includes(r.type) && !r.source)
        )
          throw new Error('A branch validation rule needs a branch name');
        if (r.type === 'message' && !r.value?.trim())
          throw new Error('Commit message rules need expected text');
        if (
          (r.clean !== undefined && typeof r.clean !== 'boolean') ||
          (r.mergeCommit !== undefined && typeof r.mergeCommit !== 'boolean')
        )
          throw new Error('Invalid rule flag');
        for (const name of [r.branch, r.ref, r.source, r.target])
          if (name !== undefined && !/^[\w][\w./-]{0,99}$/.test(name))
            throw new Error('Invalid branch reference');
        if (r.value !== undefined && !bounded(r.value, 20000))
          throw new Error('Invalid expected content');
        if (r.min !== undefined && (!Number.isInteger(r.min) || r.min < 0 || r.min > 150))
          throw new Error('Invalid minimum');
        if (
          r.type === 'legacy' &&
          !Object.values(legacyOutcomes)
            .flat()
            .some(([id]) => id === r.outcomeId)
        )
          throw new Error('Unknown compatibility validator');
      }
    }
  }
  ids.clear(); // Questions and practical outcomes have distinct storage namespaces.
  for (const q of d.questions) {
    add(q.id);
    if (
      !bounded(q.prompt) ||
      !q.prompt.trim() ||
      !['single', 'multiple', 'boolean', 'short', 'long', 'scenario', 'interpretation'].includes(
        q.kind,
      ) ||
      !Number.isFinite(q.points) ||
      q.points < 0 ||
      q.points > 1000 ||
      typeof q.manual !== 'boolean' ||
      typeof q.required !== 'boolean' ||
      !Array.isArray(q.options) ||
      q.options.length > 20 ||
      q.options.some((o) => !bounded(o, 500)) ||
      q.options.some((o) => !o.trim() || o.includes('\n')) ||
      new Set(q.options).size !== q.options.length
    )
      throw new Error('Invalid question');
    if (['single', 'multiple', 'boolean'].includes(q.kind) && q.options.length < 2)
      throw new Error('Objective questions need at least two options');
    if (
      q.correctAnswers !== undefined &&
      (!Array.isArray(q.correctAnswers) || q.correctAnswers.some((a) => !q.options.includes(a)))
    )
      throw new Error('Answer key must use the configured options');
  }
  const sum = totals(d);
  if (sum.practical + sum.theory + sum.bonus > 10000)
    throw new Error('Assessment points exceed limit');
  if (
    (d.format === 'theory' && taskList(d).length) ||
    (d.format === 'practical' && d.questions.length)
  )
    throw new Error('Format does not match content');
}
export function outcomesFor(
  d: Definition,
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string> = {},
): Array<Outcome & { feedback: string[] }> {
  const legacyResults = new Map<number, Outcome[]>();
  const legacy = (revision: 1 | 2 = 1) => {
    if (!legacyResults.has(revision))
      legacyResults.set(revision, validateRepository(view, identity, revision, working));
    return legacyResults.get(revision)!;
  };
  const commits = new Map(view.commits.map((c) => [c.oid, c]));
  const ancestors = (ref: string) => {
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      commits.get(id)?.parents.forEach(visit);
    };
    visit(view.branches[ref] || '');
    return [...seen].map((id) => commits.get(id)).filter((c) => !!c);
  };
  const files = (ref = 'main') =>
    ref === 'working' ? working : commits.get(view.branches[ref])?.files || {};
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const reaches = (start: string, target: string): boolean => {
    const visited = new Set<string>();
    const visit = (oid: string): boolean => {
      if (oid === target) return true;
      if (visited.has(oid)) return false;
      visited.add(oid);
      return commits.get(oid)?.parents.some(visit) || false;
    };
    return visit(start);
  };
  const passes = (r: Rule): boolean => {
    switch (r.type) {
      case 'legacy':
        return legacy(r.revision).find((o) => o.id === r.outcomeId)?.passed || false;
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
                c.parents.some((p) => reaches(p, source)) &&
                c.parents.some((p) => !reaches(p, source)),
            ))
        );
      }
      case 'isolation':
        return ancestors(r.source || '').some(
          (c) =>
            r.path! in c.files &&
            c.parents.some((p) => !(r.path! in (commits.get(p)?.files || {}))),
        );
    }
  };
  return taskList(d).map((t) => ({
    id: t.id,
    label: t.title,
    points: t.points,
    bonus: t.bonus,
    passed: t.rules.every(passes),
    feedback: t.rules
      .filter((r) => !passes(r))
      .map((r) => {
        switch (r.type) {
          case 'repository':
            return !view.initialized
              ? 'Create a Git repository in this project first.'
              : `Check the active branch${r.branch ? ' (' + r.branch + ')' : ''}${r.clean ? ' and save all tracked changes in commits' : ''}.`;
          case 'file':
            return `Check ${r.path} in ${r.ref === 'working' ? 'your working files' : 'the committed files on ' + (r.ref || 'main')}. It must ${r.match === 'lines' ? 'have at least ' + (r.min || 1) + ' non-empty lines' : r.match === 'exact' ? 'match the required content' : r.match === 'contains' ? 'contain the required text' : 'exist'}.`;
          case 'branch':
            return `The branch ${r.branch} is missing.`;
          case 'commits':
            return `At least ${r.min || 1} commits must be reachable from ${r.ref || 'main'}.`;
          case 'message':
            return `Check for the required commit message in ${r.ref || 'main'} history.`;
          case 'merged':
            return `Check that ${r.source} history is included in ${r.target || 'main'}${r.mergeCommit ? ' through a merge commit' : ''}.`;
          case 'isolation':
            return `Check that ${r.path} was introduced in a new commit on ${r.source}.`;
          case 'legacy':
            if (r.revision === 2)
              return (
                legacyRequirementChecks(view, identity, working, 2)[r.outcomeId || '']?.find(
                  (c) => c.passed !== true,
                )?.hint || 'Compare the saved repository with this task’s requirements.'
              );
            return (
              (
                {
                  repo: 'Check your Git name and email, and the main branch.',
                  files:
                    'Compare the committed about.txt, goals.txt and notes.txt with the required file contents.',
                  separate:
                    'Each starting file needs its own focused commit in the required order. Check commit messages and file history.',
                  goals:
                    'The original three goals must remain, followed by two new goals in a later meaningful commit.',
                  feature:
                    'Check the committed skills.txt on feature/skills for all three required skills.',
                  isolation: 'Check that skills.txt first appears after the feature branch point.',
                  merged: 'Check that main includes the feature branch history and skills.txt.',
                  clean: 'Finish on main with no staged or unstaged changes.',
                  bonus:
                    'Check the separate hobbies and completion histories and their final merge commit.',
                } as Record<string, string>
              )[r.outcomeId || ''] ||
              'Compare your repository history with this task’s requirements.'
            );
        }
      }),
  }));
}
export function sanitizeAnswers(d: Definition, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid answers');
  const result: Record<string, string> = {};
  for (const [id, answer] of Object.entries(value)) {
    const q = d.questions.find((q) => q.id === id);
    if (!q || !bounded(answer)) throw new Error('Unknown or oversized answer');
    if (
      ['single', 'multiple', 'boolean'].includes(q.kind) &&
      answer &&
      String(answer)
        .split('\n')
        .some((s) => !q.options.includes(s))
    )
      throw new Error('Unknown option');
    if (
      q.kind !== 'multiple' &&
      ['single', 'boolean'].includes(q.kind) &&
      String(answer).includes('\n')
    )
      throw new Error('Choose one answer');
    result[id] = answer as string;
  }
  return result;
}
export function answerPresent(q: AssessmentQuestion, value = '') {
  if (!['single', 'multiple', 'boolean'].includes(q.kind)) return !!value.trim();
  const choices = value.split('\n').filter(Boolean);
  return (
    choices.length > 0 &&
    choices.every((c) => q.options.includes(c)) &&
    (q.kind === 'multiple' || choices.length === 1)
  );
}
export function gradeObjective(
  d: Definition,
  answers: Record<string, string>,
  keys: Record<string, { correctAnswers: string[]; explanation?: string }>,
) {
  return d.questions
    .filter((q) => !q.manual && ['single', 'multiple', 'boolean'].includes(q.kind))
    .map((q) => {
      const expected = keys[q.id]?.correctAnswers;
      if (!expected?.length) throw new Error('Missing private objective answer key');
      const actual = [...new Set((answers[q.id] || '').split('\n').filter(Boolean))].sort();
      return {
        question_id: q.id,
        points: JSON.stringify(actual) === JSON.stringify([...expected].sort()) ? q.points : 0,
        automatic: true,
      };
    });
}
