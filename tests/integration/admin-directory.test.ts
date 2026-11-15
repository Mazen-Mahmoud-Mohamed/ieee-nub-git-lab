import { describe, expect, it } from 'vitest';
import { managementDatabase, ADMIN, STUDENT } from '../helpers/managementDatabase';
import { TASK_ONE_ID } from '../../src/features/assignments/assignment';
describe('admin directory read models', () => {
  it('excludes staff accounts and staff attempts while retaining their access and history', async () => {
    const h = await managementDatabase();
    try {
      await h.rpc(ADMIN, 'start_assessment', { p_assessment: TASK_ONE_ID });
      const studentAttempt = await h.rpc(STUDENT, 'start_assessment', {
        p_assessment: TASK_ONE_ID,
      });
      const overview = await h.rpc(ADMIN, 'instructor_overview');
      expect(overview.students).toBe(1);
      expect(overview.started_students).toBe(1);
      expect(overview.in_progress).toBe(1);
      const directory = await h.rpc(ADMIN, 'instructor_students');
      expect(directory.total).toBe(1);
      expect(directory.rows[0].id).toBe(STUDENT);
      await h.db.query(
        "update public.attempts set status='submitted',submitted_at=now(),receipt=gen_random_uuid() where id=$1",
        [studentAttempt.id],
      );
      await h.db.query(
        'insert into public.grading_summaries(attempt_id,practical_score,theory_score,released) values($1,20,10,true)',
        [studentAttempt.id],
      );
      const autoReleased = await h.rpc(ADMIN, 'instructor_overview');
      expect(autoReleased.pending_reviews).toBe(0);
      expect(autoReleased.graded).toBe(1);
      expect((await h.db.query('select id from public.attempts')).rows).toHaveLength(2);
      expect((await h.db.query('select user_id from private.instructors')).rows).toHaveLength(2);
      expect(await h.rpc(ADMIN, 'is_data_administrator')).toBe(true);
      const totals = (await h.asUser(ADMIN, 'select * from public.instructor_course_gradebook()'))
        .rows;
      expect(totals).toHaveLength(1);
      expect(totals[0].student_id).toBe(STUDENT);
      await expect(
        h.asUser(STUDENT, 'select * from public.instructor_course_gradebook()'),
      ).rejects.toThrow(/authorization/i);
      await expect(h.rpc(STUDENT, 'instructor_overview')).rejects.toThrow(/authorization/i);
      await expect(h.rpc(STUDENT, 'instructor_students')).rejects.toThrow(/authorization/i);
    } finally {
      await h.db.close();
    }
  });
});
