import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, GitBranch } from 'lucide-react';
import { supabase, type Profile } from '../../services/supabase';
import { firstAssessment, totals, type Definition, type AssessmentRecord } from './model';
import { facultyLabel } from '../auth/faculty';
import { ASSIGNMENT_ID } from '../assignments/assignment';
type Card = AssessmentRecord & { definition: Definition };
type Attempt = {
  id: string;
  assignment_id: string;
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
            id: ASSIGNMENT_ID,
            version: 1,
            type: 'assignment',
            title: firstAssessment.title,
            description: firstAssessment.description,
            visible: true,
            archived: false,
            definition: firstAssessment,
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
          .select('id,assignment_id,status,receipt')
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
          .filter((a) => !!a.definition),
      );
      setAttempts(
        (work.data || []).map((a) => ({
          ...a,
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
  return (
    <div className="page dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">IEEE NUB · GIT COURSE</span>
          <h1>
            {profile
              ? `Welcome back, ${profile.full_name.split(' ')[0]}.`
              : 'Your Git assignments, in one place.'}
          </h1>
          <p>
            {profile
              ? `${facultyLabel(profile.faculty)} · Choose an assignment or exam below.`
              : 'Explore Assignment 01 locally. Sign in to access your published assignments and exams.'}
          </p>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {loading ? (
        <p>Loading assessments…</p>
      ) : (
        (['assignment', 'exam'] as const).map((type) => (
          <section className="course-section" key={type}>
            <h2>{type === 'exam' ? 'Exams' : 'Assignments'}</h2>
            <div className="course-grid">
              {cards
                .filter((a) => a.type === type)
                .map((a) => {
                  const d = a.definition;
                  const attempt = attempts.find((t) => t.assignment_id === a.id);
                  const now = Date.now();
                  const closed = !!(
                    (d.endsAt && Date.parse(d.endsAt) <= now) ||
                    (d.deadline && Date.parse(d.deadline) <= now)
                  );
                  const future = !!d.startsAt && Date.parse(d.startsAt) > now;
                  const status =
                    attempt?.status === 'pending_review'
                      ? 'Submitted · pending review'
                      : attempt
                        ? attempt.status.replaceAll('_', ' ')
                        : closed
                          ? 'Closed'
                          : future
                            ? 'Scheduled'
                            : 'Not started';
                  const points = totals(d);
                  return (
                    <article className="form-card assessment-card" key={a.id}>
                      <div className="assignment-label">
                        {type.toUpperCase()}
                        <span>{status}</span>
                      </div>
                      <h3>{d.title}</h3>
                      <p>{d.description}</p>
                      <div className="assessment-meta">
                        <span>
                          <GitBranch size={13} />
                          {
                            {
                              practical: 'Git practice',
                              theory: 'Questions',
                              mixed: 'Git practice + questions',
                            }[d.format]
                          }
                        </span>
                        <span>
                          {points.practical + points.theory} points
                          {points.bonus ? ' + ' + points.bonus + ' bonus' : ''}
                        </span>
                        {type === 'exam' && (
                          <span>
                            <Clock size={13} />
                            {d.durationMinutes} minutes · {d.attemptLimit} attempt
                            {d.attemptLimit > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {d.startsAt && <small>Opens: {new Date(d.startsAt).toLocaleString()}</small>}
                      {(d.endsAt || d.deadline) && (
                        <small>
                          {type === 'exam' ? 'Available until' : 'Deadline'}:{' '}
                          {new Date(d.endsAt || d.deadline!).toLocaleString()}
                        </small>
                      )}
                      {!d.endsAt && !d.deadline && <small>No deadline</small>}
                      {attempt?.released && (
                        <p className="result-summary">
                          Score:{' '}
                          {(Number(attempt.practical_score) || 0) +
                            (Number(attempt.theory_score) || 0)}{' '}
                          / {points.practical + points.theory}
                          {points.bonus ? ' + bonus' : ''}
                          <br />
                          {attempt.feedback}
                        </p>
                      )}
                      <div className="assessment-card-actions">
                        <Link to={`/assessments/${a.id}`} className="text-button">
                          Details
                          <ArrowRight size={14} />
                        </Link>
                        {attempt ? (
                          <Link
                            className="primary"
                            to={`/assessments/${a.id}/attempts/${attempt.id}/${attempt.status === 'in_progress' ? (d.format === 'theory' ? 'theory' : 'workspace') : 'result'}`}
                          >
                            {attempt.status === 'in_progress'
                              ? type === 'exam'
                                ? 'Continue Exam'
                                : 'Continue assignment'
                              : type === 'exam'
                                ? 'View Result'
                                : 'View submission'}
                          </Link>
                        ) : (
                          <Link className="primary" to={`/assessments/${a.id}`}>
                            {closed || future
                              ? 'View details'
                              : type === 'exam'
                                ? 'Start Exam'
                                : 'Start assignment'}
                            <ArrowRight size={14} />
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
            {!cards.some((a) => a.type === type) && (
              <p className="empty-state">
                No published {type === 'exam' ? 'exams' : 'assignments'} available.
              </p>
            )}
          </section>
        ))
      )}
      {!profile && (
        <Link className="practice-link" to="/auth">
          Sign in or create an account →
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
  onStart: () => Promise<void>;
  authenticated: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const points = totals(d);
  return (
    <div className="page overview">
      <Link className="breadcrumb" to="/dashboard">
        My learning → {d.type === 'exam' ? 'Exam' : 'Assignment'}
      </Link>
      <span className="eyebrow">
        {d.type.toUpperCase()} · {d.format.toUpperCase()}
      </span>
      <h1>{d.title}</h1>
      <p className="lead">{d.description}</p>
      <div className="overview-meta">
        <span>
          {points.practical + points.theory} points + {points.bonus} bonus
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
      <div className="overview-grid">
        <section>
          <h2>Instructions</h2>
          <p className="written-answer">{d.instructions}</p>
          {d.sections.map((s) => (
            <article className="overview-section" key={s.id}>
              <div>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <ol>
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {s.tasks.map((t) => (
                  <div key={t.id}>
                    <h4>
                      {t.title} · {t.points} points {t.bonus ? '(optional bonus)' : ''}
                    </h4>
                    {t.instructions !== s.steps.join('\n') && (
                      <p className="written-answer">{t.instructions}</p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
          <h3>Theory</h3>
          <p>
            {d.questions.length} question{d.questions.length === 1 ? '' : 's'} · {points.theory}{' '}
            points. Written answers are reviewed manually.
          </p>
        </section>
        <aside className="form-card sticky-card">
          <h3>{d.type === 'exam' ? 'Before starting your exam' : 'Before you begin'}</h3>
          <p>
            {d.type === 'exam'
              ? 'The server starts your timer immediately. Refreshing, switching tabs, or changing the device clock does not extend it. At expiry, the server finalizes the last accepted autosave.'
              : 'Each attempt has an isolated workspace. Published changes never alter an already-started assessment.'}
          </p>
          {authenticated && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I authorize automatic saves of this attempt’s virtual repository files, answers and
              supporting command activity to{' '}
              {import.meta.env.VITE_SUPABASE_URL || 'the configured dedicated Supabase project'}{' '}
              every 15 seconds. Offline changes arriving after the deadline are excluded.
            </label>
          )}
          <p>
            Work also saves on this device. Avoid using multiple tabs; a stale save will be
            rejected. Server autosave consent can be enabled again inside a resumed attempt.
          </p>
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
                await onStart();
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
