import { TASK_ONE_ID } from '../../src/features/assignments/assignment';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { managementDatabase, STUDENT, TEACHER, ADMIN } from '../helpers/managementDatabase';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
let h: Awaited<ReturnType<typeof managementDatabase>>;
beforeEach(async () => {
  h = await managementDatabase();
});
afterEach(async () => {
  await h.db.close();
});
it('saves unfinished draft weights while rejecting malformed configuration and invalid publication', async () => {
  const d = taskOneDefinition();
  delete d.sections[0].tasks[0].requirementWeights;
  const save = (p_document: unknown, p_publish: boolean) =>
    h.rpc(TEACHER, 'save_assessment', { p_id: TASK_ONE_ID, p_document, p_publish });
  await expect(save(d, false)).resolves.toBe(TASK_ONE_ID);
  await expect(save(d, true)).rejects.toThrow(/requirement weights/);
  await expect(save({ ...d, projectName: null }, false)).rejects.toThrow(
    /Invalid assessment configuration/,
  );
});
it('excludes a released assessment outside the course and blocks reassignment of a course slot', async () => {
  const course = await h.rpc(TEACHER, 'manage_learning_save', {
    p_id: null,
    p_kind: 'course',
    p_parent: null,
    p_document: { title: 'Separate course', body: '', links: [] },
    p_revision: null,
    p_publish: true,
  });
  const d = taskOneDefinition();
  delete d.courseSlot;
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: null,
    p_document: d,
    p_publish: true,
  });
  const revision = async (target: string) =>
    (
      await h.db.query<{ revision: number }>(
        "select revision from private.record_management where kind='assessment' and record_id=$1",
        [target],
      )
    ).rows[0].revision;
  const assign = async (p_assessment: string) =>
    h.rpc(TEACHER, 'manage_assessment_course', {
      p_assessment,
      p_course: course,
      p_revision: await revision(p_assessment),
    });
  await expect(assign(TASK_ONE_ID)).rejects.toThrow(/cannot be removed/);
  await assign(id);
  const attempt = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
  await h.db.query("update public.attempts set status='graded' where id=$1", [attempt.id]);
  await h.db.query(
    'insert into public.grading_summaries(attempt_id,practical_score,theory_score,released) values($1,100,50,true)',
    [attempt.id],
  );
  const [grade] = (await h.asUser(STUDENT, 'select * from public.course_gradebook()')).rows;
  expect(Number(grade.total)).toBe(0);
  expect(Number(grade.completed_components)).toBe(0);
});
it('publishes 150-point Task 1 privately and rejects wrong totals, unknown criteria and student publishing', async () => {
  const d = taskOneDefinition();
  await expect(
    h.rpc(STUDENT, 'save_assessment', { p_id: null, p_document: d, p_publish: true }),
  ).rejects.toThrow();
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: TASK_ONE_ID,
    p_document: d,
    p_publish: true,
  });
  expect(id).toBeTruthy();
  d.questions[0].points++;
  await expect(
    h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: d, p_publish: true }),
  ).rejects.toThrow();
  d.questions[0].points--;
  d.sections[0].tasks[0].rules[0].outcomeId = 'invented';
  await expect(
    h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: d, p_publish: true }),
  ).rejects.toThrow();
});
it('keeps typed accepted answers private and freezes active published versions', async () => {
  const d = taskOneDefinition();
  d.questions[0] = {
    ...d.questions[0],
    kind: 'fill-blank',
    manual: false,
    correctAnswers: ['git status', 'git status --short'],
  };
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: TASK_ONE_ID,
    p_document: d,
    p_publish: true,
  });
  const a = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
  expect(
    (await h.rpc(STUDENT, 'assessment_state', { p_attempt: a.id })).definition.questions[0]
      .correctAnswers,
  ).toBeUndefined();
  expect(JSON.stringify(a)).not.toContain('git status --short');
  d.questions[0].correctAnswers = ['different'];
  await h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: d, p_publish: true });
  const state = await h.rpc(STUDENT, 'assessment_state', { p_attempt: a.id });
  expect(state.assignment_version).toBe(2);
  await expect(h.asUser(STUDENT, 'select * from private.assessment_keys')).rejects.toThrow();
});
it('allows partial finalization, retains per-criterion evidence and makes duplicate retries idempotent', async () => {
  const d = taskOneDefinition();
  const id = await h.rpc(TEACHER, 'save_assessment', {
    p_id: TASK_ONE_ID,
    p_document: d,
    p_publish: true,
  });
  const a = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
  const outcomes = d.sections
    .flatMap((s) => s.tasks)
    .map((t) => ({
      id: t.id,
      points: t.points,
      earned: 0,
      passed: false,
      requirements: [
        {
          id: t.id + ':rule-0-criterion',
          passed: false,
          points: t.points,
          earned: 0,
          evidence: 'No matching verified evidence',
        },
      ],
    }));
  const key = crypto.randomUUID();
  const args = [
    STUDENT,
    a.id,
    0,
    JSON.stringify({
      snapshot: { version: 1, entries: { '/': { kind: 'dir', data: [] } } },
      answers: {},
      events: [],
    }),
    JSON.stringify(outcomes),
    '[]',
    0,
    0,
    true,
    key,
  ];
  const sql = 'select public.accept_assessment_checkpoint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result';
  await expect(h.asUser(STUDENT, sql, args)).rejects.toThrow();
  const first = await h.db.query<any>(sql, args);
  const retry = await h.db.query<any>(sql, args);
  expect(retry.rows[0].result.receipt).toBe(first.rows[0].result.receipt);
  expect(
    (await h.db.query('select * from public.task_results where attempt_id=$1', [a.id])).rows,
  ).toHaveLength(25);
});
it('uses combined 400/500 without per-task thresholds, filters students and leaves future slots unconfigured', async () => {
  expect(
    (
      await h.db.query(
        "select * from public.assessment_versions where document->>'courseSlot' in ('task2','final')",
      )
    ).rows,
  ).toHaveLength(0);
  for (const [slot, practical, theory] of [
    ['task1', 50, 0],
    ['task2', 100, 50],
    ['final', 150, 50],
  ] as const) {
    const pending = (await h.asUser(STUDENT, 'select * from public.course_gradebook()')).rows[0];
    expect(Number(pending.completed_components)).toBeLessThan(3);
    expect(pending.eligible).toBe(false);
    const d = taskOneDefinition();
    d.courseSlot = slot;
    if (slot === 'final') {
      d.sections[0].tasks[0].points += 50;
      d.sections[0].tasks[0].requirementWeights!['t1-initialized:rule-0-criterion'] += 50;
    }
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: slot === 'task1' ? TASK_ONE_ID : null,
      p_document: d,
      p_publish: true,
    });
    const a = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
    await h.db.query("update public.attempts set status='graded' where id=$1", [a.id]);
    await h.db.query(
      'insert into public.grading_summaries(attempt_id,practical_score,theory_score,released) values($1,$2,$3,true)',
      [a.id, practical, theory],
    );
  }
  let rows = (await h.asUser(STUDENT, 'select * from public.course_gradebook()')).rows;
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].total)).toBe(400);
  expect(rows[0].eligible).toBe(true);
  expect(Number(rows[0].completed_components)).toBe(3);
  expect(
    (await h.asUser(ADMIN, 'select * from public.course_gradebook()')).rows.length,
  ).toBeGreaterThan(1);
  await expect(h.rpc(null, 'course_gradebook')).rejects.toThrow();
  await h.db.query(
    "update public.grading_summaries set theory_score=49 where attempt_id in(select a.id from public.attempts a join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version where v.document->>'courseSlot'='final')",
  );
  rows = (await h.asUser(STUDENT, 'select * from public.course_gradebook()')).rows;
  expect(rows[0].eligible).toBe(false);
});
