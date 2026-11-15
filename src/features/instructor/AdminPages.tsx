import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { sumPoints } from '../assessments/model';
import { requireBackend } from '../../services/supabase';
import { FACULTIES, facultyLabel } from '../auth/faculty';
import { adminRPC, adminError, resultsCSV, type Attempt, type Student } from './adminData';
import { loadOverviewCounts, type OverviewCounts, type ActivitySummary } from './overviewData';
import { AttemptDetail } from './SubmissionDetail';
import { cairoDayBoundary } from './cairoDate';
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      })
    : '—';

export function FacultyFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
  onPage: (page: number) => void;
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
  const [data, setData] = useState<OverviewCounts>(),
    [activity, setActivity] = useState<ActivitySummary[]>(),
    [error, setError] = useState(''),
    [activityError, setActivityError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setData(undefined);
    setActivity(undefined);
    setError('');
    setActivityError('');
    void loadOverviewCounts()
      .then((counts) => {
        if (live) setData(counts);
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      });
    void adminRPC<{ rows: ActivitySummary[] }>('manage_activity', {
      p_offset: 0,
      p_limit: 5,
    })
      .then((result) => {
        if (live) setActivity(result.rows);
      })
      .catch((e) => {
        if (live) setActivityError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  const metrics = [
    {
      key: 'students',
      label: 'Registered students',
      note: 'Registered student accounts',
      icon: Users,
      to: '/instructor/students',
    },
    {
      key: 'started_students',
      label: 'Students who started',
      note: 'At least one assessment attempt',
      icon: ClipboardCheck,
      to: '/instructor/submissions?ongoing=1',
    },
    {
      key: 'submitted',
      label: 'Submitted assessments',
      note: 'Assignments and exams combined',
      icon: CheckCircle2,
      to: '/instructor/submissions',
    },
    {
      key: 'pending_reviews',
      label: 'Pending reviews',
      note: 'Awaiting instructor finalization',
      icon: Clock3,
      to: '/instructor/submissions?status=pending_review',
    },
  ] as const;
  return (
    <section className="admin-overview">
      <div className="admin-card-heading">
        <div>
          <h2>Your workspace at a glance</h2>
          <p>Live counts from stored student and assessment records.</p>
        </div>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={15} />
          Refresh overview
        </button>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !data ? (
        <div className="admin-kpi-grid" role="status" aria-label="Loading overview">
          {metrics.map((m) => (
            <div className="admin-kpi admin-skeleton" key={m.key}>
              <span>{m.label}</span>
              <strong>—</strong>
              <small>Loading verified counts…</small>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="admin-kpi-grid">
            {metrics.map(({ key, label, note, icon: Icon, to }) => (
              <Link className="admin-kpi" key={key} to={to}>
                <div>
                  <span>{label}</span>
                  <Icon size={19} />
                </div>
                <strong>{data[key].toLocaleString()}</strong>
                <small>
                  {note}
                  <ArrowRight size={13} />
                </small>
              </Link>
            ))}
          </div>
          <div className="admin-summary-strip">
            {[
              {
                label: 'Completed & graded',
                count: data.graded,
                icon: GraduationCap,
                to: '/instructor/submissions?status=graded',
              },
              {
                label: 'Published assessments',
                count: data.published_assessments,
                icon: ClipboardCheck,
                to: '/instructor/assessments?status=published',
              },
              {
                label: 'Published learning sessions',
                count: data.published_sessions,
                icon: BookOpen,
                to: '/instructor/courses',
              },
            ].map(({ label, count, icon: Icon, to }) => (
              <Link to={to} key={label}>
                <Icon size={21} />
                <span>
                  <strong>{count.toLocaleString()}</strong>
                  <small>{label}</small>
                </span>
                <ChevronArrow />
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="admin-overview-lower">
        <section className="form-card">
          <div className="admin-card-heading">
            <h2>Next actions</h2>
            <span className="status-badge">Workspace</span>
          </div>
          <div className="admin-action-list">
            <Link to="/instructor/submissions?status=pending_review">
              <span className="admin-card-icon">
                <GraduationCap size={20} />
              </span>
              <span>
                <strong>Review student work</strong>
                <small>Inspect evidence, give feedback and release grades.</small>
              </span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/instructor/courses?new=session">
              <span className="admin-card-icon">
                <BookOpen size={20} />
              </span>
              <span>
                <strong>Add a learning session</strong>
                <small>Upload slides, add a recording and publish.</small>
              </span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/instructor/assessments/new">
              <span className="admin-card-icon">
                <Plus size={20} />
              </span>
              <span>
                <strong>Create an assessment</strong>
                <small>Prepare a draft and preview before publishing.</small>
              </span>
              <ArrowRight size={17} />
            </Link>
            <Link to="/instructor/submissions?tab=help">
              <span className="admin-card-icon">
                <Users size={20} />
              </span>
              <span>
                <strong>Review help requests</strong>
                <small>Help students recover while keeping their history.</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section className="form-card">
          <div className="admin-card-heading">
            <h2>Recent activity</h2>
            <Link className="text-button" to="/instructor/administration?tab=activity">
              View all
              <ArrowRight size={14} />
            </Link>
          </div>
          {activityError ? (
            <p role="alert" className="error">
              {activityError}
            </p>
          ) : !activity ? (
            <p role="status">Loading recent activity…</p>
          ) : !activity.length ? (
            <div className="empty-state">
              No administrative activity yet.
              <small>Published content and record changes will appear here.</small>
            </div>
          ) : (
            <ol className="admin-activity-list">
              {activity.map((event) => (
                <li key={event.id}>
                  <span className="admin-activity-dot" />
                  <div>
                    <strong>{event.action.replaceAll('_', ' ').replaceAll('.', ' · ')}</strong>
                    <p>
                      {event.actor_name || 'Authorized administrator'} · {event.record_type}
                    </p>
                    <small>{date(event.created_at)}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
function ChevronArrow() {
  return <ArrowRight size={16} />;
}
export function Students() {
  const [query, setQuery] = useSearchParams();
  const selectedId = query.get('student') || '';
  const [search, setSearch] = useState(''),
    [faculty, setFaculty] = useState(''),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0),
    [data, setData] = useState<{ rows: Student[]; total: number }>(),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError('');
    const timer = setTimeout(() => {
      void adminRPC<{ rows: Student[]; total: number }>('instructor_students', {
        p_search: selectedId ? '' : search,
        p_faculty: selectedId ? '' : faculty,
        p_id: selectedId || null,
        p_offset: selectedId ? 0 : page * 25,
        p_limit: 25,
      })
        .then((result) => {
          if (live) setData(result);
        })
        .catch((e) => {
          if (live) setError(adminError(e));
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, faculty, page, refresh, selectedId]);
  const selected = selectedId && data?.rows[0];
  if (selectedId)
    return (
      <section className="admin-student-detail">
        <button className="text-button" onClick={() => setQuery({})}>
          <ArrowLeft size={15} />
          Back to students
        </button>
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
              Retry student
            </button>
          </>
        ) : !data ? (
          <p role="status">Loading student details…</p>
        ) : !selected ? (
          <p className="empty-state">This student could not be found.</p>
        ) : (
          <>
            <div className="form-card admin-student-profile">
              <span className="admin-avatar">
                {(selected.full_name || 'Student')
                  .split(' ')
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <h2>{selected.full_name || 'Profile incomplete'}</h2>
                <p>{selected.email || 'Email unavailable'}</p>
                <div className="admin-profile-meta">
                  <span>{selected.phone || 'No phone provided'}</span>
                  <span>{facultyLabel(selected.faculty)}</span>
                  <span>ID: {selected.student_id || 'Not collected'}</span>
                  <span>Registered {date(selected.created_at)}</span>
                </div>
              </div>
              <div className="admin-student-counts">
                <strong>
                  {selected.started}
                  <small>Started</small>
                </strong>
                <strong>
                  {selected.submissions}
                  <small>Submitted</small>
                </strong>
              </div>
            </div>
            <Attempts student={selected.id} allAttempts />
          </>
        )}
      </section>
    );
  return (
    <section>
      <div className="admin-card-heading">
        <div>
          <h2>Student directory</h2>
          <p>Contact information and progress in one place.</p>
        </div>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={15} />
          Refresh students
        </button>
      </div>
      <div className="table-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            aria-label="Search students"
            placeholder="Search name, email or student ID"
            maxLength={200}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <FacultyFilter
          value={faculty}
          onChange={(value) => {
            setFaculty(value);
            setPage(0);
          }}
        />
        {(search || faculty) && (
          <button
            className="text-button"
            onClick={() => {
              setSearch('');
              setFaculty('');
              setPage(0);
            }}
          >
            Clear filters
          </button>
        )}
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
              <table className="admin-directory-table admin-mobile-cards" role="table">
                <thead>
                  <tr>
                    {[
                      'Student',
                      'Contact & faculty',
                      'Assessment progress',
                      'Registered · Cairo',
                      'Details',
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Student">
                        <strong>{s.full_name || 'Profile incomplete'}</strong>
                        <small>{s.email}</small>
                        {s.student_id && <small>ID · {s.student_id}</small>}
                      </td>
                      <td data-label="Contact & faculty">
                        {s.phone || 'No phone'}
                        <small>{facultyLabel(s.faculty)}</small>
                      </td>
                      <td data-label="Assessment progress">
                        <span className="admin-progress-count">{s.started} started</span>
                        <small>{s.submissions} submitted</small>
                      </td>
                      <td data-label="Registered · Cairo">{date(s.created_at)}</td>
                      <td data-label="Details">
                        <button
                          className="outline-button"
                          onClick={() => setQuery({ student: s.id })}
                        >
                          View student
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && (
                <div className="empty-state">
                  <Users size={28} />
                  <strong>No students match your filters.</strong>
                  <small>Try another name, email or faculty.</small>
                </div>
              )}
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
    [managementState, setManagementState] = useState('active'),
    [search, setSearch] = useState(routeParams.get('search') || ''),
    [faculty, setFaculty] = useState(''),
    [type, setType] = useState(''),
    [assessment, setAssessment] = useState(''),
    [status, setStatus] = useState(routeParams.get('status') || (results ? 'graded' : '')),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [showOngoing, setShowOngoing] = useState(allAttempts || routeParams.get('ongoing') === '1'),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0),
    [data, setData] = useState<{ rows: Attempt[]; total: number }>(),
    [error, setError] = useState(''),
    [optionError, setOptionError] = useState(''),
    [selected, setSelected] = useState<Attempt | null>(null),
    [exporting, setExporting] = useState(false),
    [assessments, setAssessments] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    let live = true;
    setOptionError('');
    void Promise.all([
      adminRPC<Array<{ id: string; title: string }>>('manage_course_options'),
      (async () => {
        const rows: Array<{ id: string; title: string }> = [];
        for (let offset = 0; ; offset += 100) {
          const { data, error } = await requireBackend()
            .from('assignments')
            .select('id,title')
            .order('id')
            .range(offset, offset + 99);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < 100) return rows;
        }
      })(),
    ])
      .then(([courseRows, assessmentRows]) => {
        if (live) {
          setCourses(courseRows || []);
          setAssessments(assessmentRows);
        }
      })
      .catch((e) => {
        if (live) setOptionError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  const params = {
    p_search: search,
    p_faculty: faculty,
    p_type: type,
    p_assessment: assessment || null,
    p_student: selectedStudent || null,
    p_course: course || null,
    p_management_state: managementState,
    p_status: status,
    p_from: from ? cairoDayBoundary(from) : null,
    p_to: to ? cairoDayBoundary(to, true) : null,
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
        .then((result) => {
          if (live) setData(result);
        })
        .catch((e) => {
          if (live) setError(adminError(e));
        });
    }, 180);
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
  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };
  if (selected)
    return (
      <AttemptDetail
        attempt={selected}
        back={() => {
          setSelected(null);
          setRefresh((n) => n + 1);
        }}
      />
    );
  const clear = () => {
    setSearch('');
    setFaculty('');
    setType('');
    setAssessment('');
    setStatus('');
    setFrom('');
    setTo('');
    setCourse('');
    setManagementState('active');
    setPage(0);
    setShowOngoing(allAttempts);
  };
  return (
    <section className="admin-submissions">
      <div className="admin-card-heading">
        <div>
          <h2>{student ? 'Submission history & grades' : 'Submission queue'}</h2>
          <p>Practical and theory marks stay separate. Students see grades after release.</p>
        </div>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={15} />
          Refresh submissions
        </button>
      </div>
      {optionError && (
        <p className="error" role="alert">
          Some filters could not be loaded: {optionError}
        </p>
      )}
      <div className="table-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            aria-label="Search student name, email or ID"
            placeholder="Find a student or submission"
            maxLength={200}
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
          />
        </div>
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
          aria-label="Submission status filter"
          value={status}
          onChange={(e) => {
            change(setStatus)(e.target.value);
            if (
              e.target.value === 'in_progress' ||
              e.target.value === 'restarted' ||
              e.target.value === 'invalidated'
            )
              setShowOngoing(true);
          }}
        >
          <option value="">All statuses</option>
          {[
            'pending_review',
            'submitted',
            'graded',
            'expired',
            'in_progress',
            'restarted',
            'invalidated',
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
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
                const batch = await adminRPC<{
                  rows: Attempt[];
                  total: number;
                }>('manage_attempts', {
                  ...params,
                  p_offset: offset,
                  p_limit: 100,
                });
                total = batch.total;
                rows.push(...batch.rows);
                if (!batch.rows.length) break;
              }
              const url = URL.createObjectURL(
                new Blob([resultsCSV([...new Map(rows.map((r) => [r.id, r])).values()])], {
                  type: 'text/csv;charset=utf-8',
                }),
              );
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'ieee-git-lab-grades.csv';
              anchor.click();
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
      <details className="admin-more-filters">
        <summary>
          More filters<span>Course, faculty, dates & retained records</span>
        </summary>
        <div className="table-toolbar">
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
            aria-label="Assessment type filter"
            value={type}
            onChange={(e) => change(setType)(e.target.value)}
          >
            <option value="">Assignments & exams</option>
            <option value="assignment">Assignments</option>
            <option value="exam">Exams</option>
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
          <label>
            From · Cairo
            <input
              aria-label="Submitted from date"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => change(setFrom)(e.target.value)}
            />
          </label>
          <label>
            To · Cairo
            <input
              aria-label="Submitted to date"
              type="date"
              value={to}
              min={from || undefined}
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
          <button className="text-button" onClick={clear}>
            Reset filters
          </button>
        </div>
      </details>
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
              <table className="admin-submission-table admin-mobile-cards" role="table">
                <thead>
                  <tr>
                    {[
                      'Student',
                      'Assessment',
                      'Submitted · Cairo',
                      'Status & release',
                      'Practical',
                      'Theory',
                      'Total',
                      'Review',
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Student">
                        <strong>{r.profiles?.full_name || 'Profile unavailable'}</strong>
                        <small>{r.profiles?.email || '—'}</small>
                      </td>
                      <td data-label="Assessment">
                        <strong>{r.assignments?.title || 'Retained assessment'}</strong>
                        <small>
                          Version {r.assignment_version} · Attempt {r.attempt_number}
                        </small>
                      </td>
                      <td data-label="Submitted · Cairo">
                        {date(r.submitted_at)}
                        {r.auto_submitted && <small>Automatically submitted</small>}
                      </td>
                      <td data-label="Status & release">
                        <span
                          className="status-badge"
                          data-tone={
                            r.released ? 'published' : r.status === 'graded' ? 'hidden' : 'draft'
                          }
                        >
                          {r.status.replaceAll('_', ' ')}
                        </span>
                        <small>
                          {r.released
                            ? 'Released to student'
                            : r.status === 'graded'
                              ? 'Finalized privately'
                              : r.status === 'in_progress'
                                ? 'Work in progress'
                                : ['restarted', 'invalidated'].includes(r.status)
                                  ? 'Retained history'
                                  : 'Pending review'}
                        </small>
                      </td>
                      <td data-label="Practical">{r.practical_score ?? '—'}</td>
                      <td data-label="Theory">{r.theory_score ?? 'Pending'}</td>
                      <td data-label="Total">
                        <strong>
                          {r.practical_score !== null && r.theory_score !== null
                            ? sumPoints([Number(r.practical_score), Number(r.theory_score)])
                            : 'Pending'}
                        </strong>
                      </td>
                      <td data-label="Review">
                        <button className="outline-button" onClick={() => setSelected(r)}>
                          Review submission
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && (
                <div className="empty-state">
                  <ClipboardCheck size={28} />
                  <strong>No attempts match your filters.</strong>
                  <small>Try another assessment or include in-progress attempts.</small>
                </div>
              )}
            </div>
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
