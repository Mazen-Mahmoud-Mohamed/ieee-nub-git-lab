import { CourseGrades } from './CourseGrades';
import { taskOneDefinition } from './taskOne';
import { assessmentSummary } from './presentation';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronDown, Clock, GitBranch, GraduationCap } from 'lucide-react';
import { supabase, type Profile } from '../../services/supabase';
import { sumPoints, totals, type Definition, type AssessmentRecord } from './model';
import { TASK_ONE_ID } from '../assignments/assignment';
type Card = AssessmentRecord & { definition: Definition };
type Attempt = {
  id: string;
  assignment_id: string;
  assignment_version: number;
  definition?: Definition;
  status: string;
  receipt: string;
  released?: boolean;
  practical_score?: number;
  theory_score?: number;
  feedback?: string;
};
export function CourseDashboard({ profile }: { profile: Profile | null }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (!supabase || !profile) {
        setCards([
          {
            id: TASK_ONE_ID,
            version: 1,
            type: 'assignment',
            title: taskOneDefinition().title,
            description: taskOneDefinition().description,
            visible: true,
            archived: false,
            definition: taskOneDefinition(),
          },
        ]);
        setAttempts([]);
        return;
      }
      const client = supabase;
      const [definitions, versions, work, results] = await Promise.all([
        client.from('assignments').select('*').eq('visible', true).eq('archived', false),
        client.from('assessment_versions').select('assessment_id,version,document'),
        client
          .from('attempts')
          .select('id,assignment_id,assignment_version,status,receipt')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false }),
        client.from('released_results').select('*'),
      ]);
      for (const r of [definitions, versions, work, results]) if (r.error) throw r.error;
      setCards(
        (definitions.data || [])
          .map((a) => ({
            ...a,
            definition: versions.data?.find(
              (v) => v.assessment_id === a.id && v.version === a.published_version,
            )?.document,
          }))
          .filter((a) => a.definition?.gradingPolicy === 'independent-v2'),
      );
      setAttempts(
        (work.data || []).map((a) => ({
          ...a,
          definition: versions.data?.find(
            (v) => v.assessment_id === a.assignment_id && v.version === a.assignment_version,
          )?.document,
          ...results.data?.find((r) => r.attempt_id === a.id),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [profile?.id]);
  const available = cards.filter((card) => card.type === 'assignment');
  const exams = cards.filter((card) => card.type === 'exam');
  const submitted = cards.filter((card) =>
    attempts.some(
      (attempt) =>
        attempt.assignment_id === card.id &&
        ['submitted', 'graded', 'pending_review', 'expired'].includes(attempt.status),
    ),
  ).length;
  const upcoming = [
    { slot: 'task2', label: 'Task 2' },
    { slot: 'final', label: 'Final Exam' },
  ].filter(({ slot }) => !cards.some((card) => card.definition.courseSlot === slot));

  function renderCard(a: Card) {
    const d = a.definition;
    const history = attempts.filter((attempt) => attempt.assignment_id === a.id);
    const [attempt, ...earlier] = history;
    const points = totals(d);
    const originalPoints = attempt?.definition ? totals(attempt.definition) : null;
    const now = Date.now();
    const closed = [d.endsAt, d.deadline].some((date) => date && Date.parse(date) <= now);
    const scheduled = !!d.startsAt && Date.parse(d.startsAt) > now;
    const active = attempt?.status === 'in_progress';
    const status = attempt?.released
      ? 'Grade released'
      : attempt?.status === 'pending_review'
        ? 'Awaiting review'
        : active
          ? 'In progress'
          : attempt
            ? attempt.status.replaceAll('_', ' ')
            : closed
              ? 'Closed'
              : scheduled
                ? 'Scheduled'
                : 'Not started';
    const path = '/assessments/' + a.id;
    const destination = attempt
      ? path +
        '/attempts/' +
        attempt.id +
        '/' +
        (active
          ? (attempt.definition ?? d).format === 'theory'
            ? 'theory'
            : 'workspace'
          : attempt.status === 'restarted'
            ? 'workspace'
            : 'result')
      : path;
    const action = active
      ? d.type === 'exam'
        ? 'Continue Exam'
        : 'Continue assignment'
      : attempt
        ? d.type === 'exam'
          ? 'View Result'
          : 'View submission'
        : closed || scheduled
          ? 'View details'
          : d.type === 'exam'
            ? 'Start Exam'
            : 'Start assignment';
    return (
      <article className="lab-assignment-card" key={a.id}>
        <span className="lab-assignment-icon" aria-hidden="true">
          {a.type === 'exam' ? <Clock /> : <GitBranch />}
        </span>
        <div className="lab-assignment-content">
          <div className="lab-assignment-status">
            <span className="lab-kicker">{a.type}</span>
            <span className={attempt?.released ? 'lab-state lab-state-done' : 'lab-state'}>
              {status}
            </span>
          </div>
          <h3 dir="auto">{d.title}</h3>
          <p>
            {assessmentSummary(d)} · {sumPoints([points.practical, points.theory])} points
            {points.bonus ? ' + ' + points.bonus + ' bonus' : ''}
          </p>
          {d.type === 'exam' && (
            <small>
              {d.durationMinutes} min · {d.attemptLimit} attempt{d.attemptLimit === 1 ? '' : 's'}
            </small>
          )}
          {scheduled && <small>Opens {new Date(d.startsAt!).toLocaleString()}</small>}
          {(d.endsAt || d.deadline) && (
            <small>Deadline {new Date(d.endsAt || d.deadline!).toLocaleString()}</small>
          )}
          {attempt?.released && (
            <p className="result-summary">
              Score:{' '}
              {sumPoints([Number(attempt.practical_score) || 0, Number(attempt.theory_score) || 0])}{' '}
              /{' '}
              {originalPoints ? sumPoints([originalPoints.practical, originalPoints.theory]) : '—'}
              {originalPoints?.bonus ? ' + bonus' : ''} · Version {attempt.assignment_version}
              {attempt.feedback && (
                <span className="lab-grade-feedback" dir="auto">
                  {attempt.feedback}
                </span>
              )}
            </p>
          )}
          {earlier.length > 0 && (
            <details className="lab-previous-attempts">
              <summary>Previous attempts</summary>
              <ul>
                {earlier.map((old) => (
                  <li key={old.id}>
                    <Link
                      to={
                        path +
                        '/attempts/' +
                        old.id +
                        '/' +
                        (old.status === 'restarted' ? 'workspace' : 'result')
                      }
                    >
                      {old.status === 'restarted'
                        ? 'Previous work (restarted)'
                        : old.status.replaceAll('_', ' ')}{' '}
                      · {old.id.slice(0, 8)}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="lab-assignment-actions">
          <Link className="primary" to={destination}>
            {action}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {attempt && (
            <Link className="text-button" to={path}>
              Details
            </Link>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="page lab-dashboard">
      <header className="lab-dashboard-intro">
        <div>
          <span className="lab-kicker">IEEE NUB · Git course</span>
          <h1>
            {profile ? 'Welcome back, ' + profile.full_name.split(' ')[0] + '.' : 'My learning'}
          </h1>
          <p>
            {profile
              ? 'Pick up your Git work below.'
              : 'Try the Git workspace locally or sign in to start an assessed attempt.'}
          </p>
        </div>
        <Link className="outline-button" to="/learn">
          <BookOpen size={16} aria-hidden="true" /> Practice guide
        </Link>
      </header>
      {!loading && !error && (
        <section className="lab-course-progress" aria-label="Course progress">
          <div>
            <span className="lab-kicker">Course progress</span>
            <strong>
              {submitted} / {cards.length} published assessments submitted
            </strong>
          </div>
          {cards.length > 0 && (
            <progress
              value={submitted}
              max={cards.length}
              aria-label="Published assessments submitted"
            />
          )}
        </section>
      )}
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading assessments…</p>
      ) : (
        <>
          <section className="lab-course-section" aria-labelledby="lab-assignment-heading">
            <h2 id="lab-assignment-heading">Assignments</h2>
            {available.length ? available.map(renderCard) : <p>No published assignments yet.</p>}
          </section>
          {exams.length > 0 && (
            <section className="lab-course-section" aria-labelledby="lab-exam-heading">
              <h2 id="lab-exam-heading">Exams</h2>
              {exams.map(renderCard)}
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="lab-upcoming" aria-label="Coming soon">
              <strong>Coming soon</strong>
              {upcoming.map(({ slot, label }) => (
                <span key={slot}>{label}</span>
              ))}
            </section>
          )}
        </>
      )}
      {profile ? (
        <details className="lab-grades">
          <summary>
            <GraduationCap size={20} aria-hidden="true" />
            <span>Grades and certificate progress</span>
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <CourseGrades unconfigured={upcoming.map(({ slot }) => slot)} />
        </details>
      ) : (
        <Link className="text-button" to="/auth">
          Sign in or create an account <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function AssessmentDetails({
  definition: d,
  onStart,
  authenticated,
}: {
  definition: Definition;
  onStart: (autosave?: boolean) => Promise<void>;
  authenticated: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const points = totals(d);
  return (
    <div className="page lab-start">
      <Link className="breadcrumb" to="/dashboard">
        My learning → {d.type === 'exam' ? 'Exam' : 'Assignment'}
      </Link>
      <span className="lab-kicker">
        {d.type.toUpperCase()} · {d.format.toUpperCase()}
      </span>
      <h1>{d.title}</h1>
      <p className="lead">{d.description}</p>
      <div className="lab-start-meta">
        <span>
          {sumPoints([points.practical, points.theory])} points
          {points.bonus > 0 ? ' + ' + points.bonus + ' bonus' : ''}
        </span>
        <span>
          {d.attemptLimit} allowed attempt{d.attemptLimit > 1 ? 's' : ''}
        </span>
        {d.type === 'exam' && <span>{d.durationMinutes} minutes</span>}
        {d.startsAt && <span>Opens {new Date(d.startsAt).toLocaleString()}</span>}
        {(d.deadline || d.endsAt) && (
          <span>Closes {new Date(d.deadline || d.endsAt!).toLocaleString()}</span>
        )}
      </div>
      <div className="lab-start-grid">
        <section className="lab-start-outline">
          <h2>What you’ll work on</h2>
          <p>
            {assessmentSummary(d)}.{' '}
            {points.practical > 0 && points.theory > 0
              ? points.practical + ' practical points and ' + points.theory + ' theory points.'
              : ''}
          </p>
          <p>
            Open any criterion in the workspace and check your work as you go. You can submit
            partial work.
          </p>
          <details className="published-instructions">
            <summary>Full assessment instructions</summary>
            <p className="written-answer" dir="auto">
              {d.instructions}
            </p>
            {d.sections.map((s) => (
              <section key={s.id}>
                <h3 dir="auto">{s.title}</h3>
                <p dir="auto">{s.description}</p>
                <ol>
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {s.tasks
                  .filter((t) => t.instructions !== s.steps.join('\n'))
                  .map((t) => (
                    <p key={t.id} className="written-answer" dir="auto">
                      {t.instructions}
                    </p>
                  ))}
              </section>
            ))}
          </details>
        </section>
        <aside className="form-card lab-start-action">
          <h3>{d.type === 'exam' ? 'Before starting your exam' : 'Before you begin'}</h3>
          <p>
            {d.type === 'exam'
              ? 'Your timer starts when you begin. At the deadline, your latest online save is submitted automatically.'
              : 'You get your own workspace. Your current attempt keeps its original instructions.'}
          </p>
          {authenticated && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Save my files, answers and command activity online every 15 seconds.
            </label>
          )}
          <details>
            <summary>Where your work is saved</summary>
            <p>
              Your device keeps a local copy. With your permission, online saves go to{' '}
              {import.meta.env.VITE_SUPABASE_URL || 'the configured IEEE NUB Git Lab server'}. Avoid
              editing the same attempt in multiple tabs.
            </p>
          </details>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || (authenticated && !consent)}
            onClick={async () => {
              setBusy(true);
              try {
                await onStart(consent);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Starting…' : d.type === 'exam' ? 'Start Exam' : 'Start / Continue assignment'}
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>
    </div>
  );
}
