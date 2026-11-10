import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
export type CourseGrade = {
  student_id: string;
  full_name: string;
  task1: number;
  task2: number;
  final: number;
  total: number;
  eligible: boolean;
  completed_components: number;
};
export function CourseGrades({
  instructor = false,
  unconfigured = [],
}: {
  instructor?: boolean;
  unconfigured?: string[];
}) {
  const [rows, setRows] = useState<CourseGrade[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (supabase)
      void supabase.rpc('course_gradebook').then(({ data, error }) => {
        if (live) {
          setError(error?.message || '');
          setRows(Array.isArray(data) ? data : []);
          if (!error && data && !Array.isArray(data))
            setError('Course totals are temporarily unavailable.');
        }
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="form-card">
      <h2>Course score · 500 points</h2>
      <p>
        Task 1: 150 · Task 2: 150 · Final Exam: 200. Certificate eligibility begins at 400 combined
        points after all three components are finalized and their grades released. There is no
        minimum for an individual assessment.
      </p>
      <p>
        Task 2 and the Final Exam are reserved for later configuration. Assessments appear in the
        course only after their content is published. Only released results count; each slot uses
        the best completed result.
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <div key={r.student_id}>
          <h3>{instructor ? r.full_name : 'Your released score'}</h3>
          <p>
            Task 1: {r.task1}/150 · Task 2:{' '}
            {unconfigured.includes('task2') ? 'Coming soon' : r.task2 + '/150'}
            {' · '}Final: {unconfigured.includes('final') ? 'Coming soon' : r.final + '/200'}
          </p>
          <strong>
            {r.total}/500 ·{' '}
            {r.completed_components !== 3
              ? 'Certificate eligibility pending — complete all three course components'
              : r.eligible
                ? 'Eligible for certificate'
                : 'Not eligible — combined score below 400'}
          </strong>
        </div>
      ))}
    </section>
  );
}
