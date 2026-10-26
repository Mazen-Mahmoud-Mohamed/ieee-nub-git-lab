import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import {
  blankDefinition,
  firstAssessment,
  type Definition,
} from '../../src/features/assessments/model';
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222',
  I = '33333333-3333-4333-8333-333333333333';
const LEGACY = '44444444-4444-4444-8444-444444444444';
let db: PGlite;
let assignment: string, exam: string, examAttempt: string;
const q = (v: unknown) =>
  "'" + String(typeof v === 'object' ? JSON.stringify(v) : v).replaceAll("'", "''") + "'";
async function user(id: string, sql: string) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
  return db.query<any>(sql);
}
async function root(sql: string) {
  await db.exec('reset role');
  return db.query<any>(sql);
}
const def = (type: 'assignment' | 'exam' = 'assignment'): Definition => ({
  ...blankDefinition(type),
  title: 'Git concepts',
  format: 'theory',
  questions: [
    {
      id: 'q-objective',
      prompt: 'Is Git local version control?',
      kind: 'boolean',
      options: ['True', 'False'],
      correctAnswers: ['True'],
      manual: false,
      required: true,
      points: 10,
    },
    {
      id: 'q-written',
      prompt: 'Explain staging.',
      kind: 'long',
      options: [],
      manual: true,
      required: true,
      points: 5,
    },
  ],
});
const publish = async (d: Definition, id?: string) =>
  (await user(I, `select public.save_assessment(${id ? q(id) : 'null'},${q(d)},true) as id`))
    .rows[0].id as string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid(),auth.role() to authenticated,service_role;`,
  );
  await db.exec(readFileSync('supabase/migrations/20261026130655_initial_git_lab.sql', 'utf8'));
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  await db.exec(
    `insert into auth.users values('${A}',now()),('${B}',now()),('${I}',now());insert into private.instructors(user_id) values('${I}');insert into public.profiles values('${A}','Student A','A001','Nahda University','Engineering','2',now()),('${B}','Student B','B001','Nahda University','Science','2',now());`,
  );
  await db.exec(
    `insert into public.attempts(id,student_id,assignment_id,assignment_version,status,receipt,submitted_at) values('${LEGACY}','${A}','b6f4b6d0-5fe2-4e4d-b9a5-000000000001',1,'submitted',gen_random_uuid(),now());insert into public.student_answers(attempt_id,question_id,answer) values('${LEGACY}','q1','Existing answer preserved');insert into public.grading_summaries(attempt_id,practical_score) values('${LEGACY}',75);`,
  );
  await db.exec(
    readFileSync('supabase/migrations/20261026160527_reusable_assessments_and_exams.sql', 'utf8'),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential('versioned assessment and timed exam lifecycle', () => {
  it('retains existing submissions, written answers and grades during migration', async () => {
    const result = await user(
      A,
      `select answer from public.student_answers where attempt_id='${LEGACY}'`,
    );
    expect(result.rows[0].answer).toBe('Existing answer preserved');
    expect(
      (await user(A, `select status from public.attempts where id='${LEGACY}'`)).rows[0].status,
    ).toBe('submitted');
    expect(
      Number(
        (
          await user(
            I,
            `select practical_score from public.grading_summaries where attempt_id='${LEGACY}'`,
          )
        ).rows[0].practical_score,
      ),
    ).toBe(75);
  });
  it('preserves the original Assignment 01 and hides private answer keys', async () => {
    const rows = await user(A, 'select document from public.assessment_versions');
    expect(rows.rows[0].document.title).toBe(firstAssessment.title);
    expect(JSON.stringify(rows.rows)).not.toContain('correctAnswers');
    await expect(user(A, 'select * from private.assessment_keys')).rejects.toThrow();
  });
  it('lets instructors create multiple assignments but rejects student authoring', async () => {
    assignment = await publish(def());
    const second = await publish({ ...def(), title: 'Second assignment' });
    expect(second).not.toBe(assignment);
    await expect(user(A, `select public.save_assessment(null,${q(def())},true)`)).rejects.toThrow(
      'Instructor',
    );
    const versions = await user(
      A,
      `select document from public.assessment_versions where assessment_id='${assignment}'`,
    );
    expect(JSON.stringify(versions.rows)).not.toContain('correctAnswers');
  });
  it('publishes, unpublishes, duplicates and archives definitions without deleting data', async () => {
    const copy = (await user(I, `select public.duplicate_assessment('${assignment}') as id`))
      .rows[0].id;
    expect(
      (await user(A, `select * from public.assessment_drafts where assessment_id='${copy}'`)).rows,
    ).toHaveLength(0);
    await user(I, `select public.set_assessment_visibility('${assignment}',false,false)`);
    await expect(user(A, `select public.start_assessment('${assignment}')`)).rejects.toThrow(
      'not published',
    );
    await user(I, `select public.set_assessment_visibility('${assignment}',true,false)`);
  });
  it('pins active attempts to an immutable version and isolates students', async () => {
    const result = await user(A, `select public.start_assessment('${assignment}') as result`);
    const id = result.rows[0].result.id;
    await publish({ ...def(), title: 'Changed question set' }, assignment);
    const state = (await user(A, `select public.assessment_state('${id}') as result`)).rows[0]
      .result;
    expect(state.assignment_version).toBe(1);
    expect(state.definition.title).toBe('Git concepts');
    await expect(user(B, `select public.assessment_state('${id}')`)).rejects.toThrow('authorized');
    await expect(
      root(
        `update public.assessment_versions set document='{}' where assessment_id='${assignment}'`,
      ),
    ).rejects.toThrow('immutable');
  });
  it('records a server exam deadline and resumes it across tabs, refresh and forged browser clocks', async () => {
    exam = await publish({ ...def('exam'), title: 'Timed Git exam' });
    examAttempt = (await user(A, `select public.start_assessment('${exam}') as result`)).rows[0]
      .result.id;
    const first = (await user(A, `select public.assessment_state('${examAttempt}') as result`))
      .rows[0].result;
    const again = (await user(A, `select public.start_assessment('${exam}') as result`)).rows[0]
      .result;
    expect(again.id).toBe(examAttempt);
    const resumed = (await user(A, `select public.assessment_state('${examAttempt}') as result`))
      .rows[0].result;
    expect(resumed.deadline_at).toBe(first.deadline_at);
    expect(Date.parse(first.deadline_at) - Date.parse(first.created_at)).toBe(30 * 60000);
    await expect(
      user(
        A,
        `update public.attempts set deadline_at=now()+interval '1 day' where id='${examAttempt}'`,
      ),
    ).rejects.toThrow();
  });
  it('rejects direct checkpoint/grade calls from students and prevents stale tab overwrites', async () => {
    await expect(
      user(
        A,
        `select public.accept_assessment_checkpoint('${A}','${examAttempt}',0,'{}','[]','[]',0,0,false,gen_random_uuid())`,
      ),
    ).rejects.toThrow();
    const payload = {
      snapshot: { version: 1, entries: { '/': { kind: 'dir', data: [] } } },
      answers: { 'q-objective': 'True', 'q-written': 'My explanation' },
      events: [],
    };
    await root(
      `select public.accept_assessment_checkpoint('${A}','${examAttempt}',0,${q(payload)},'[]','[{"question_id":"q-objective","points":10}]',0,10,false,gen_random_uuid())`,
    );
    await expect(
      root(
        `select public.accept_assessment_checkpoint('${A}','${examAttempt}',0,${q(payload)},'[]','[]',0,0,false,gen_random_uuid())`,
      ),
    ).rejects.toThrow('conflict');
    await expect(
      user(A, `select public.save_checkpoint('${examAttempt}','{"version":1}')`),
    ).rejects.toThrow('verified');
  });
  it('automatically freezes abandoned exams using only the last accepted work, even during network loss', async () => {
    await root(
      `update public.attempts set deadline_at=clock_timestamp()-interval '1 second' where id='${examAttempt}'`,
    );
    expect((await root('select public.expire_due_attempts() as count')).rows[0].count).toBe(1);
    const state = (await user(A, `select public.assessment_state('${examAttempt}') as result`))
      .rows[0].result;
    expect(state.status).toBe('expired');
    expect(state.auto_submitted).toBe(true);
    expect(state.receipt).toBeTruthy();
    const late = await root(
      `select public.accept_assessment_checkpoint('${A}','${examAttempt}',1,'{"answers":{"q-written":"late forged answer"}}','[]','[]',0,0,true,gen_random_uuid()) as result`,
    );
    expect(late.rows[0].result.receipt).toBe(state.receipt);
    expect(
      (
        await user(
          A,
          `select answer from public.student_answers where attempt_id='${examAttempt}' and question_id='q-written'`,
        )
      ).rows[0].answer,
    ).toBe('My explanation');
    await expect(user(A, `select public.start_assessment('${exam}')`)).rejects.toThrow('limit');
  });
  it('grades written answers separately and releases only to the owner', async () => {
    await expect(
      user(A, `select public.grade_assessment('${examAttempt}','[]','fake',true)`),
    ).rejects.toThrow('Instructor');
    await user(
      I,
      `select public.grade_assessment('${examAttempt}','[{"question_id":"q-written","points":4}]','Good reasoning',false)`,
    );
    expect(
      (await user(A, `select * from public.released_results where attempt_id='${examAttempt}'`))
        .rows,
    ).toHaveLength(0);
    await user(
      I,
      `select public.grade_assessment('${examAttempt}','[{"question_id":"q-written","points":4}]','Good reasoning',true)`,
    );
    expect(
      Number(
        (
          await user(
            A,
            `select theory_score from public.released_results where attempt_id='${examAttempt}'`,
          )
        ).rows[0].theory_score,
      ),
    ).toBe(14);
    expect((await user(B, 'select * from public.released_results')).rows).toHaveLength(0);
  });
  it('closes the legacy untimed-exam start bypass and denies hidden private contexts', async () => {
    await expect(user(A, `select public.start_attempt('${exam}')`)).rejects.toThrow('limit');
    await expect(
      user(A, `select public.assessment_verification_context('${examAttempt}','${A}')`),
    ).rejects.toThrow();
  });
});
