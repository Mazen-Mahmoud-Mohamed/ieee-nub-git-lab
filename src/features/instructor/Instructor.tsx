import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  Search,
  Download,
  Users,
  ClipboardCheck,
  BarChart3,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { requireBackend } from '../../services/supabase';
import { firstAssessment, totals, type Definition } from '../assessments/model';
import { AssessmentManager, AssessmentEditor, QuestionBank } from './AssessmentEditor';
import { GitEngine, type RepoView, type Activity } from '../git-engine/engine';
import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS';
import { GitGraph } from '../../components/GitGraph';
import { FACULTIES, facultyLabel, type Faculty } from '../auth/faculty';
type Attempt = {
  id: string;
  student_id: string;
  assignment_id: string;
  assignment_version: number;
  assignments: { title: string; type: string } | null;
  status: string;
  practical_score: number | null;
  theory_score: number | null;
  receipt: string | null;
  created_at: string;
  submitted_at: string | null;
  identity_snapshot: Record<string, unknown> | null;
  released: boolean;
  feedback: string | null;
  profiles: {
    full_name: string;
    email: string | null;
    phone: string | null;
    student_id: string;
    department: string;
    faculty: Faculty | null;
    academic_year: string;
  } | null;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function Instructor() {
  return (
    <div className="page instructor">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INSTRUCTOR CONSOLE</span>
          <h1>A clearer view of learning.</h1>
          <p>Review real repository histories. Help the next commit be a better one.</p>
        </div>
        <span className="badge">AUTHORIZED INSTRUCTOR</span>
      </div>
      <nav className="instructor-nav">
        <NavLink end to="/instructor">
          Attempts & grades
        </NavLink>
        <NavLink to="/instructor/assessments">Assignments & exams</NavLink>
        <NavLink to="/instructor/questions">Questions</NavLink>
        <NavLink to="/instructor/settings">Settings</NavLink>
      </nav>
      <Routes>
        <Route index element={<Attempts />} />
        <Route path="assessments" element={<AssessmentManager />} />
        <Route path="assessments/:id" element={<AssessmentEditor />} />
        <Route path="assignments" element={<AssessmentManager />} />
        <Route path="questions" element={<QuestionBank />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
function Attempts() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [assessmentFilter, setAssessmentFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [faculty, setFaculty] = useState('');
  const [year, setYear] = useState('');
  const [selected, setSelected] = useState<Attempt | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      const client = requireBackend();
      const { data, error } = await client.rpc('instructor_submissions');
      if (error) throw error;
      setRows(
        (data || []).map((r: Attempt & { grading_summaries: unknown }) => {
          const grade = (
            Array.isArray(r.grading_summaries) ? r.grading_summaries[0] : r.grading_summaries
          ) as Partial<
            Pick<Attempt, 'practical_score' | 'theory_score' | 'released' | 'feedback'>
          > | null;
          return {
            ...r,
            practical_score: grade?.practical_score ?? null,
            theory_score: grade?.theory_score ?? null,
            released: grade?.released ?? false,
            feedback: grade?.feedback ?? null,
          };
        }) as Attempt[],
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const filtered = rows.filter(
    (r) =>
      (!search ||
        `${r.profiles?.full_name} ${r.profiles?.email} ${r.profiles?.student_id}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!department || r.profiles?.department === department) &&
      (!faculty || r.profiles?.faculty === faculty) &&
      (!year || r.profiles?.academic_year === year) &&
      (!assessmentFilter || r.assignment_id === assessmentFilter),
  );
  const graded = rows.filter((r) => r.status === 'graded');
  const submitted = rows.filter((r) =>
    ['submitted', 'pending_review', 'expired', 'graded'].includes(r.status),
  );
  if (selected)
    return (
      <AttemptDetail
        attempt={selected}
        back={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  return (
    <>
      <div className="stat-grid">
        {[
          [ClipboardCheck, 'Submitted', submitted.length],
          [RefreshCw, 'In progress', rows.filter((r) => r.status === 'in_progress').length],
          [BarChart3, 'Graded', graded.length],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Users;
          return (
            <div className="stat" key={String(label)}>
              <I size={19} />
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      <div className="table-toolbar">
        <select
          aria-label="Faculty filter"
          value={faculty}
          onChange={(e) => setFaculty(e.target.value)}
        >
          <option value="">All faculties</option>
          {FACULTIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Assessment filter"
          value={assessmentFilter}
          onChange={(e) => setAssessmentFilter(e.target.value)}
        >
          <option value="">All assignments & exams</option>
          {[
            ...new Map(
              rows.map((r) => [r.assignment_id, r.assignments?.title || r.assignment_id]),
            ).entries(),
          ].map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search student name, email or ID"
            placeholder="Search name, email or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <details className="extra-filters">
          <summary>More filters</summary>
          <select
            aria-label="Department filter"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {[...new Set(rows.map((r) => r.profiles?.department).filter(Boolean))].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            aria-label="Academic year filter"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">All years</option>
            {[...new Set(rows.map((r) => r.profiles?.academic_year).filter(Boolean))].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </details>
        <button
          className="outline-button"
          onClick={() => {
            const quote = (v: unknown) =>
              '"' +
              String(v ?? '')
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replace(/"/g, '""') +
              '"';
            const csv = [
              [
                'Name',
                'Email',
                'Phone',
                'Submitted at',
                'Student ID',
                'Department',
                'Faculty',
                'Year',
                'Assessment',
                'Type',
                'Version',
                'Status',
                'Practical',
                'Theory',
                'Released',
                'Reference',
              ],
              ...filtered.map((r) => [
                r.profiles?.full_name,
                r.profiles?.email,
                r.profiles?.phone,
                r.submitted_at,
                r.profiles?.student_id,
                r.profiles?.department,
                facultyLabel(r.profiles?.faculty),
                r.profiles?.academic_year,
                r.assignments?.title,
                r.assignments?.type,
                r.assignment_version,
                r.status,
                r.practical_score,
                r.theory_score,
                r.released,
                r.receipt,
              ]),
            ]
              .map((r) => r.map(quote).join(','))
              .join('\r\n');
            const url = URL.createObjectURL(
              new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ieee-git-lab-grades.csv';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading attempts…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Submitted</th>
                <th>Faculty</th>
                <th>Assessment</th>
                <th>Status</th>
                <th>Practical</th>
                <th>Theory</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.profiles?.full_name || 'Profile unavailable'}</strong>
                    <small>{r.profiles?.student_id}</small>
                  </td>
                  <td>{r.profiles?.email || '—'}</td>
                  <td>{r.profiles?.phone || '—'}</td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                  <td>{facultyLabel(r.profiles?.faculty)}</td>
                  <td>
                    {r.assignments?.title}
                    <small>{r.assignments?.type}</small>
                  </td>
                  <td>
                    <span className="badge">{r.status.replace('_', ' ')}</span>
                  </td>
                  <td>{r.practical_score ?? '—'}</td>
                  <td>{r.theory_score ?? 'Pending'}</td>
                  <td>
                    <button className="text-button" onClick={() => setSelected(r)}>
                      Inspect attempt →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="empty-state">No attempts match your filters.</p>}
        </div>
      )}
    </>
  );
}
function AttemptDetail({ attempt, back }: { attempt: Attempt; back: () => void }) {
  const [view, setView] = useState<RepoView>();
  const [definition, setDefinition] = useState<Definition>(firstAssessment);
  const questions = definition.questions;
  const points = totals(definition);
  const [taskResults, setTaskResults] = useState<
    Array<{ task_key: string; passed: boolean; points: number }>
  >([]);
  const [events, setEvents] = useState<Activity[]>([]);
  const [answers, setAnswers] = useState<Array<{ question_id: string; answer: string }>>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState(attempt.feedback || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const client = requireBackend();
        const [snapshot, answerData, eventData, gradeData, stateData, taskData] = await Promise.all(
          [
            client
              .from('workspace_snapshots')
              .select('snapshot')
              .eq('attempt_id', attempt.id)
              .maybeSingle(),
            client
              .from('student_answers')
              .select('question_id,answer')
              .eq('attempt_id', attempt.id),
            client
              .from('command_events')
              .select('event')
              .eq('attempt_id', attempt.id)
              .order('sequence'),
            client
              .from('grading_results')
              .select('question_id,points')
              .eq('attempt_id', attempt.id),
            client.rpc('assessment_state', { p_attempt: attempt.id }),
            client
              .from('task_results')
              .select('task_key,passed,points')
              .eq('attempt_id', attempt.id),
          ],
        );
        for (const r of [snapshot, answerData, eventData, gradeData, stateData, taskData])
          if (r.error) throw r.error;
        const pinned = stateData.data.definition as Definition;
        setDefinition(pinned);
        setTaskResults(taskData.data || []);
        if (snapshot.data) {
          const engine = new GitEngine(
            VirtualFS.restore(snapshot.data.snapshot as Snapshot),
            '/' + pinned.projectName,
          );
          setView(await engine.inspect());
        }
        setAnswers(answerData.data || []);
        setEvents((eventData.data || []).map((e) => e.event));
        setScores(
          Object.fromEntries((gradeData.data || []).map((r) => [r.question_id, String(r.points)])),
        );
      } catch (e) {
        setError(message(e));
      }
    })();
  }, [attempt.id]);
  const grade = async (release: boolean) => {
    setBusy(true);
    setError('');
    try {
      const { error } = await requireBackend().rpc('grade_assessment', {
        p_attempt: attempt.id,
        p_grades: questions
          .filter(
            (q) =>
              (q.manual || !['single', 'multiple', 'boolean'].includes(q.kind)) && q.points > 0,
          )
          .map((q) => ({ question_id: q.id, points: Number(scores[q.id] || 0) })),
        p_feedback: feedback,
        p_release: release,
      });
      if (error) throw error;
      setNotice(release ? 'Grade published to the student.' : 'Grade saved privately.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="text-button" onClick={back}>
        <ArrowLeft size={16} />
        Back to attempts
      </button>
      <h2>{attempt.profiles?.full_name}</h2>
      <p>
        {attempt.profiles?.email} · {attempt.profiles?.phone || 'Phone not provided'} ·{' '}
        {facultyLabel(attempt.profiles?.faculty)}
      </p>
      <p>
        {attempt.submitted_at
          ? 'Submitted ' + new Date(attempt.submitted_at).toLocaleString()
          : 'Not yet submitted'}
        .{' '}
        {attempt.identity_snapshot
          ? 'Contact details captured at submission.'
          : 'Current account contact details; this older attempt has no submission identity snapshot.'}
      </p>
      <p>
        {attempt.profiles?.student_id} · {attempt.status} · {attempt.receipt || 'Not submitted'}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="instructor-detail">
        <section className="form-card">
          <h3>Verified repository</h3>
          {view ? <GitGraph view={view} /> : <p>No finalized repository snapshot.</p>}
          <h3>Practical results</h3>
          {taskResults.map((t) => (
            <p className={t.passed ? 'passed' : 'muted'} key={t.task_key}>
              {definition.sections.flatMap((s) => s.tasks).find((x) => x.id === t.task_key)
                ?.title || t.task_key}{' '}
              · {t.points} points
            </p>
          ))}
          <h3>Activity timeline</h3>
          <p className="muted">Supporting student-provided activity, not a verified replay.</p>
          <div className="timeline">
            {events.map((e, i) => (
              <details key={i}>
                <summary>
                  <span className={e.success ? 'passed' : 'error'}>{e.success ? '✓' : '×'}</span>
                  <code>{e.command}</code>
                  <small>
                    {e.branch} · {new Date(e.timestamp).toLocaleString()}
                  </small>
                </summary>
                <pre>{e.output}</pre>
                <code>Checkpoint: {e.head || 'unborn HEAD'}</code>
              </details>
            ))}
          </div>
        </section>
        <section className="form-card">
          <h3>Written responses</h3>
          {questions.map((q) => {
            const a = answers.find((a) => a.question_id === q.id) || {
              question_id: q.id,
              answer: 'Unanswered',
            };
            return (
              <article className="grading-question" key={a.question_id}>
                <h4>{q?.prompt || a.question_id + ' reflection'}</h4>
                <p className="written-answer">{a.answer}</p>
                {q &&
                  (q.manual || !['single', 'multiple', 'boolean'].includes(q.kind)) &&
                  q.points > 0 && (
                    <label>
                      Points (0–{q.points})
                      <input
                        type="number"
                        min="0"
                        max={q.points}
                        step="0.5"
                        value={scores[q.id] || ''}
                        onChange={(e) => setScores({ ...scores, [q.id]: e.target.value })}
                      />
                    </label>
                  )}
              </article>
            );
          })}
          <label>
            Instructor feedback
            <textarea
              maxLength={5000}
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <p>
            Theory total: {Object.values(scores).reduce((s, n) => s + Number(n || 0), 0)} /{' '}
            {points.theory} · Practical: {attempt.practical_score ?? 'Pending'}
          </p>
          <div className="review-actions">
            <button
              className="outline-button"
              disabled={busy || attempt.status === 'in_progress'}
              onClick={() => void grade(false)}
            >
              Save draft grade
            </button>
            <button
              className="primary"
              disabled={busy || attempt.status === 'in_progress'}
              onClick={() => void grade(true)}
            >
              Publish grade
            </button>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { error } = await requireBackend().rpc('approve_retake', {
                  p_attempt: attempt.id,
                });
                if (error) throw error;
                setNotice('Retake approved. Student may start a new attempt.');
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Approve a new retake
          </button>
        </section>
      </div>
    </>
  );
}
function Settings() {
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void requireBackend()
      .from('app_settings')
      .select('accessibility_paste')
      .eq('id', true)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setEnabled(data.accessibility_paste);
      });
  }, []);
  return (
    <section className="form-card narrow">
      <h2>Assessment accessibility</h2>
      <p>
        Enable paste access for the class when assistive technology, language tools, or an
        accommodation requires it. This does not affect repository verification.
      </p>
      <label className="checkbox-label">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Allow paste in protected answer fields
      </label>
      <button
        className="primary"
        onClick={async () => {
          const { error } = await requireBackend().rpc('update_settings', { p_paste: enabled });
          if (error) setError(error.message);
          else setNotice('Accessibility setting saved and audited.');
        }}
      >
        Save settings
      </button>
      {error && <p className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <hr />
      <h3>Data retention</h3>
      <p>
        Use the documented privileged retention procedure after the institution’s appeal period.
        Export required records first. Student data is private and is never used to train this
        application.
      </p>
    </section>
  );
}
