import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { TASK_ONE_ID } from '../../src/features/assignments/assignment';
import { taskOneDefinition } from '../../src/features/assessments/taskOne';
import { managementDatabase, STUDENT, TEACHER } from '../helpers/managementDatabase';

const migration = readFileSync('supabase/migrations/20261110000000_independent_task1.sql', 'utf8');
const oldAssessment = 'b6f4b6d0-5fe2-4e4d-b9a5-000000000001';
const previous = '10000000-0000-4000-8000-000000000004';
const current = '10000000-0000-4000-8000-000000000005';

it('removes populated legacy attempts and retired interfaces while preserving shared data', async () => {
  const h = await managementDatabase({ beforeCutover: true });
  try {
    await h.db.exec(`
      insert into public.attempts(id,student_id,assignment_id,assignment_version,attempt_number,status)
      values('${previous}','${STUDENT}','${oldAssessment}',1,1,'submitted'),
            ('${current}','${STUDENT}','${oldAssessment}',1,2,'in_progress');
      update public.attempts set restarted_to='${current}' where id='${previous}';
      insert into public.workspace_snapshots(attempt_id,snapshot) values('${previous}','{}');
      insert into public.command_events(attempt_id,sequence,event) values('${previous}',1,'{}');
      insert into public.student_answers(attempt_id,question_id,answer)
        values('${previous}','fixture','Synthetic written answer');
      insert into public.grading_results(attempt_id,question_id,points,grader_id)
        values('${previous}','fixture',3,'${TEACHER}');
      insert into public.grading_summaries(attempt_id,practical_score,released)
        values('${previous}',37,true);
      insert into public.task_results(attempt_id,task_key,passed,points)
        values('${previous}','fixture',true,2);
      insert into private.verified_checkpoints
        (attempt_id,revision,payload,outcomes,objective_grades,practical_score,objective_score)
        values('${current}',1,'{}','[]','[]',0,0);
      insert into public.attempt_help_requests(attempt_id,student_id,message)
        values('${current}','${STUDENT}','Synthetic help request');
      insert into public.question_bank(document) values('{}');
      insert into public.audit_logs(actor_id,action,target_id)
        values('${STUDENT}','assessment.submitted','${previous}');
      insert into public.admin_activity(actor_id,action,record_type,record_id)
        values('${TEACHER}','fixture.audit','attempt','${previous}');
    `);
    const lesson = await h.rpc(TEACHER, 'manage_learning_save', {
      p_id: null,
      p_kind: 'lesson',
      p_parent: '70000000-0000-4000-8000-000000000002',
      p_document: {
        title: 'Synthetic teaching session',
        body: '',
        links: [],
        video_url: 'https://drive.google.com/file/d/abcdefghij123/view',
      },
      p_revision: null,
      p_publish: true,
    });
    const material = crypto.randomUUID();
    await h.db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      await tx.query("select set_config('request.jwt.claim.role','service_role',true)");
      await tx.query('select public.register_learning_material($1,$2,$3,$4,$5)', [
        TEACHER,
        material,
        lesson,
        'Fixture.pptx',
        1000,
      ]);
    });
    await h.db.query(
      "insert into storage.objects(bucket_id,name) values('learning-presentations',$1)",
      [lesson + '/' + material + '.pptx'],
    );

    const preserve = [
      'auth.users',
      'public.profiles',
      'private.instructors',
      'private.data_administrators',
      'public.learning_items',
      'public.learning_versions',
      'private.learning_drafts',
      'public.learning_materials',
      'storage.buckets',
      'storage.objects',
      'public.admin_activity',
      'public.audit_logs',
    ];
    const fingerprints = () =>
      Promise.all(
        preserve.map(
          async (table) =>
            (
              await h.db.query(
                `select count(*)::int, md5(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text)) from ${table} t`,
              )
            ).rows,
        ),
      );
    const before = await fingerprints();
    await h.db.exec(migration);
    expect(await fingerprints()).toEqual(before);
    for (const table of [
      'public.attempts',
      'public.workspace_snapshots',
      'public.command_events',
      'public.student_answers',
      'public.grading_results',
      'public.grading_summaries',
      'public.task_results',
      'private.verified_checkpoints',
      'public.attempt_help_requests',
      'public.question_bank',
      'public.student_enrollments',
    ]) {
      expect((await h.db.query(`select count(*)::int as count from ${table}`)).rows).toEqual([
        { count: 0 },
      ]);
    }
    expect(
      (
        await h.db.query(
          "select count(*)::int as count from private.record_management where kind in ('attempt','request','question')",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    for (const table of [
      'private.question_rubrics',
      'public.questions',
      'public.assignment_tasks',
      'public.assignment_sections',
      'public.workspace_drafts',
    ]) {
      expect((await h.db.query('select to_regclass($1) as relation', [table])).rows).toEqual([
        { relation: null },
      ]);
    }
    expect(
      (await h.db.query("select to_regprocedure('public.start_attempt(uuid)') as legacy")).rows,
    ).toEqual([{ legacy: null }]);
    expect(
      (await h.db.query('select id,course_slot,published_version from public.assignments')).rows,
    ).toEqual([{ id: TASK_ONE_ID, course_slot: 'task1', published_version: 1 }]);
    const { rows } = await h.db.query(
      'select document from public.assessment_versions where assessment_id=$1 and version=1',
      [TASK_ONE_ID],
    );
    const expected = taskOneDefinition();
    const publicQuestions = expected.questions.map((question) => {
      const { correctAnswers, explanation, ...publicQuestion } = question;
      void correctAnswers;
      void explanation;
      return publicQuestion;
    });
    expect(rows).toEqual([
      { document: JSON.parse(JSON.stringify({ ...expected, questions: publicQuestions })) },
    ]);
    await expect(
      h.rpc(STUDENT, 'start_assessment', { p_assessment: oldAssessment }),
    ).rejects.toThrow();
  } finally {
    await h.db.close();
  }
}, 30000);

it('aborts and rolls back if an unreviewed foreign key points to legacy assessment data', async () => {
  const h = await managementDatabase({ beforeCutover: true });
  try {
    await h.db.exec(
      'create table public.unknown_assessment_use(id uuid references public.assignments(id))',
    );
    await expect(h.db.exec(migration)).rejects.toThrow(/dependenc|foreign key/i);
    await h.db.exec('rollback');
    expect(
      (await h.db.query('select id from public.assignments where id=$1', [oldAssessment])).rows,
    ).toEqual([{ id: oldAssessment }]);
    expect(
      (
        await h.db.query(
          "select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='assignments' and column_name='course_slot'",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await h.db.close();
  }
}, 30000);
