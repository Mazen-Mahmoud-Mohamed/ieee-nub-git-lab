import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { managementDatabase, ADMIN, TEACHER, STUDENT } from '../helpers/managementDatabase';
import { blankDefinition } from '../../src/features/assessments/model';
let h: Awaited<ReturnType<typeof managementDatabase>>;
beforeAll(async () => {
  h = await managementDatabase();
}, 30000);
afterAll(async () => {
  await h?.db.close();
});
const definition = (publish = false) => ({
  ...blankDefinition(),
  title: 'Managed assessment',
  format: 'theory',
  questions: publish
    ? [
        {
          id: 'q',
          prompt: 'Explain Git',
          kind: 'long',
          manual: true,
          required: true,
          points: 5,
          options: [],
        },
      ]
    : [],
});
const preview = (kind: string, id: string, actor = ADMIN) =>
  h.rpc(actor, 'manage_preview', { p_kind: kind, p_id: id });
async function change(kind: string, id: string, action: string, actor = ADMIN) {
  const row = await preview(kind, id, actor);
  return h.rpc(actor, 'manage_records', {
    p_kind: kind,
    p_records: [{ id, revision: row.revision }],
    p_action: action,
    p_reason: 'Administrative test reason',
    p_confirmation: (action === 'purge' ? 'DELETE' : action.toUpperCase()) + ' 1',
  });
}
describe.sequential('management policies and real PostgreSQL operations', () => {
  it('loads additive migrations and never grants implicit administrator privilege', async () => {
    expect(await h.rpc(ADMIN, 'is_data_administrator')).toBe(true);
    expect(await h.rpc(TEACHER, 'is_data_administrator')).toBe(false);
    expect(await h.rpc(STUDENT, 'is_data_administrator')).toBe(false);
    await expect(h.rpc(null, 'manage_list', { p_kind: 'attempt' })).rejects.toThrow('permission');
    await expect(h.rpc(STUDENT, 'manage_list', { p_kind: 'attempt' })).rejects.toThrow(
      'Instructor',
    );
    await expect(
      h.asUser(TEACHER, `insert into private.data_administrators(user_id) values('${TEACHER}')`),
    ).rejects.toThrow('permission');
  });
  it('archives, restores and permanently deletes only an unpublished assessment and retains its audit', async () => {
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(),
      p_publish: false,
    });
    await change('assessment', id, 'archive', TEACHER);
    expect((await preview('assessment', id)).archived).toBe(true);
    await change('assessment', id, 'restore');
    expect((await preview('assessment', id)).archived).toBe(false);
    await change('assessment', id, 'trash');
    await expect(
      h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: definition(), p_publish: false }),
    ).rejects.toThrow('Trash');
    await change('assessment', id, 'purge');
    expect(
      (await h.db.query('select id from public.assignments where id=$1', [id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await h.db.query(
          "select * from public.admin_activity where record_id=$1 and action='purge'",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      h.asUser(ADMIN, 'delete from public.admin_activity where record_id=$1', [id]),
    ).rejects.toThrow('permission');
  });
  it('protects published versions, submitted exams and official grades from trash, purge and invalidation', async () => {
    const doc = { ...definition(true), type: 'exam', durationMinutes: 20 };
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: doc,
      p_publish: true,
    });
    const attempt = (await h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).id;
    await expect(change('attempt', attempt, 'invalidate')).rejects.toThrow('not permitted');
    await h.db.query('select private.finish_assessment($1,false)', [attempt]);
    await h.rpc(TEACHER, 'grade_assessment', {
      p_attempt: attempt,
      p_grades: [{ question_id: 'q', points: 5 }],
      p_feedback: 'Released official exam grade',
      p_release: true,
    });
    const before = (
      await h.db.query(
        'select to_jsonb(g) as data from public.grading_summaries g where attempt_id=$1',
        [attempt],
      )
    ).rows;
    for (const [kind, target] of [
      ['assessment', id],
      ['attempt', attempt],
    ]) {
      await expect(change(kind, target, 'trash')).rejects.toThrow('not permitted');
      await expect(change(kind, target, 'purge')).rejects.toThrow('not permitted');
    }
    await change('attempt', attempt, 'archive');
    await change('attempt', attempt, 'restore');
    expect(
      (
        await h.db.query(
          'select to_jsonb(g) as data from public.grading_summaries g where attempt_id=$1',
          [attempt],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (await h.db.query('select * from public.assessment_versions where assessment_id=$1', [id]))
        .rows,
    ).toHaveLength(1);
  });
  it('invalidates an assignment without resetting limits, permits reversible Trash, and blocks all later grading', async () => {
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(true),
      p_publish: true,
    });
    const a = (await h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).id;
    await expect(change('attempt', a, 'invalidate', TEACHER)).rejects.toThrow('not permitted');
    await expect(change('attempt', a, 'invalidate', STUDENT)).rejects.toThrow('Instructor');
    await change('attempt', a, 'invalidate');
    const state = await h.rpc(STUDENT, 'assessment_state', { p_attempt: a });
    expect(state.status).toBe('invalidated');
    await expect(
      h.db.query(
        `select public.accept_assessment_checkpoint($1,$2,0,'{}','[]','[]',0,0,false,$3)`,
        [STUDENT, a, crypto.randomUUID()],
      ),
    ).rejects.toThrow('finalized');
    expect(state.invalidation_reason).toBe('Administrative test reason');
    await expect(h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).rejects.toThrow('limit');
    await expect(
      h.rpc(TEACHER, 'grade_assessment', {
        p_attempt: a,
        p_grades: [{ question_id: 'q', points: 5 }],
        p_feedback: 'test',
        p_release: true,
      }),
    ).rejects.toThrow('Invalidated');
    await expect(
      h.rpc(TEACHER, 'instructor_save_grade_draft', { p_attempt: a, p_grades: [], p_feedback: '' }),
    ).rejects.toThrow('Invalidated');
    const beforeTrash = await preview('attempt', a);
    await h.rpc(ADMIN, 'manage_records', {
      p_kind: 'attempt',
      p_records: [{ id: a, revision: beforeTrash.revision }],
      p_action: 'trash',
      p_reason: 'Housekeeping only',
      p_confirmation: 'TRASH 1',
    });
    expect((await h.rpc(STUDENT, 'assessment_state', { p_attempt: a })).invalidation_reason).toBe(
      'Administrative test reason',
    );
    await expect(h.rpc(STUDENT, 'start_assessment', { p_assessment: id })).rejects.toThrow('limit');
    await change('attempt', a, 'restore');
    expect((await h.rpc(STUDENT, 'assessment_state', { p_attempt: a })).status).toBe('invalidated');
    expect(
      (await h.db.query('select * from public.grading_results where attempt_id=$1', [a])).rows,
    ).toHaveLength(0);
    await expect(change('attempt', a, 'purge')).rejects.toThrow('not permitted');
  });
  it('applies a bulk operation atomically, rejects stale confirmations and never allows duplicate or unbounded selections', async () => {
    const make = () =>
      h.rpc(TEACHER, 'save_bank_question', {
        p_id: null,
        p_document: {
          id: crypto.randomUUID(),
          prompt: 'Bulk question',
          kind: 'long',
          points: 1,
          manual: true,
          required: true,
          options: [],
        },
      });
    const ids = [await make(), await make()];
    const rows = await Promise.all(ids.map((id) => preview('question', id)));
    const args = {
      p_kind: 'question',
      p_records: rows.map((r) => ({ id: r.id, revision: r.revision })),
      p_action: 'archive',
      p_reason: 'Obsolete bank copies',
      p_confirmation: 'ARCHIVE 2',
    };
    const outcomes = await Promise.allSettled([
      h.rpc(TEACHER, 'manage_records', args),
      h.rpc(TEACHER, 'manage_records', args),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await preview('question', ids[0])).archived).toBe(true);
    await change('question', ids[0], 'restore');
    await change('question', ids[1], 'restore');
    const refreshed = await Promise.all(ids.map((id) => preview('question', id)));
    refreshed[1].revision = -1;
    await expect(
      h.rpc(TEACHER, 'manage_records', {
        ...args,
        p_records: refreshed.map((r) => ({ id: r.id, revision: r.revision })),
      }),
    ).rejects.toThrow('changed');
    expect((await preview('question', ids[0])).archived).toBe(false);
    await expect(
      h.rpc(TEACHER, 'manage_records', {
        ...args,
        p_records: [...args.p_records, ...args.p_records],
        p_confirmation: 'ARCHIVE 4',
      }),
    ).rejects.toThrow(/twice|changed/);
    await expect(
      h.rpc(TEACHER, 'manage_records', {
        ...args,
        p_records: Array(26).fill(args.p_records[0]),
        p_confirmation: 'ARCHIVE 26',
      }),
    ).rejects.toThrow('25');
  });
  it('manages real course/section/lesson drafts, publishes private-safe snapshots and preserves resource history', async () => {
    const save = (
      id: string | null,
      kind: string,
      parent: string | null,
      title: string,
      rev: number | null,
      publish: boolean,
    ) =>
      h.rpc(TEACHER, 'manage_learning_save', {
        p_id: id,
        p_kind: kind,
        p_parent: parent,
        p_document: {
          title,
          body: 'Text for learners',
          links: [{ label: 'Git documentation', url: 'https://git-scm.com/docs' }],
        },
        p_revision: rev,
        p_publish: publish,
      });
    const course = await save(null, 'course', null, 'Test course', null, true);
    const section = await save(null, 'section', course, 'Section one', null, true);
    const lesson = await save(null, 'lesson', section, 'Published lesson', null, true);
    await expect(
      h.db.query(
        "insert into public.learning_items(kind,parent_id,title) values('lesson',$1,'Invalid nesting')",
        [course],
      ),
    ).rejects.toThrow('relationship');
    const edit = await h.rpc(TEACHER, 'manage_learning_edit', { p_id: lesson });
    await save(lesson, 'lesson', section, 'Private draft text', edit.revision, false);
    expect(
      (await h.rpc(null, 'learning_catalog', { p_parent: section })).rows[0].document.title,
    ).toBe('Published lesson');
    await expect(h.rpc(STUDENT, 'manage_learning_edit', { p_id: lesson })).rejects.toThrow(
      'Instructor',
    );
    await expect(h.asUser(STUDENT, 'select * from private.learning_drafts')).rejects.toThrow(
      'permission',
    );
    await expect(change('learning', course, 'trash')).rejects.toThrow('not permitted');
    await change('learning', course, 'archive');
    await expect(h.rpc(null, 'learning_catalog', { p_parent: lesson })).rejects.toThrow(
      'unavailable',
    );
    await change('learning', course, 'restore');
    expect((await h.rpc(null, 'learning_catalog', { p_parent: section })).rows).toHaveLength(1);
    await change('learning', lesson, 'trash');
    await expect(change('learning', lesson, 'purge')).rejects.toThrow('not permitted');
    await change('learning', lesson, 'restore');
    const draft = await save(null, 'lesson', section, 'Never published', null, false);
    await change('learning', draft, 'trash');
    await change('learning', draft, 'purge');
    expect(
      (await h.db.query('select * from public.learning_items where id=$1', [draft])).rows,
    ).toHaveLength(0);
    expect(
      (await h.db.query('select * from public.learning_versions where item_id=$1', [lesson])).rows,
    ).toHaveLength(1);
    await expect(
      save(null, 'course', null, 'Bad links', null, true).then(() =>
        h.rpc(TEACHER, 'manage_learning_save', {
          p_id: null,
          p_kind: 'course',
          p_parent: null,
          p_document: {
            title: 'Unsafe link',
            body: '',
            links: [{ label: 'unsafe', url: 'javascript:alert(1)' }],
          },
          p_revision: null,
          p_publish: true,
        }),
      ),
    ).rejects.toThrow('HTTPS');
  });
  it('filters actual attempts by assigned course and retains resolved requests while archiving them', async () => {
    const course = await h.rpc(TEACHER, 'manage_learning_save', {
      p_id: null,
      p_kind: 'course',
      p_parent: null,
      p_document: { title: 'Filter course', body: '', links: [] },
      p_revision: null,
      p_publish: false,
    });
    const assessment = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(true),
      p_publish: true,
    });
    const v = await preview('assessment', assessment);
    await h.rpc(TEACHER, 'manage_assessment_course', {
      p_assessment: assessment,
      p_course: course,
      p_revision: v.revision,
    });
    const attempt = (await h.rpc(STUDENT, 'start_assessment', { p_assessment: assessment })).id;
    expect(
      (
        await h.rpc(TEACHER, 'manage_attempts', { p_course: course, p_submitted_only: false })
      ).rows.some((r: any) => r.id === attempt),
    ).toBe(true);
    await expect(
      h.rpc(TEACHER, 'manage_assessment_course', {
        p_assessment: assessment,
        p_course: null,
        p_revision: v.revision,
      }),
    ).rejects.toThrow('changed');
    const request = await h.rpc(STUDENT, 'request_attempt_help', {
      p_attempt: attempt,
      p_message: 'Help with history',
    });
    await expect(change('request', request.id, 'archive')).rejects.toThrow('not permitted');
    await h.rpc(TEACHER, 'resolve_attempt_help', {
      p_request: request.id,
      p_approve: false,
      p_reply: 'Continue your work.',
    });
    await change('request', request.id, 'archive', TEACHER);
    expect(
      (await h.rpc(TEACHER, 'instructor_help_requests', { p_status: 'rejected' })).rows.some(
        (r: any) => r.id === request.id,
      ),
    ).toBe(false);
    expect(
      (await h.rpc(STUDENT, 'attempt_recovery_state', { p_attempt: attempt })).request.reply,
    ).toBe('Continue your work.');
    await change('request', request.id, 'restore', TEACHER);
    expect(
      (await h.rpc(TEACHER, 'instructor_help_requests', { p_status: 'rejected' })).rows.some(
        (r: any) => r.id === request.id,
      ),
    ).toBe(true);
  });
  it('rolls back an entire permanent deletion when a retained foreign-key reference prevents cleanup', async () => {
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(),
      p_publish: false,
    });
    await change('assessment', id, 'trash');
    await h.db.exec(
      'create table public.management_test_hold(assessment_id uuid references public.assignments)',
    );
    await h.db.query('insert into public.management_test_hold values($1)', [id]);
    const before = (
      await h.db.query('select * from public.assessment_drafts where assessment_id=$1', [id])
    ).rows;
    await expect(change('assessment', id, 'purge')).rejects.toThrow('foreign key');
    expect(
      (await h.db.query('select * from public.assessment_drafts where assessment_id=$1', [id]))
        .rows,
    ).toEqual(before);
    expect((await preview('assessment', id)).deleted).toBe(true);
    expect(
      (
        await h.db.query(
          "select * from public.admin_activity where record_id=$1 and action='purge'",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      h.asUser(ADMIN, 'delete from public.assignments where id=$1', [id]),
    ).rejects.toThrow('permission');
    await h.db.query('delete from public.management_test_hold where assessment_id=$1', [id]);
    await change('assessment', id, 'purge');
    expect(
      (await h.db.query('select * from public.assessment_drafts where assessment_id=$1', [id]))
        .rows,
    ).toHaveLength(0);
  });

  it('does not let legacy editors silently restore archived content and keeps native/archive metadata consistent', async () => {
    const id = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition(),
      p_publish: false,
    });
    await change('assessment', id, 'archive');
    await expect(
      h.rpc(TEACHER, 'save_assessment', { p_id: id, p_document: definition(), p_publish: false }),
    ).rejects.toThrow('Restore archived');
    await h.rpc(TEACHER, 'set_assessment_visibility', {
      p_id: id,
      p_visible: false,
      p_archive: false,
    });
    expect((await preview('assessment', id)).archived).toBe(false);
    const question = {
      id: 'legacy_copy',
      prompt: 'A reusable question',
      kind: 'long',
      points: 1,
      manual: true,
      required: true,
      options: [],
    };
    const qid = await h.rpc(TEACHER, 'save_bank_question', { p_id: null, p_document: question });
    await change('question', qid, 'archive');
    await expect(
      h.rpc(TEACHER, 'save_bank_question', {
        p_id: qid,
        p_document: { ...question, prompt: 'Changed' },
      }),
    ).rejects.toThrow('Restore archived');
    await h.rpc(TEACHER, 'archive_bank_question', { p_id: qid, p_archived: false });
    expect((await preview('question', qid)).archived).toBe(false);
  });

  it('deletes only a bank copy and retains published questions and private answer keys', async () => {
    const question = {
      id: 'copied_question',
      prompt: 'Original bank prompt',
      kind: 'long',
      points: 5,
      manual: true,
      required: true,
      options: [],
      correctAnswers: ['Private marking guidance'],
    };
    const qid = await h.rpc(TEACHER, 'save_bank_question', { p_id: null, p_document: question });
    const assessment = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: { ...definition(true), questions: [question] },
      p_publish: true,
    });
    const before = (
      await h.db.query(
        'select document,keys from public.assessment_versions v join private.assessment_keys k on k.assessment_id=v.assessment_id and k.version=v.version where v.assessment_id=$1',
        [assessment],
      )
    ).rows;
    await change('question', qid, 'trash');
    await change('question', qid, 'purge');
    expect(
      (
        await h.db.query(
          'select document,keys from public.assessment_versions v join private.assessment_keys k on k.assessment_id=v.assessment_id and k.version=v.version where v.assessment_id=$1',
          [assessment],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (await h.db.query('select * from public.question_bank where id=$1', [qid])).rows,
    ).toHaveLength(0);
    await expect(
      h.rpc(TEACHER, 'save_bank_question', { p_id: qid, p_document: question }),
    ).rejects.toThrow('Trash');
  });
  it('retains immutable content/audit versions and detects concurrent lesson edits', async () => {
    const id = '70000000-0000-4000-8000-000000000011';
    const edit = await h.rpc(TEACHER, 'manage_learning_edit', { p_id: id });
    const args = {
      p_id: id,
      p_kind: 'lesson',
      p_parent: edit.parent_id,
      p_document: { ...edit.document, title: 'Updated draft' },
      p_revision: edit.revision,
      p_publish: false,
    };
    await h.rpc(TEACHER, 'manage_learning_save', args);
    await expect(h.rpc(TEACHER, 'manage_learning_save', args)).rejects.toThrow('changed');
    await expect(
      h.db.query("update public.learning_versions set document='{}' where item_id=$1", [id]),
    ).rejects.toThrow('immutable');
    await expect(
      h.db.exec("update public.admin_activity set reason='erase evidence'"),
    ).rejects.toThrow('retained');
    expect(
      (
        await h.db.query(
          "select id from public.admin_activity where action='data_administrator_granted'",
        )
      ).rows,
    ).toHaveLength(1);
    const activity = await h.rpc(ADMIN, 'manage_activity', { p_limit: 25 });
    expect(activity.rows.length).toBeLessThanOrEqual(25);
    expect(activity.total).toBeGreaterThan(25);
  });
});
