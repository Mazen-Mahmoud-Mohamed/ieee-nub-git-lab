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
  Save,
} from 'lucide-react';
import { requireBackend } from '../../services/supabase';
import { questions, ASSIGNMENT_ID } from '../assignments/assignment';
import { GitEngine, type RepoView, type Activity } from '../git-engine/engine';
import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS';
import { GitGraph } from '../../components/GitGraph';
type Attempt = {
  id: string;
  student_id: string;
  status: string;
  practical_score: number | null;
  theory_score: number | null;
  receipt: string | null;
  created_at: string;
  released: boolean;
  feedback: string | null;
  profiles: {
    full_name: string;
    student_id: string;
    department: string;
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
        <NavLink to="/instructor/assignments">Assignments</NavLink>
        <NavLink to="/instructor/questions">Questions</NavLink>
        <NavLink to="/instructor/settings">Settings</NavLink>
      </nav>
      <Routes>
        <Route index element={<Attempts />} />
        <Route path="assignments" element={<AssignmentManager />} />
        <Route path="questions" element={<QuestionManager />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
function Attempts() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [enrolled, setEnrolled] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [selected, setSelected] = useState<Attempt | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      const client = requireBackend();
      const { data, error } = await client
        .from('attempts')
        .select(
          '*,profiles(full_name,student_id,department,academic_year),grading_summaries(practical_score,theory_score,released,feedback)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(
        (data || []).map((r) => ({
          ...r,
          ...(Array.isArray(r.grading_summaries) ? r.grading_summaries[0] : r.grading_summaries),
        })) as unknown as Attempt[],
      );
      const response = await client
        .from('student_enrollments')
        .select('student_id', { count: 'exact', head: true });
      if (response.error) throw response.error;
      setEnrolled(response.count || 0);
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
        `${r.profiles?.full_name} ${r.profiles?.student_id}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!department || r.profiles?.department === department) &&
      (!year || r.profiles?.academic_year === year),
  );
  const graded = rows.filter((r) => r.status === 'graded');
  const submitted = rows.filter((r) => ['submitted', 'graded'].includes(r.status));
  const average = graded.length
    ? (
        graded.reduce((sum, r) => sum + (r.practical_score || 0) + (r.theory_score || 0), 0) /
        graded.length
      ).toFixed(1)
    : '—';
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
          [Users, 'Enrolled students', enrolled],
          [ClipboardCheck, 'Started attempts', rows.length],
          [RefreshCw, 'In progress', rows.filter((r) => r.status === 'in_progress').length],
          [ClipboardCheck, 'Submitted', submitted.length],
          [BarChart3, 'Graded', graded.length],
          [BarChart3, 'Average verified score', average],
          [
            ClipboardCheck,
            'Completion',
            enrolled
              ? Math.round((new Set(submitted.map((r) => r.student_id)).size / enrolled) * 100) +
                '%'
              : '—',
          ],
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
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search student name or ID"
            placeholder="Search name or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
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
                'Student ID',
                'Department',
                'Year',
                'Status',
                'Practical',
                'Theory',
                'Released',
                'Reference',
              ],
              ...filtered.map((r) => [
                r.profiles?.full_name,
                r.profiles?.student_id,
                r.profiles?.department,
                r.profiles?.academic_year,
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
                <th>Department</th>
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
                  <td>{r.profiles?.department}</td>
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
        const [snapshot, answerData, eventData, gradeData] = await Promise.all([
          client
            .from('workspace_snapshots')
            .select('snapshot')
            .eq('attempt_id', attempt.id)
            .maybeSingle(),
          client.from('student_answers').select('question_id,answer').eq('attempt_id', attempt.id),
          client
            .from('command_events')
            .select('event')
            .eq('attempt_id', attempt.id)
            .order('sequence'),
          client.from('grading_results').select('question_id,points').eq('attempt_id', attempt.id),
        ]);
        for (const r of [snapshot, answerData, eventData, gradeData]) if (r.error) throw r.error;
        if (snapshot.data) {
          const engine = new GitEngine(VirtualFS.restore(snapshot.data.snapshot as Snapshot));
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
      const { error } = await requireBackend().rpc('grade_attempt', {
        p_attempt: attempt.id,
        p_grades: questions.map((q) => ({ question_id: q.id, points: Number(scores[q.id] || 0) })),
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
          {answers.map((a) => {
            const q = questions.find((q) => q.id === a.question_id);
            return (
              <article className="grading-question" key={a.question_id}>
                <h4>{q?.prompt || a.question_id + ' reflection'}</h4>
                <p className="written-answer">{a.answer}</p>
                {q && (
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
            Theory total: {Object.values(scores).reduce((s, n) => s + Number(n || 0), 0)} / 25 ·
            Practical: {attempt.practical_score ?? 'Pending'}
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
function AssignmentManager() {
  const [row, setRow] = useState<Record<string, any>>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void requireBackend()
      .from('assignments')
      .select('*')
      .eq('id', ASSIGNMENT_ID)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRow(data);
      });
  }, []);
  if (!row) return <p>{error || 'Loading assignment…'}</p>;
  return (
    <form
      className="form-card narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        const { error } = await requireBackend().rpc('manage_assignment', {
          p_assignment: ASSIGNMENT_ID,
          p_title: row.title,
          p_visible: row.visible,
          p_starts_at: row.starts_at || null,
          p_deadline: row.deadline || null,
          p_allow_retake: row.allow_retake,
          p_review_answers: row.review_answers,
        });
        if (error) setError(error.message);
        else setNotice('Assignment settings saved and audited.');
      }}
    >
      <h2>Assignment 01</h2>
      <label>
        Title
        <input
          required
          maxLength={180}
          value={row.title}
          onChange={(e) => setRow({ ...row, title: e.target.value })}
        />
      </label>
      {['starts_at', 'deadline'].map((key) => (
        <label key={key}>
          {key === 'starts_at' ? 'Start date' : 'Deadline'}
          <input
            type="datetime-local"
            value={row[key]?.slice(0, 16) || ''}
            onChange={(e) =>
              setRow({
                ...row,
                [key]: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </label>
      ))}
      {[
        ['visible', 'Visible to students'],
        ['allow_retake', 'Allow students to start retakes'],
        ['review_answers', 'Allow answer review after submission'],
      ].map(([key, label]) => (
        <label className="checkbox-label" key={key}>
          <input
            type="checkbox"
            checked={row[key]}
            onChange={(e) => setRow({ ...row, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      {error && <p className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button className="primary">
        <Save size={16} />
        Save settings
      </button>
    </form>
  );
}
function QuestionManager() {
  const [rows, setRows] = useState<
    Array<{ id: string; prompt: string; kind: string; points: number; options: string[] }>
  >([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void requireBackend()
      .from('questions')
      .select('id,prompt,kind,points,options')
      .eq('assignment_id', ASSIGNMENT_ID)
      .order('position')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data || []);
      });
  }, []);
  return (
    <section className="form-card">
      <h2>Questions & rubrics</h2>
      <p className="muted">
        Assignment 01 retains its twelve required written questions. Edit instructor rubrics here;
        new assignments can use the schema’s objective question types. Answer keys live in a private
        schema.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {rows.map((q, i) => (
        <details key={q.id}>
          <summary>
            Q{i + 1} · {q.prompt}
          </summary>
          <QuestionRubric id={q.id} onNotice={setNotice} onError={setError} />
        </details>
      ))}
    </section>
  );
}
function QuestionRubric({
  id,
  onNotice,
  onError,
}: {
  id: string;
  onNotice: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [rubric, setRubric] = useState('');
  useEffect(() => {
    void requireBackend()
      .rpc('get_question_rubric', { p_question: id })
      .then(({ data, error }) => {
        if (error) onError(error.message);
        else setRubric(data || '');
      });
  }, [id]);
  return (
    <div className="rubric">
      <label>
        Instructor rubric / explanation
        <textarea
          rows={4}
          maxLength={5000}
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
        />
      </label>
      <button
        className="outline-button"
        onClick={async () => {
          const { error } = await requireBackend().rpc('set_question_rubric', {
            p_question: id,
            p_rubric: rubric,
          });
          if (error) onError(error.message);
          else onNotice('Private rubric saved.');
        }}
      >
        Save private rubric
      </button>
    </div>
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
