import { sumPoints } from '../assessments/model';
import { RecordActions } from './RecordManagement';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requireBackend } from '../../services/supabase';
import { FACULTIES, facultyLabel } from '../auth/faculty';
import { adminRPC, adminError, resultsCSV, type Attempt, type Student } from './adminData';
import { AttemptDetail } from './SubmissionDetail';
const date = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');
export function FacultyFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select aria-label="Faculty filter" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All faculties</option>
      {FACULTIES.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </select>
  );
}
export function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="admin-pagination">
      <span>
        {total} records · Page {page + 1} of {Math.max(1, Math.ceil(total / 25))}
      </span>
      <button className="outline-button" disabled={!page} onClick={() => onPage(page - 1)}>
        Previous page
      </button>
      <button
        className="outline-button"
        disabled={(page + 1) * 25 >= total}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </button>
    </div>
  );
}
export function Overview() {
  const [data, setData] = useState<Record<string, number>>(),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void adminRPC<Record<string, number>>('instructor_overview')
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section>
      <h2>Overview</h2>
      <div className="admin-shortcuts">
        <Link className="primary" to="/instructor/sessions">
          Add a Learning Session
        </Link>
        <Link className="primary" to="/instructor/submissions">
          Review submissions
        </Link>
        <Link className="outline-button" to="/instructor/requests">
          Review help requests
        </Link>
        <Link className="outline-button" to="/instructor/assessments/new">
          Create an assessment
        </Link>
        <Link className="text-button" to="/learn">
          Preview learning guide
        </Link>
      </div>
      <p>Start with work that needs your attention.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p role="status">Loading overview…</p>
      ) : (
        data && (
          <div className="admin-stats">
            {Object.entries({
              students: 'Registered students',
              started_students: 'Students who started',
              submitted_assignments: 'Submitted assignments',
              submitted_exams: 'Submitted exams',
              in_progress: 'In-progress attempts',
              pending_reviews: 'Pending reviews',
              graded: 'Graded submissions',
              published_assignments: 'Published assignments',
              published_exams: 'Published exams',
            }).map(([key, label]) => (
              <div key={key}>
                <strong>{data[key]}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )
      )}
      <p>
        <Link to="/instructor/submissions">Review all submissions →</Link>
      </p>
    </section>
  );
}
export function Students() {
  const [search, setSearch] = useState(''),
    [faculty, setFaculty] = useState(''),
    [page, setPage] = useState(0),
    [data, setData] = useState<{ rows: Student[]; total: number }>(),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Student | null>(null);
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError('');
    const timer = setTimeout(() => {
      void adminRPC<{ rows: Student[]; total: number }>('instructor_students', {
        p_search: search,
        p_faculty: faculty,
        p_offset: page * 25,
        p_limit: 25,
      })
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(adminError(e));
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, faculty, page]);
  if (selected)
    return (
      <section>
        <button className="text-button" onClick={() => setSelected(null)}>
          ← Back to students
        </button>
        <h2>{selected.full_name || 'Profile incomplete'}</h2>
        <p>
          {selected.email} · {selected.phone || 'No phone'} · {facultyLabel(selected.faculty)}
        </p>
        <p>
          Student ID: {selected.student_id || 'Not collected'} · Registered{' '}
          {date(selected.created_at)}
        </p>
        <Attempts student={selected.id} allAttempts />
      </section>
    );
  return (
    <section>
      <h2>Students</h2>
      <div className="table-toolbar">
        <input
          aria-label="Search students"
          placeholder="Search name, email or student ID"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <FacultyFilter
          value={faculty}
          onChange={(s) => {
            setFaculty(s);
            setPage(0);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p role="status">Loading students…</p>
      ) : (
        data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      'Name',
                      'Email',
                      'Phone',
                      'Faculty',
                      'Student ID',
                      'Registered',
                      'Started assessments',
                      'Submissions',
                      'Details',
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((s) => (
                    <tr key={s.id}>
                      <td>{s.full_name || 'Profile incomplete'}</td>
                      <td>{s.email}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{facultyLabel(s.faculty)}</td>
                      <td>{s.student_id || '—'}</td>
                      <td>{date(s.created_at)}</td>
                      <td>{s.started}</td>
                      <td>{s.submissions}</td>
                      <td>
                        <button className="text-button" onClick={() => setSelected(s)}>
                          View student
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <p className="empty-state">No students match your filters.</p>}
            </div>
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
export function Attempts({
  student = '',
  results = false,
  allAttempts = false,
}: {
  student?: string;
  results?: boolean;
  allAttempts?: boolean;
}) {
  const [routeParams] = useSearchParams();
  const selectedStudent = student || routeParams.get('student') || '';
  const [course, setCourse] = useState(''),
    [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]),
    [managementState, setManagementState] = useState('active');
  useEffect(() => {
    let live = true;
    void adminRPC<Array<{ id: string; title: string }>>('manage_course_options')
      .then((rows) => {
        if (live) setCourses(rows || []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [search, setSearch] = useState(routeParams.get('search') || ''),
    [faculty, setFaculty] = useState(''),
    [type, setType] = useState(''),
    [assessment, setAssessment] = useState(''),
    [status, setStatus] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [showOngoing, setShowOngoing] = useState(allAttempts || routeParams.get('ongoing') === '1'),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0),
    [data, setData] = useState<{ rows: Attempt[]; total: number }>(),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Attempt | null>(null),
    [exporting, setExporting] = useState(false),
    [assessments, setAssessments] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const rows: Array<{ id: string; title: string }> = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await requireBackend()
          .from('assignments')
          .select('id,title')
          .order('id')
          .range(offset, offset + 99);
        if (error) throw error;
        rows.push(...(data || []));
        if (!live || !data || data.length < 100) break;
      }
      if (live) setAssessments(rows);
    })().catch((e) => {
      if (live) setError(adminError(e));
    });
    return () => {
      live = false;
    };
  }, []);
  const params = {
    p_search: search,
    p_faculty: faculty,
    p_type: type,
    p_assessment: assessment || null,
    p_student: selectedStudent || null,
    p_course: course || null,
    p_management_state: managementState,
    p_status: status,
    p_from: from ? from + 'T00:00:00Z' : null,
    p_to: to ? new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString() : null,
    p_submitted_only: !showOngoing,
  };
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError('');
    const timer = setTimeout(() => {
      void adminRPC<{ rows: Attempt[]; total: number }>('manage_attempts', {
        ...params,
        p_offset: page * 25,
        p_limit: 25,
      })
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(adminError(e));
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    search,
    faculty,
    type,
    assessment,
    status,
    from,
    to,
    showOngoing,
    selectedStudent,
    course,
    managementState,
    page,
    refresh,
  ]);
  const change = (setter: (s: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };
  if (selected)
    return (
      <AttemptDetail
        attempt={selected}
        back={() => {
          setSelected(null);
          setRefresh((x) => x + 1);
        }}
      />
    );
  return (
    <section>
      <h2>{results ? 'Results' : student ? 'Student attempts' : 'All submissions'}</h2>
      <p>
        {results
          ? 'Practical and theory marks stay separate. Results become visible to students only after release.'
          : 'Every matching stored attempt is available through pagination, including archived assessments.'}
      </p>
      <div className="table-toolbar">
        <input
          aria-label="Search student name, email or ID"
          placeholder="Search name, email or student ID"
          value={search}
          onChange={(e) => change(setSearch)(e.target.value)}
        />
        <FacultyFilter value={faculty} onChange={change(setFaculty)} />
        <select
          aria-label="Course filter"
          value={course}
          onChange={(e) => change(setCourse)(e.target.value)}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Record archive filter"
          value={managementState}
          onChange={(e) => change(setManagementState)(e.target.value)}
        >
          <option value="active">Active records</option>
          <option value="archived">Archived Items</option>
          <option value="trash">Trash</option>
          <option value="all">All retained records</option>
        </select>
        <select
          aria-label="Assessment type filter"
          value={type}
          onChange={(e) => change(setType)(e.target.value)}
        >
          <option value="">Assignments & exams</option>
          <option value="assignment">Assignment</option>
          <option value="exam">Exam</option>
        </select>
        <select
          aria-label="Assessment filter"
          value={assessment}
          onChange={(e) => change(setAssessment)(e.target.value)}
        >
          <option value="">All assessments</option>
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => change(setStatus)(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            'submitted',
            'pending_review',
            'graded',
            'expired',
            ...(showOngoing ? ['in_progress', 'invalidated'] : []),
          ].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <label>
          From (UTC)
          <input
            aria-label="From date"
            type="date"
            value={from}
            onChange={(e) => change(setFrom)(e.target.value)}
          />
        </label>
        <label>
          To (UTC)
          <input
            aria-label="To date"
            type="date"
            value={to}
            min={from}
            onChange={(e) => change(setTo)(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showOngoing}
            onChange={(e) => {
              setShowOngoing(e.target.checked);
              setStatus('');
              setPage(0);
            }}
          />
          Include in-progress attempts
        </label>
        <button
          className="outline-button"
          disabled={exporting || !data}
          onClick={async () => {
            setExporting(true);
            setError('');
            try {
              const rows: Attempt[] = [];
              let total = Infinity;
              for (let offset = 0; offset < total; offset += 100) {
                const batch = await adminRPC<{ rows: Attempt[]; total: number }>(
                  'manage_attempts',
                  { ...params, p_offset: offset, p_limit: 100 },
                );
                total = batch.total;
                rows.push(...batch.rows);
                if (!batch.rows.length) break;
              }
              const url = URL.createObjectURL(
                new Blob([resultsCSV([...new Map(rows.map((r) => [r.id, r])).values()])], {
                  type: 'text/csv;charset=utf-8',
                }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'ieee-git-lab-grades.csv';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setError(adminError(e));
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p role="status">Loading attempts…</p>
      ) : (
        data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      'Student',
                      'Email',
                      'Phone',
                      'Faculty',
                      'Assessment',
                      'Type',
                      'Attempt',
                      'Submitted',
                      'Status',
                      'Practical',
                      'Theory',
                      'Total',
                      'Grading status',
                      'Feedback',
                      'Review',
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.profiles?.full_name || 'Profile unavailable'}
                        <small>{r.profiles?.student_id}</small>
                      </td>
                      <td>{r.profiles?.email || '—'}</td>
                      <td>{r.profiles?.phone || '—'}</td>
                      <td>{facultyLabel(r.profiles?.faculty)}</td>
                      <td>{r.assignments?.title}</td>
                      <td>{r.assignments?.type}</td>
                      <td>{r.attempt_number}</td>
                      <td>{date(r.submitted_at)}</td>
                      <td>
                        {r.status.replaceAll('_', ' ')}
                        {r.auto_submitted ? ' · Auto-submitted' : ''}
                      </td>
                      <td>{r.practical_score ?? '—'}</td>
                      <td>{r.theory_score ?? 'Pending'}</td>
                      <td>
                        {r.practical_score !== null && r.theory_score !== null
                          ? sumPoints([Number(r.practical_score), Number(r.theory_score)])
                          : 'Pending'}
                      </td>
                      <td>
                        {r.status === 'graded'
                          ? r.released
                            ? 'Released'
                            : 'Finalized privately'
                          : 'Pending review'}
                      </td>
                      <td className="admin-feedback">{r.feedback || '—'}</td>
                      <td>
                        <button className="text-button" onClick={() => setSelected(r)}>
                          Inspect attempt →
                        </button>
                        <RecordActions
                          kind="attempt"
                          id={r.id}
                          changed={() => setRefresh((n) => n + 1)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <p className="empty-state">No attempts match your filters.</p>}
            </div>
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
