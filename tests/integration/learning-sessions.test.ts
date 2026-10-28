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
const course = '70000000-0000-4000-8000-000000000001',
  section = '70000000-0000-4000-8000-000000000002';
async function save(
  id: string | null,
  doc: any,
  publish = false,
  kind = 'lesson',
  parent = section,
) {
  const existing = id ? await h.rpc(TEACHER, 'manage_learning_edit', { p_id: id }) : null;
  return h.rpc(TEACHER, 'manage_learning_save', {
    p_id: id,
    p_kind: kind,
    p_parent: parent,
    p_document: { title: 'Learning session', body: 'Session description', links: [], ...doc },
    p_revision: existing?.revision ?? null,
    p_publish: publish,
  });
}
async function register(item: string, id = crypto.randomUUID()) {
  await h.db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    await tx.query("select set_config('request.jwt.claim.role','service_role',true)");
    await tx.query('select public.register_learning_material($1,$2,$3,$4,$5)', [
      TEACHER,
      id,
      item,
      'Slides.pptx',
      1000,
    ]);
  });
  await h.db.query(
    "insert into storage.objects(bucket_id,name)values('learning-presentations',$1)",
    [item + '/' + id + '.pptx'],
  );
  return id;
}
describe.sequential('versioned learning sessions, publication and private storage policy', () => {
  it('keeps existing lessons unchanged and stores ordered session metadata without a duplicate lesson table', async () => {
    const old = await h.rpc(null, 'learning_catalog', { p_parent: section });
    expect(old.rows).toHaveLength(6);
    const id = await save(
      null,
      {
        title: 'Session later',
        session_number: 2,
        display_order: 20,
        topics: ['Branches', 'دمج'],
        video_url: 'https://drive.google.com/file/d/abcdefghij123/view?resourcekey=0-Safe_Key',
      },
      true,
    );
    await save(null, { title: 'Session first', session_number: 1, display_order: 10 }, true);
    const rows = (await h.rpc(null, 'learning_catalog', { p_parent: section })).rows;
    expect(rows.slice(-2).map((r: any) => r.document.title)).toEqual([
      'Session first',
      'Session later',
    ]);
    expect(rows.find((r: any) => r.id === id).document.topics).toEqual(['Branches', 'دمج']);
    expect((await h.rpc(null, 'learning_catalog', { p_parent: course })).rows).toHaveLength(1);
  });
  it('enforces role checks, server URL validation, file ownership and immutable publication', async () => {
    await expect(
      h.rpc(STUDENT, 'manage_learning_save', {
        p_id: null,
        p_kind: 'lesson',
        p_parent: section,
        p_document: { title: 'x', links: [] },
        p_revision: null,
      }),
    ).rejects.toThrow('Instructor');
    await expect(save(null, { video_url: 'https://evil.test/video' })).rejects.toThrow(
      'Google Drive',
    );
    await expect(save(null, { presentation_id: crypto.randomUUID() })).rejects.toThrow('belonging');
    await expect(save(null, { display_order: -1 })).rejects.toThrow('whole numbers');
    const id = await save(null, { title: 'Private session draft' });
    expect(
      (await h.rpc(null, 'learning_catalog', { p_parent: section })).rows.some(
        (r: any) => r.id === id,
      ),
    ).toBe(false);
    await expect(h.rpc(null, 'learning_catalog', { p_parent: id })).rejects.toThrow('unavailable');
    await expect(
      h.rpc(STUDENT, 'register_learning_material', {
        p_actor: TEACHER,
        p_id: crypto.randomUUID(),
        p_item: id,
        p_name: 'bad.pptx',
        p_bytes: 1000,
      }),
    ).rejects.toThrow();
  });
  it('allows signed-download policy only for current published material and retains replaced files/versions', async () => {
    await h.db.exec(
      'create policy synthetic_broad_legacy_storage on storage.objects for all to anon,authenticated using(true) with check(true)',
    );
    const id = await save(null, {}),
      first = await register(id),
      second = await register(id);
    await save(id, { presentation_id: first }, true);
    const original = (
      await h.db.query('select document from public.learning_versions where item_id=$1', [id])
    ).rows;
    const path = id + '/' + first + '.pptx';
    await expect(
      h.asUser(
        STUDENT,
        "insert into storage.objects(bucket_id,name)values('learning-presentations','forged.pptx')",
      ),
    ).rejects.toThrow();
    expect(
      (await h.asUser(TEACHER, 'delete from storage.objects where name=$1 returning id', [path]))
        .rows,
    ).toHaveLength(0);
    expect(await h.rpc(null, 'can_read_learning_material', { p_path: path })).toBe(true);
    expect(
      (await h.asUser(null, 'select name from storage.objects where name=$1', [path])).rows,
    ).toHaveLength(1);
    await save(id, { presentation_id: second }, false);
    expect((await h.rpc(null, 'learning_presentation', { p_item: id })).id).toBe(first);
    expect((await h.rpc(TEACHER, 'learning_presentation', { p_item: id })).id).toBe(first); // Published student view is consistent even for instructors.
    expect(
      (await h.asUser(TEACHER, 'select id from public.learning_materials where id=$1', [second]))
        .rows,
    ).toHaveLength(1);
    await save(id, { presentation_id: second }, true);
    expect(await h.rpc(null, 'can_read_learning_material', { p_path: path })).toBe(false);
    expect(
      (await h.asUser(null, 'select name from storage.objects where name=$1', [path])).rows,
    ).toHaveLength(0);
    expect(
      (
        await h.db.query(
          'select document from public.learning_versions where item_id=$1 and version=1',
          [id],
        )
      ).rows,
    ).toEqual(original);
    expect(
      (await h.db.query('select id from public.learning_materials where item_id=$1', [id])).rows,
    ).toHaveLength(2);
    const other = await save(null, {});
    await expect(save(other, { presentation_id: first })).rejects.toThrow('belonging');
    const edit = await h.rpc(TEACHER, 'manage_learning_edit', { p_id: id });
    await h.rpc(TEACHER, 'manage_learning_unpublish', { p_id: id, p_revision: edit.revision });
    await expect(h.rpc(null, 'learning_presentation', { p_item: id })).rejects.toThrow(
      'unavailable',
    );
    expect(
      (await h.db.query('select * from public.learning_versions where item_id=$1', [id])).rows,
    ).toHaveLength(2);
    const snapshot = await h.rpc(TEACHER, 'manage_preview', { p_kind: 'learning', p_id: id });
    expect(snapshot.actions.purge).toBe(false);
    expect(snapshot.reason).toContain('presentations');
  });
  it('respects parent visibility, stale unpublish and never grants access to a restricted related activity', async () => {
    const definition = {
      ...blankDefinition(),
      title: 'Related practice',
      format: 'theory',
      questions: [
        {
          id: 'q',
          prompt: 'Git?',
          kind: 'boolean',
          options: ['True', 'False'],
          correctAnswers: ['True'],
          manual: false,
          required: true,
          points: 1,
        },
      ],
    };
    const assessment = await h.rpc(TEACHER, 'save_assessment', {
      p_id: null,
      p_document: definition,
      p_publish: true,
    });
    const id = await save(null, { related_assessment_id: assessment }, true);
    expect(await h.rpc(null, 'learning_related_activity', { p_item: id })).toBeNull();
    expect((await h.rpc(STUDENT, 'learning_related_activity', { p_item: id })).id).toBe(assessment);
    const start = await h.rpc(STUDENT, 'start_assessment', { p_assessment: assessment });
    expect(start.id).toBeTruthy();
    const edit = await h.rpc(TEACHER, 'manage_learning_edit', { p_id: id });
    await save(id, { related_assessment_id: assessment });
    await expect(
      h.rpc(TEACHER, 'manage_learning_unpublish', { p_id: id, p_revision: edit.revision }),
    ).rejects.toThrow('changed');
    await h.db.query('update public.assignments set visible=false where id=$1', [assessment]);
    expect(await h.rpc(STUDENT, 'learning_related_activity', { p_item: id })).toBeNull();
    await h.db.query('update public.assignments set visible=true where id=$1', [assessment]);
    const attempt = await h.rpc(ADMIN, 'manage_preview', { p_kind: 'attempt', p_id: start.id });
    await h.rpc(ADMIN, 'manage_records', {
      p_kind: 'attempt',
      p_records: [{ id: start.id, revision: attempt.revision }],
      p_action: 'invalidate',
      p_reason: 'Isolated policy check',
      p_confirmation: 'INVALIDATE 1',
    });
    expect(await h.rpc(STUDENT, 'learning_related_activity', { p_item: id })).toBeNull(); // No extra attempt or credit is manufactured.
    const attemptsBefore = (
      await h.db.query('select * from public.attempts where student_id=$1', [STUDENT])
    ).rows;
    await h.rpc(STUDENT, 'learning_related_activity', { p_item: id });
    expect(
      (await h.db.query('select * from public.attempts where student_id=$1', [STUDENT])).rows,
    ).toEqual(attemptsBefore);
    await h.rpc(TEACHER, 'save_assessment', {
      p_id: assessment,
      p_document: { ...definition, attemptLimit: 2, deadline: '2020-01-01T00:00:00Z' },
      p_publish: true,
    });
    expect(await h.rpc(STUDENT, 'learning_related_activity', { p_item: id })).toBeNull();
    await h.rpc(TEACHER, 'save_assessment', {
      p_id: assessment,
      p_document: { ...definition, attemptLimit: 2, startsAt: '2099-01-01T00:00:00Z' },
      p_publish: true,
    });
    expect(await h.rpc(STUDENT, 'learning_related_activity', { p_item: id })).toBeNull();
    const state = await h.rpc(TEACHER, 'manage_preview', { p_kind: 'learning', p_id: course });
    await h.rpc(TEACHER, 'manage_records', {
      p_kind: 'learning',
      p_records: [{ id: course, revision: state.revision }],
      p_action: 'archive',
      p_reason: 'Test archive',
      p_confirmation: 'ARCHIVE 1',
    });
    expect(await h.rpc(null, 'learning_is_visible', { p_item: id })).toBe(false);
  });
});
