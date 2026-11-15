import { requireBackend } from '../../services/supabase';
import type { CourseGrade } from '../assessments/CourseGrades';
// Table-returning RPCs are capped by PostgREST; page before applying directory filters.
export async function loadCourseGradebook(): Promise<CourseGrade[]> {
  const rows: CourseGrade[] = [];
  let rpcName = 'instructor_course_gradebook';
  for (let offset = 0; ; offset += 100) {
    let result = await requireBackend()
      .rpc(rpcName)
      .order('student_id')
      .range(offset, offset + 99);
    // Keep the UI usable against the current deployment until the reviewed read-model patch is applied.
    if (offset === 0 && result.error?.code === 'PGRST202') {
      rpcName = 'course_gradebook';
      result = await requireBackend()
        .rpc(rpcName)
        .order('student_id')
        .range(offset, offset + 99);
    }
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error('Course totals are temporarily unavailable.');
    rows.push(...result.data);
    if (result.data.length < 100)
      return [...new Map(rows.map((row) => [row.student_id, row])).values()];
  }
}
