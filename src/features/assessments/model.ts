import { criterionIds } from './independentCriteria.ts';
import { requirementProgress, requirementCatalog } from './requirements.ts';
import type { RepoView } from '../git-engine/engine.ts';
import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS.ts';
import type { StudentIdentity } from '../assignments/assignment.ts';
export type Rule = {
  type:
    | 'repository'
    | 'file'
    | 'branch'
    | 'commits'
    | 'message'
    | 'merged'
    | 'isolation'
    | 'criterion';
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
};
export type Task = {
  id: string;
  title: string;
  instructions: string;
  points: number;
  bonus: boolean;
  rules: Rule[];
  requirementWeights?: Record<string, number>;
};
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  kind:
    | 'single'
    | 'multiple'
    | 'boolean'
    | 'short'
    | 'long'
    | 'scenario'
    | 'interpretation'
    | 'choice-complete'
    | 'fill-blank';
  points: number;
  options: string[];
  manual: boolean;
  required: boolean;
  correctAnswers?: string[];
  answerMatching?: 'git-command';
  explanation?: string;
};
export type Definition = {
  schemaVersion: 1;
  courseSlot?: 'task1' | 'task2' | 'final';
  gradingPolicy: 'independent-v2';
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
  invalidation_reason?: string;
  id: string;
  assignment_id: string;
  assignment_version: number;
  status: string;
  receipt: string | null;
  restarted_to?: string | null;
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
export function blankDefinition(
  type: 'assignment' | 'exam' = 'assignment',
): Definition {
  return {
    schemaVersion: 1,
    gradingPolicy: 'independent-v2',
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
export const taskList = (d: Definition) => d.sections.flatMap((s) => s.tasks);
// Sum decimal marks consistently across the browser and Edge verifier.
export function sumPoints(values: number[]) {
  if (values.some((value) => !Number.isFinite(value))) return values.reduce((sum, n) => sum + n, 0);
  const parts = values.map((value) => {
    const [mantissa, exponent = '0'] = value.toString().split('e');
    const fraction = mantissa.split('.')[1] || '';
    return { units: BigInt(mantissa.replace('.', '')), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...parts.map((p) => p.scale));
  const total = parts.reduce((sum, p) => sum + p.units * 10n ** BigInt(scale - p.scale), 0n);
  const digits = (total < 0 ? -total : total).toString().padStart(scale + 1, '0');
  return Number(
    (total < 0 ? '-' : '') +
      (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits),
  );
}
export const totals = (d: Definition) => {
  const sum = sumPoints;
  return {
    practical: sum(
      taskList(d)
        .filter((t) => !t.bonus)
        .map((t) => t.points),
    ),
    theory: sum(d.questions.map((q) => q.points)),
    bonus: sum(
      taskList(d)
        .filter((t) => t.bonus)
        .map((t) => t.points),
    ),
  };
};
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
export function assertDefinition(value: unknown, draft = false): asserts value is Definition {
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
        if (
          ![
            'repository',
            'file',
            'branch',
            'commits',
            'message',
            'merged',
            'isolation',
            'criterion',
          ].includes(r.type)
        )
          throw new Error('Unsupported validation rule');
        if (
          r.type === 'criterion' &&
          !criterionIds.includes(r.outcomeId as (typeof criterionIds)[number])
        )
          throw new Error('Unknown independent criterion');
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
      }
    }
  }
  ids.clear(); // Questions and practical outcomes have distinct storage namespaces.
  for (const q of d.questions) {
    add(q.id);
    if (
      !bounded(q.prompt) ||
      !q.prompt.trim() ||
      ![
        'single',
        'multiple',
        'boolean',
        'short',
        'long',
        'scenario',
        'interpretation',
        'choice-complete',
        'fill-blank',
      ].includes(q.kind) ||
      !Number.isFinite(q.points) ||
      q.points < 0 ||
      q.points > 1000 ||
      typeof q.manual !== 'boolean' ||
      typeof q.required !== 'boolean' ||
      (q.answerMatching !== undefined &&
        (q.kind !== 'fill-blank' || q.answerMatching !== 'git-command')) ||
      !Array.isArray(q.options) ||
      q.options.length > 20 ||
      q.options.some((o) => !bounded(o, 500)) ||
      q.options.some((o) => !o.trim() || o.includes('\n')) ||
      new Set(q.options).size !== q.options.length
    )
      throw new Error('Invalid question');
    if (
      ['single', 'multiple', 'boolean', 'choice-complete'].includes(q.kind) &&
      q.options.length < 2
    )
      throw new Error('Objective questions need at least two options');
    if (
      q.correctAnswers !== undefined &&
      (!Array.isArray(q.correctAnswers) ||
        q.correctAnswers.some(
          (a) =>
            typeof a !== 'string' ||
            !a.trim() ||
            a.length > 500 ||
            (q.answerMatching === 'git-command' && !normalizeGitCommandAnswer(a)) ||
            (q.kind !== 'fill-blank' && !q.options.includes(a)),
        ))
    )
      throw new Error('Answer key must use the configured options');
  }
  if (d.gradingPolicy !== 'independent-v2' || d.gateTheory || d.requireComplete)
    throw new Error('Independent scoring requires partial submission and unrestricted navigation');
  if (!draft) {
    for (const task of taskList(d)) {
      const checks = requirementCatalog(task);
      const weights = task.requirementWeights || {};
      if (
        Number(task.points.toFixed(2)) !== task.points ||
        (task.requirementWeights !== undefined &&
          (!task.requirementWeights ||
            typeof task.requirementWeights !== 'object' ||
            Array.isArray(task.requirementWeights))) ||
        Object.keys(weights).length !== checks.length ||
        checks.some(
          (c) =>
            !Object.hasOwn(weights, c.id) ||
            !Number.isFinite(weights[c.id]) ||
            Number(weights[c.id].toFixed(2)) !== weights[c.id] ||
            weights[c.id] <= 0,
        ) ||
        Object.values(weights).reduce((sum, n) => sum + Math.round(n * 100), 0) !==
          Math.round(task.points * 100)
      )
        throw new Error(
          `${task.title}: assign a positive weight (up to two decimal places) to every scored requirement; weights must total the task points`,
        );
    }
  }
  if (!draft && d.courseSlot === 'task1') {
    const tasks = taskList(d);
    const criteria = tasks.map((task) => task.rules[0]?.outcomeId);
    if (tasks.length !== criterionIds.length || new Set(criteria).size !== criterionIds.length ||
        tasks.some((task) => task.points <= 0 || task.rules.length !== 1 || task.rules[0].type !== 'criterion')) {
      throw new Error('Task 1 requires one weighted task for each of its 25 independent criteria');
    }
  }
  const sum = totals(d);
  if (
    d.courseSlot !== undefined &&
    (!['task1', 'task2', 'final'].includes(d.courseSlot) ||
      (!draft && (sum.bonus !== 0 ||
        sumPoints([sum.practical, sum.theory]) !== (d.courseSlot === 'final' ? 200 : 150) ||
        (d.courseSlot === 'task1' && (sum.practical !== 100 || sum.theory !== 50)))))
  )
    throw new Error(
      'Course assessments require their exact maximum, no bonus, and partial submission',
    );
  if (sumPoints([sum.practical, sum.theory, sum.bonus]) > 10000)
    throw new Error('Assessment points exceed limit');
  if (
    (d.format === 'theory' && taskList(d).length) ||
    (d.format === 'practical' && d.questions.length)
  )
    throw new Error('Format does not match content');
}
export function sanitizeAnswers(d: Definition, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid answers');
  const result: Record<string, string> = {};
  for (const [id, answer] of Object.entries(value)) {
    const q = d.questions.find((q) => q.id === id);
    if (!q || !bounded(answer)) throw new Error('Unknown or oversized answer');
    if (
      ['single', 'multiple', 'boolean', 'choice-complete'].includes(q.kind) &&
      answer &&
      String(answer)
        .split('\n')
        .some((s) => !q.options.includes(s))
    )
      throw new Error('Unknown option');
    if (
      q.kind !== 'multiple' &&
      ['single', 'boolean', 'choice-complete'].includes(q.kind) &&
      String(answer).includes('\n')
    )
      throw new Error('Choose one answer');
    result[id] = answer as string;
  }
  return result;
}
export function answerPresent(q: AssessmentQuestion, value = '') {
  if (!['single', 'multiple', 'boolean', 'choice-complete'].includes(q.kind)) return !!value.trim();
  const choices = value.split('\n').filter(Boolean);
  return (
    choices.length > 0 &&
    choices.every((c) => q.options.includes(c)) &&
    (q.kind === 'multiple' || choices.length === 1)
  );
}
export const normalizeAnswer = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function normalizeGitCommandAnswer(answer: string) {
  const command = answer.replace(/^[ \t]+|[ \t]+$/g, '').replace(/[ \t]+/g, ' ');
  // Match a single command with bare tokens. Newlines and Unicode lookalikes are significant.
  return /^git(?: [A-Za-z0-9_./-]+)+(?![\s\S])/.test(command) ? command : '';
}
export function gradeObjective(
  d: Definition,
  answers: Record<string, string>,
  keys: Record<string, { correctAnswers: string[]; explanation?: string }>,
) {
  return d.questions
    .filter(
      (q) =>
        !q.manual &&
        ['single', 'multiple', 'boolean', 'choice-complete', 'fill-blank'].includes(q.kind),
    )
    .map((q) => {
      const expected = keys[q.id]?.correctAnswers;
      if (!expected?.length) throw new Error('Missing private objective answer key');
      const answer = answers[q.id] || '';
      const normalize =
        q.answerMatching === 'git-command' ? normalizeGitCommandAnswer : normalizeAnswer;
      const typed = q.kind === 'fill-blank' ? normalize(answer) : '';
      const choices = [...new Set(answer.split('\n').filter(Boolean))].sort();
      return {
        question_id: q.id,
        points: (
          q.kind === 'fill-blank'
            ? !!typed && expected.some((a) => normalize(a) === typed)
            : JSON.stringify(choices) === JSON.stringify([...expected].sort())
        )
          ? q.points
          : 0,
        automatic: true,
      };
    });
}

export const earnedPoints = (outcome: { earned: number }) => outcome.earned;

export function outcomesFor(
  definition: Definition,
  view: RepoView,
  identity: StudentIdentity,
  working: Record<string, string> = {},
) {
  return requirementProgress(definition, view, identity, working).map((progress) => ({
    id: progress.task.id,
    label: progress.task.title,
    points: progress.task.points,
    bonus: progress.task.bonus,
    passed: progress.passed,
    earned: progress.earned,
    requirements: progress.requirements.filter((check) => !check.preparation).map((check) => ({
      id: check.id,
      passed: check.passed === true,
      points: check.points,
      earned: check.earned,
      reason: check.passed ? 'Requirement satisfied.' : check.hint,
      evidence: check.detected,
      recovery: check.hint,
    })),
  }));
}
