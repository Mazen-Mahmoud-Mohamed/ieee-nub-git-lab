import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { managementDatabase, STUDENT, TEACHER, ADMIN } from '../helpers/managementDatabase';
import {
  blankDefinition,
  assertDefinition,
  outcomesFor,
  firstAssessment,
  totals,
  sumPoints,
  type Definition,
} from '../../src/features/assessments/model';
import {
  requirementCatalog,
  requirementProgress,
} from '../../src/features/assessments/requirements';
import { GitEngine } from '../../src/features/git-engine/engine';
import { verifyAssessment } from '../../src/features/assessments/verify';
import { correctedAssignment } from '../../src/features/assessments/correctedAssignment';
import { weightedFundamentalsFixture } from '../helpers/weightedFundamentals';
const identity = { full_name: 'Student Example', department: 'Engineering' };
const definition = (): Definition => ({
  ...blankDefinition(),
  gradingPolicy: 'requirements-v1',
  format: 'practical',
  releaseImmediately: true,
  projectName: 'IEEE-Git-Task',
  sections: [
    {
      id: 'work',
      title: 'Work',
      description: '',
      steps: [],
      tasks: [
        {
          id: 'files',
          title: 'Files',
          instructions: 'Write the required text.',
          points: 10,
          bonus: false,
          rules: [
            {
              type: 'file',
              path: 'about.txt',
              match: 'exact',
              value: 'Correct text',
              ref: 'working',
            },
            { type: 'branch', branch: 'main' },
          ],
          requirementWeights: {
            'files:rule-0-exists': 2,
            'files:rule-0-content': 5,
            'files:rule-1-exists': 3,
          },
        },
        {
          id: 'extra',
          title: 'Bonus',
          instructions: 'Create an extra file.',
          points: 2,
          bonus: true,
          rules: [{ type: 'file', path: 'bonus.txt', ref: 'working' }],
          requirementWeights: { 'extra:rule-0-exists': 2 },
        },
      ],
    },
  ],
});
async function engine() {
  const e = new GitEngine();
  for (const c of [
    'mkdir IEEE-Git-Task',
    'cd IEEE-Git-Task',
    'git init',
    'git config user.name Student',
    'git config user.email student@example.test',
  ])
    expect((await e.execute(c)).success).toBe(true);
  return e;
}
describe('independent versioned scoring', () => {
  it('defaults new assignments and exams to independent scoring without changing compatibility templates', () => {
    for (const type of ['assignment', 'exam'] as const) {
      const d = blankDefinition(type);
      expect(d.gradingPolicy).toBe('requirements-v1');
      expect(d.gateTheory).toBe(false);
      expect(d.requireComplete).toBe(false);
      assertDefinition(d);
    }
    expect(firstAssessment.gradingPolicy).toBeUndefined();
    expect(firstAssessment.requireComplete).toBe(true);
    expect(correctedAssignment().gradingPolicy).toBeUndefined();
  });
  it('adds decimal practical, theory and bonus totals exactly, retaining finer question precision', () => {
    expect(sumPoints([0.1, 0.2])).toBe(0.3);
    expect(sumPoints([0.1, 0.2, 0.001, 1e-7])).toBe(0.3010001);
    expect(sumPoints([])).toBe(0);
    const d = definition();
    d.sections[0].tasks[0].points = 0.1;
    d.sections[0].tasks[1].points = 0.2;
    d.questions = [
      {
        id: 'q',
        prompt: 'Q',
        points: 0.1,
        kind: 'long',
        manual: true,
        required: true,
        options: [],
      },
      {
        id: 'q2',
        prompt: 'Q2',
        points: 0.2,
        kind: 'long',
        manual: true,
        required: true,
        options: [],
      },
    ];
    expect(totals(d)).toEqual({ practical: 0.1, bonus: 0.2, theory: 0.3 });
    const invalid = definition();
    invalid.sections[0].tasks[0].requirementWeights!['files:rule-0-exists'] = 2.000000000001;
    expect(() => assertDefinition(invalid)).toThrow(/weight/);
  });
  it('treats zero-point tasks as informational while allowing partial submission', async () => {
    const d = definition(),
      task = d.sections[0].tasks[0];
    task.points = 0;
    delete task.requirementWeights;
    assertDefinition(d);
    const p = requirementProgress(d, await (await engine()).inspect(), identity, {})[0];
    expect(p.earned).toBe(0);
    expect(p.passed).toBe(false);
    expect(p.requirements.every((c) => c.preparation)).toBe(true);
    expect(requirementCatalog(task)).toEqual([]);
    task.requirementWeights = null as never;
    expect(() => assertDefinition(d)).toThrow(/weight/);
  });
  it('separates introductory content from commit focus in the modern compatibility rules, without changing legacy scores', async () => {
    const d = correctedAssignment();
    d.gradingPolicy = 'requirements-v1';
    d.requireComplete = false;
    const task = d.sections[1].tasks[0];
    d.sections = [{ ...d.sections[1], tasks: [task] }];
    task.requirementWeights = Object.fromEntries(
      requirementCatalog(task).map((c) => [c.id, c.id.endsWith('about.txt-focused') ? 2 : 1]),
    );
    expect(requirementCatalog(task)).toHaveLength(9);
    assertDefinition(d);
    const e = await engine();
    const files = {
      'about.txt': 'Name: Student Example\nUniversity: Nahda University\nDepartment: Engineering',
      'goals.txt':
        'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
      'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
    };
    for (const [file, text] of Object.entries(files)) await e.write(file, text);
    await e.execute('git add .');
    await e.execute('git commit -m "Add personal information"');
    expect(outcomesFor(d, await e.inspect(), identity, files)[0]).toMatchObject({
      earned: 6,
      passed: false,
    });
    const old = structuredClone(d);
    delete old.gradingPolicy;
    expect(outcomesFor(old, await e.inspect(), identity, files)[0]).toMatchObject({
      earned: 0,
      passed: false,
    });
    const verified = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(verified.practicalScore).toBe(6);
  });
  it('supports explicit decimal weights without floating-point drift between task and official totals', async () => {
    const d = definition();
    d.sections[0].tasks[0].points = 0.3;
    d.sections[0].tasks[0].rules = [
      { type: 'file', path: 'about.txt', ref: 'working' },
      { type: 'file', path: 'other.txt', ref: 'working' },
    ];
    d.sections[0].tasks[0].requirementWeights = {
      'files:rule-0-exists': 0.1,
      'files:rule-1-exists': 0.2,
    };
    d.sections[0].tasks = d.sections[0].tasks.slice(0, 1);
    assertDefinition(d);
    const e = await engine();
    await e.write('about.txt', 'A');
    await e.write('other.txt', 'B');
    const v = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(v.practicalScore).toBe(0.3);
    expect(v.outcomes[0].earned).toBe(0.3);
  });
  it('awards none, one, several and all checks independently with separate bonus and deterministic rechecks', async () => {
    const d = definition(),
      e = await engine();
    assertDefinition(d);
    const score = async (working: Record<string, string>) =>
      outcomesFor(d, await e.inspect(), identity, working);
    expect((await score({}))[0].earned).toBe(0);
    await e.write('about.txt', 'Wrong text');
    expect((await score({ 'about.txt': 'Wrong text' }))[0]).toMatchObject({
      earned: 2,
      passed: false,
    });
    await e.execute('git add about.txt');
    await e.execute('git commit -m "Save first file"');
    expect((await score({ 'about.txt': 'Wrong text' }))[0].earned).toBe(5);
    await e.write('about.txt', 'Correct text');
    await e.write('bonus.txt', 'Extra');
    const corrected = await score({ 'about.txt': 'Correct text', 'bonus.txt': 'Extra' });
    expect(corrected.map((o) => o.earned)).toEqual([10, 2]);
    expect(await score({ 'about.txt': 'Correct text', 'bonus.txt': 'Extra' })).toEqual(corrected);
    const progress = requirementProgress(d, await e.inspect(), identity, {
      'about.txt': 'Correct text',
    });
    expect(progress[0].requirements.map((c) => c.earned)).toEqual([2, 5, 3]);
    const verified = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(verified.practicalScore).toBe(12);
    expect(verified.outcomes[0].earned).toBe(10);
    await e.write('about.txt', 'Wrong again');
    const rechecked = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(rechecked.outcomes.map((o) => o.earned)).toEqual([5, 2]);
    expect(rechecked.practicalScore).toBe(7);
  });
  it('requires explicit exact check IDs and weights; never invents weights or changes old scoring', async () => {
    for (const mutate of [
      (d: Definition) => {
        d.sections[0].tasks[0].requirementWeights!['files:rule-0-exists'] = 1;
      },
      (d: Definition) => {
        d.sections[0].tasks[0].requirementWeights!['unknown'] = 1;
      },
      (d: Definition) => {
        delete d.sections[0].tasks[0].requirementWeights;
      },
      (d: Definition) => {
        d.requireComplete = true;
      },
    ]) {
      const d = definition();
      mutate(d);
      expect(() => assertDefinition(d)).toThrow();
    }
    const d = definition();
    delete d.gradingPolicy;
    expect(
      outcomesFor(d, await (await engine()).inspect(), identity, {
        'about.txt': 'Correct text',
      })[0],
    ).toMatchObject({ earned: 0, passed: false });
  });
  it('keeps original history checks failed despite correct current contents and later commits', async () => {
    const d = structuredClone(firstAssessment);
    d.gateTheory = false;
    d.requireComplete = false;
    d.gradingPolicy = 'requirements-v1';
    // Explicit pedagogical weights for each check in this test version.
    d.sections = [
      {
        ...d.sections[1],
        tasks: [
          {
            ...d.sections[1].tasks[0],
            requirementWeights: {
              'separate:rule-0-about.txt-focused': 2,
              'separate:rule-0-about.txt-original-content': 1,
              'separate:rule-0-goals.txt-focused': 1,
              'separate:rule-0-goals.txt-original-content': 1,
              'separate:rule-0-notes.txt-focused': 1,
              'separate:rule-0-notes.txt-original-content': 1,
              'separate:rule-0-personal-message': 2,
              'separate:rule-0-intro-order': 1,
            },
          },
        ],
      },
    ];
    assertDefinition(d);
    const e = await engine(),
      files = {
        'about.txt': 'Name: Student Example\nUniversity: Nahda University\nDepartment: Engineering',
        'goals.txt':
          'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
        'notes.txt': 'Git Course - Session 1\nIEEE NUB Student Branch',
      };
    for (const [path, text] of Object.entries(files)) await e.write(path, text);
    await e.execute('git add .');
    await e.execute('git commit -m "Add personal information"');
    expect(outcomesFor(d, await e.inspect(), identity, files)[0]).toMatchObject({
      earned: 5,
      passed: false,
    });
    await e.write('extra.txt', 'Keep unrelated work');
    await e.execute('git add extra.txt');
    await e.execute('git commit -m "Keep later work"');
    expect(outcomesFor(d, await e.inspect(), identity, files)[0]).toMatchObject({
      earned: 5,
      passed: false,
    });
    expect(await e.read('extra.txt')).toBe('Keep unrelated work');
  });
});
let h: Awaited<ReturnType<typeof managementDatabase>>;
beforeAll(async () => {
  h = await managementDatabase();
}, 30000);
afterAll(async () => {
  await h?.db.close();
});
describe.sequential('authoritative requirement points and immutable versions', () => {
  it('republishes the complete Git Fundamentals rubric at identical maxima and preserves prior submissions, grades and active attempts', async () => {
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: firstAssessment,
      p_publish: true,
    });
    const old = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
    const submitted = await h.rpc(ADMIN, 'start_assessment', { p_assessment: id });
    // Seed an isolated pre-existing official record; exercise no production records.
    await h.db.query(
      "update public.attempts set status='graded',receipt=$2,submitted_at=now() where id=$1",
      [submitted.id, crypto.randomUUID()],
    );
    await h.db.query(
      'insert into public.grading_summaries(attempt_id,practical_score,theory_score,released,feedback) values($1,60,19.75,true,$2)',
      [submitted.id, 'Existing official grade'],
    );
    await h.db.query(
      "insert into public.student_answers(attempt_id,question_id,answer) values($1,'q1','Existing retained answer')",
      [submitted.id],
    );
    await h.db.query(
      "insert into public.task_results(attempt_id,task_key,passed,points) values($1,'repo',true,5)",
      [submitted.id],
    );
    const retained = async () => ({
      attempts: (
        await h.db.query('select * from public.attempts where id=any($1::uuid[]) order by id', [
          [old.id, submitted.id],
        ])
      ).rows,
      grades: (
        await h.db.query('select * from public.grading_summaries where attempt_id=$1', [
          submitted.id,
        ])
      ).rows,
      answers: (
        await h.db.query('select * from public.student_answers where attempt_id=$1', [submitted.id])
      ).rows,
      tasks: (
        await h.db.query('select * from public.task_results where attempt_id=$1', [submitted.id])
      ).rows,
      version: (
        await h.db.query(
          'select * from public.assessment_versions where assessment_id=$1 and version=1',
          [id],
        )
      ).rows,
      keys: (
        await h.db.query(
          'select * from private.assessment_keys where assessment_id=$1 and version=1',
          [id],
        )
      ).rows,
    });
    const before = await retained(),
      d = weightedFundamentalsFixture();
    assertDefinition(d);
    expect(totals(d)).toEqual({ practical: 75, theory: 25, bonus: 10 });
    expect(d.sections.flatMap((s) => s.tasks).map((t) => t.points)).toEqual(
      firstAssessment.sections.flatMap((s) => s.tasks).map((t) => t.points),
    );
    await h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: d, p_publish: true });
    expect(
      (await h.rpc(STUDENT, 'assessment_state', { p_attempt: old.id })).definition.gradingPolicy,
    ).toBeUndefined();
    const fresh = await h.rpc(TEACHER, 'start_assessment', { p_assessment: id });
    const e = await engine();
    const v = await verifyAssessment(
      d,
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(v.practicalScore).toBeGreaterThan(0);
    expect(v.practicalScore).toBeLessThan(75);
    const receipt = (
      await h.db.query<any>(
        'select public.accept_assessment_checkpoint($1,$2,0,$3,$4,$5,$6,0,true,$7) as result',
        [
          TEACHER,
          fresh.id,
          JSON.stringify(v.payload),
          JSON.stringify(v.outcomes),
          JSON.stringify(v.grades),
          v.practicalScore,
          crypto.randomUUID(),
        ],
      )
    ).rows[0].result.receipt;
    expect(receipt).toBeTruthy();
    await h.rpc(TEACHER, 'grade_assessment', {
      p_attempt: fresh.id,
      p_grades: d.questions
        .filter((q) => q.manual && q.points > 0)
        .map((q) => ({ question_id: q.id, points: 0 })),
      p_feedback: 'Isolated partial submission audit',
      p_release: true,
    });
    const final = await h.rpc(TEACHER, 'assessment_state', { p_attempt: fresh.id });
    expect(final.assignment_version).toBe(2);
    expect(final.receipt).toBe(receipt);
    expect(final.definition.gradingPolicy).toBe('requirements-v1');
    expect(
      Number(
        (
          await h.db.query<any>(
            'select practical_score from public.released_results where attempt_id=$1',
            [fresh.id],
          )
        ).rows[0].practical_score,
      ),
    ).toBe(v.practicalScore);
    expect(await retained()).toEqual(before);
    assertDefinition(weightedFundamentalsFixture(correctedAssignment()));
  });
  it('accepts informational tasks without weights, rejecting scored weights on those tasks', async () => {
    const d = definition();
    d.sections[0].tasks[0].points = 0;
    delete d.sections[0].tasks[0].requirementWeights;
    expect(
      await h.rpc(TEACHER, 'save_assessment', { p_id: null, p_document: d, p_publish: true }),
    ).toBeTruthy();
    d.sections[0].tasks[0].requirementWeights = { 'files:rule-0-exists': 1 };
    await expect(
      h.rpc(TEACHER, 'save_assessment', { p_id: null, p_document: d, p_publish: true }),
    ).rejects.toThrow(/Informational/);
  });
  it('rejects invalid direct publications and untrusted checkpoint writes', async () => {
    const d = definition();
    d.sections[0].tasks[0].requirementWeights!['files:rule-0-exists'] = 1;
    await expect(
      h.rpc(TEACHER, 'save_assessment', { p_id: null, p_document: d, p_publish: true }),
    ).rejects.toThrow(/total/);
    await expect(
      h.asUser(
        STUDENT,
        'select public.accept_assessment_checkpoint($1,$1,0,$2,$3,$3,10,0,true,$1)',
        [STUDENT, '{}', '[]'],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.rpc(STUDENT, 'save_assessment', { p_id: null, p_document: definition(), p_publish: true }),
    ).rejects.toThrow(/authorization/);
  });
  it('finalizes incomplete work for earned points, persists breakdown and keeps old attempts pinned through publication', async () => {
    const d = definition();
    delete d.gradingPolicy;
    d.requireComplete = true;
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: d,
      p_publish: true,
    });
    const old = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
    await h.rpc(TEACHER, 'save_assessment', {
      p_id: id,
      p_document: definition(),
      p_publish: true,
    });
    const oldState = await h.rpc(STUDENT, 'assessment_state', { p_attempt: old.id });
    expect(oldState.assignment_version).toBe(1);
    expect(oldState.definition.gradingPolicy).toBeUndefined();
    const fresh = await h.rpc(ADMIN, 'start_assessment', { p_assessment: id });
    const e = await engine();
    await e.write('about.txt', 'Wrong text');
    const v = await verifyAssessment(
      definition(),
      { snapshot: e.fs.snapshot(), answers: {}, events: e.events },
      identity,
      {},
    );
    expect(v.practicalScore).toBe(2);
    const result = await h.db.query<any>(
      'select public.accept_assessment_checkpoint($1,$2,0,$3,$4,$5,$6,0,true,$7) as result',
      [
        ADMIN,
        fresh.id,
        JSON.stringify(v.payload),
        JSON.stringify(v.outcomes),
        JSON.stringify(v.grades),
        v.practicalScore,
        crypto.randomUUID(),
      ],
    );
    expect(result.rows[0].result.receipt).toBeTruthy();
    const rows = (
      await h.db.query<any>(
        'select task_key,passed,points,requirement_results from public.task_results where attempt_id=$1 order by task_key',
        [fresh.id],
      )
    ).rows;
    expect(rows.find((r) => r.task_key === 'files')).toMatchObject({ passed: false, points: '2' });
    expect(rows.find((r) => r.task_key === 'files').requirement_results).toHaveLength(3);
    expect(
      Number(
        (
          await h.db.query<any>(
            'select practical_score from public.grading_summaries where attempt_id=$1',
            [fresh.id],
          )
        ).rows[0].practical_score,
      ),
    ).toBe(2);
    const ownedId = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(),
      p_publish: true,
    });
    const owned = await h.rpc(STUDENT, 'start_assessment', { p_assessment: ownedId });
    await h.db.query('select public.accept_assessment_checkpoint($1,$2,0,$3,$4,$5,$6,0,true,$7)', [
      STUDENT,
      owned.id,
      JSON.stringify(v.payload),
      JSON.stringify(v.outcomes),
      JSON.stringify(v.grades),
      v.practicalScore,
      crypto.randomUUID(),
    ]);
    expect(
      (await h.asUser(STUDENT, 'select * from public.task_results where attempt_id=$1', [owned.id]))
        .rows,
    ).toHaveLength(2);
    expect(
      (await h.asUser(STUDENT, 'select * from public.task_results where attempt_id=$1', [fresh.id]))
        .rows,
    ).toHaveLength(0);
    await h.db.query('update public.grading_summaries set released=false where attempt_id=$1', [
      owned.id,
    ]);
    expect(
      (await h.asUser(STUDENT, 'select * from public.task_results where attempt_id=$1', [owned.id]))
        .rows,
    ).toHaveLength(0);
    const before = JSON.stringify(rows);
    await h.rpc(TEACHER, 'save_assessment', {
      p_id: id,
      p_document: definition(),
      p_publish: true,
    });
    expect(
      JSON.stringify(
        (
          await h.db.query(
            'select task_key,passed,points,requirement_results from public.task_results where attempt_id=$1 order by task_key',
            [fresh.id],
          )
        ).rows,
      ),
    ).toBe(before);
    expect(
      (await h.rpc(ADMIN, 'assessment_state', { p_attempt: fresh.id })).assignment_version,
    ).toBe(2);
  });
  it('preserves deadline expiry, exam duration and attempt-limit checks under the new policy', async () => {
    const d = definition();
    d.type = 'exam';
    d.durationMinutes = 1;
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: d,
      p_publish: true,
    });
    const started = await h.rpc(STUDENT, 'start_assessment', { p_assessment: id });
    const state = await h.rpc(STUDENT, 'assessment_state', { p_attempt: started.id });
    expect(Date.parse(state.deadline_at) - Date.parse(state.created_at)).toBe(60000);
    await h.db.query(
      "update public.attempts set deadline_at=now()-interval '1 second' where id=$1",
      [started.id],
    );
    expect((await h.rpc(STUDENT, 'assessment_state', { p_attempt: started.id })).status).toBe(
      'expired',
    );
    await expect(h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).rejects.toThrow(/limit/);
    const closed = definition();
    closed.deadline = '2000-01-01T00:00:00Z';
    const closedId = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: closed,
      p_publish: true,
    });
    await expect(h.rpc(STUDENT, 'start_assessment', { p_assessment: closedId })).rejects.toThrow(
      /closed/,
    );
  });
  it('keeps SQL and authoritative check catalogs aligned for every compatibility revision', async () => {
    for (const revision of [1, 2] as const) {
      const d = structuredClone(firstAssessment);
      d.gradingPolicy = 'requirements-v1';
      d.requireComplete = false;
      d.gateTheory = false;
      for (const t of d.sections.flatMap((s) => s.tasks)) {
        t.rules = t.rules.map((r) => ({ ...r, revision }));
        const checks = requirementCatalog(t);
        t.points = checks.length;
        t.requirementWeights = Object.fromEntries(checks.map((c) => [c.id, 1]));
      }
      assertDefinition(d);
      expect(
        await h.rpc(TEACHER, 'save_assessment', { p_id: null, p_document: d, p_publish: true }),
      ).toBeTruthy();
    }
  });
});
