import { requireBackend } from '../../services/supabase';
import { facultyLabel, type Faculty } from '../auth/faculty';
export type Attempt = {
  id: string;
  student_id: string;
  assignment_id: string;
  assignment_version: number;
  attempt_number: number;
  assignments: { title: string; type: string } | null;
  status: string;
  practical_score: number | null;
  theory_score: number | null;
  receipt: string | null;
  created_at: string;
  submitted_at: string | null;
  deadline_at?: string | null;
  auto_submitted?: boolean;
  identity_snapshot: Record<string, unknown> | null;
  released: boolean;
  feedback: string | null;
  profiles: {
    full_name: string;
    email: string | null;
    phone: string | null;
    student_id: string | null;
    department: string;
    faculty: Faculty | null;
    academic_year: string;
  } | null;
};
export type Student = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  faculty: Faculty | null;
  student_id: string | null;
  created_at: string;
  started: number;
  submissions: number;
};
export const adminError = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : String(e);
export async function adminRPC<T>(name: string, params: Record<string, unknown> = {}) {
  const { data, error } = await requireBackend().rpc(name, params);
  if (error) throw error;
  return data as T;
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@\-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function resultsCSV(rows: Attempt[]) {
  return (
    '\uFEFF' +
    [
      [
        'Name',
        'Email',
        'Phone',
        'Faculty',
        'Student ID',
        'Assessment',
        'Type',
        'Attempt',
        'Submitted at',
        'Status',
        'Practical',
        'Theory',
        'Total',
        'Grading status',
        'Released',
        'Feedback',
      ],
      ...rows.map((r) => [
        r.profiles?.full_name,
        r.profiles?.email,
        r.profiles?.phone,
        facultyLabel(r.profiles?.faculty),
        r.profiles?.student_id,
        r.assignments?.title,
        r.assignments?.type,
        r.attempt_number,
        r.submitted_at,
        r.status,
        r.practical_score,
        r.theory_score,
        r.practical_score !== null && r.theory_score !== null
          ? r.practical_score + r.theory_score
          : null,
        r.status === 'graded' ? 'Finalized' : 'Pending review',
        r.released,
        r.feedback,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  );
}
