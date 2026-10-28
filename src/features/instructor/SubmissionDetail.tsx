import { RecordActions } from './RecordManagement';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { requireBackend } from '../../services/supabase';
import { firstAssessment, totals, type Definition } from '../assessments/model';
import { GitEngine, type RepoView, type Activity } from '../git-engine/engine';
import { VirtualFS, type Snapshot } from '../filesystem/VirtualFS';
import { GitGraph } from '../../components/GitGraph';
import { facultyLabel } from '../auth/faculty';
import { requirementProgress } from '../assessments/requirements';
import { adminError as message, type Attempt } from './adminData';
export function AttemptDetail({ attempt, back }: { attempt: Attempt; back: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState(attempt.status);
  const [keys, setKeys] = useState<
    Record<string, { correctAnswers?: string[]; explanation?: string }>
  >({});
  const [working, setWorking] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState('');
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
    let live = true;
    setLoading(true);
    setLoadError(false);
    setError('');
    void (async () => {
      try {
        const client = requireBackend();
        const [snapshot, answerData, eventData, gradeData, stateData, contextData, taskData] =
          await Promise.all([
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
            client.rpc('instructor_review_context', { p_attempt: attempt.id }),
            client
              .from('task_results')
              .select('task_key,passed,points')
              .eq('attempt_id', attempt.id),
          ]);
        for (const r of [
          snapshot,
          answerData,
          eventData,
          gradeData,
          stateData,
          taskData,
          contextData,
        ])
          if (r.error) throw r.error;
        if (!live) return;
        setKeys(contextData.data?.keys || {});
        setAccepted(contextData.data?.checkpoint_accepted_at || '');
        const pinned = stateData.data.definition as Definition;
        setStatus(stateData.data.status);
        setDefinition(pinned);
        setTaskResults(
          taskData.data?.length
            ? taskData.data
            : (contextData.data?.checkpoint_outcomes || []).map(
                (r: { id: string; passed: boolean; points: number }) => ({
                  task_key: r.id,
                  passed: r.passed,
                  points: r.passed ? r.points : 0,
                }),
              ),
        );
        const evidence = snapshot.data?.snapshot || stateData.data.payload?.snapshot;
        if (evidence) {
          const engine = new GitEngine(
            VirtualFS.restore(evidence as Snapshot),
            '/' + pinned.projectName,
          );
          engine.globalConfig = stateData.data.payload?.config || {};
          const inspected = await engine.inspect();
          if (!live) return;
          setView(inspected);
          setWorking(
            Object.fromEntries(
              Object.entries(engine.fs.entries)
                .filter(
                  ([p, e]) =>
                    p.startsWith(engine.dir + '/') && !p.includes('/.git/') && e.kind === 'file',
                )
                .map(([p, e]) => [
                  p.slice(engine.dir.length + 1),
                  new TextDecoder().decode(new Uint8Array(e.data)),
                ]),
            ),
          );
        }
        setAnswers(
          answerData.data?.length
            ? answerData.data
            : Object.entries(stateData.data.payload?.answers || {}).map(
                ([question_id, answer]) => ({ question_id, answer: String(answer) }),
              ),
        );
        setEvents(
          eventData.data?.length
            ? eventData.data.map((e) => e.event)
            : stateData.data.payload?.events || [],
        );
        setScores({
          ...Object.fromEntries(
            (gradeData.data || []).map((r) => [r.question_id, String(r.points)]),
          ),
          ...Object.fromEntries(
            (contextData.data?.draft?.grades || []).map(
              (r: { question_id: string; points: number }) => [r.question_id, String(r.points)],
            ),
          ),
        });
        if (contextData.data?.draft) setFeedback(contextData.data.draft.feedback);
      } catch (e) {
        if (live) {
          setError(message(e));
          setLoadError(true);
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt.id, refresh]);
  const grade = async (release: boolean, draft = false) => {
    if (
      !draft &&
      !window.confirm(
        release
          ? 'Finalize and release these marks to the student?'
          : 'Finalize these marks privately?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const manual = questions.filter(
        (q) => (q.manual || !['single', 'multiple', 'boolean'].includes(q.kind)) && q.points > 0,
      );
      if (!draft && manual.some((q) => scores[q.id] === undefined || scores[q.id] === ''))
        throw Error('Enter a mark for every manual question before finalizing.');
      const { error } = await requireBackend().rpc(
        draft ? 'instructor_save_grade_draft' : 'grade_assessment',
        {
          p_attempt: attempt.id,
          p_grades: questions
            .filter(
              (q) =>
                (q.manual || !['single', 'multiple', 'boolean'].includes(q.kind)) && q.points > 0,
            )
            .filter((q) => !draft || (scores[q.id] !== undefined && scores[q.id] !== ''))
            .map((q) => ({ question_id: q.id, points: Number(scores[q.id]) })),
          p_feedback: feedback,
          ...(!draft ? { p_release: release } : {}),
        },
      );
      if (error) throw error;
      setNotice(
        draft
          ? 'Grading progress saved privately. Official marks are unchanged.'
          : release
            ? 'Grade published to the student.'
            : 'Grade finalized privately.',
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <p role="status">Loading submission evidence…</p>;
  if (loadError)
    return (
      <section>
        <button className="text-button" onClick={back}>
          ← Back to attempts
        </button>
        <h2>Submission evidence unavailable</h2>
        <p role="alert" className="error">
          {error}
        </p>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          Retry evidence load
        </button>
      </section>
    );
  const checks = view
    ? requirementProgress(
        definition,
        view,
        {
          full_name: attempt.profiles?.full_name || '',
          department: attempt.profiles?.department || facultyLabel(attempt.profiles?.faculty),
        },
        working,
      )
    : [];
  return (
    <>
      <button className="text-button" onClick={back}>
        <ArrowLeft size={16} />
        Back to attempts
      </button>
      <h2>{attempt.profiles?.full_name}</h2>
      <RecordActions
        kind="attempt"
        id={attempt.id}
        changed={() => {
          setNotice('Record management completed.');
          setRefresh((n) => n + 1);
        }}
      />
      <h3>
        {definition.title} · {definition.type} · Attempt {attempt.attempt_number} · Version{' '}
        {attempt.assignment_version}
      </h3>
      <button className="text-button" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
        Refresh evidence
      </button>
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
        {attempt.profiles?.student_id} · {status} · {attempt.receipt || 'Not submitted'}
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
          <p>
            {status === 'in_progress'
              ? 'Latest accepted server checkpoint; this attempt is still in progress.'
              : 'Finalized server-verified snapshot.'}
            {accepted ? ' Accepted ' + new Date(accepted).toLocaleString() : ''}
          </p>
          {view ? <GitGraph view={view} /> : <p>No finalized repository snapshot.</p>}
          {view && (
            <>
              <p>
                Repository: {view.initialized ? 'Initialized' : 'Not initialized'} · Current branch:{' '}
                {view.branch}
              </p>
              <h4>Branches</h4>
              {Object.entries(view.branches).map(([name, oid]) => (
                <p key={name}>
                  <strong>{name}</strong> <code>{oid}</code>
                </p>
              ))}
              <h4>Virtual files</h4>
              {Object.entries(working).map(([file, text]) => (
                <details key={file}>
                  <summary>{file}</summary>
                  <pre className="evidence-file">{text}</pre>
                </details>
              ))}
              {!Object.keys(working).length && <p>No working text files in this evidence.</p>}
              <h4>Merge results</h4>
              {view.commits.some((c) => c.parents.length > 1) ? (
                view.commits
                  .filter((c) => c.parents.length > 1)
                  .map((c) => (
                    <p key={c.oid}>
                      {c.message} · {c.parents.length} parent histories
                    </p>
                  ))
              ) : (
                <p>No merge commit; a fast-forward merge may be represented by ancestry.</p>
              )}
            </>
          )}
          <h3>Practical results</h3>
          <p>
            Stored task results below are verified by the server. Expanded checks explain the saved
            evidence; they do not replace official marks.
          </p>
          {taskResults.map((t) => (
            <p className={t.passed ? 'passed' : 'muted'} key={t.task_key}>
              {definition.sections.flatMap((s) => s.tasks).find((x) => x.id === t.task_key)
                ?.title || t.task_key}{' '}
              · {t.passed ? 'Completed' : 'Incomplete'} · {t.points} points
            </p>
          ))}
          {!taskResults.length && <p>No finalized practical results recorded.</p>}
          {checks.map((t) => (
            <details key={t.task.id}>
              <summary>{t.task.title} — requirement checks</summary>
              <ul>
                {t.requirements.map((c) => (
                  <li key={c.id}>
                    {c.status === 'completed'
                      ? 'Completed'
                      : c.status === 'unverifiable'
                        ? 'Unable to verify'
                        : 'Incomplete'}
                    : {c.label}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <h3>Activity timeline</h3>
          {!events.length && (
            <p>No command logs were recorded. Missing activity cannot be reconstructed.</p>
          )}
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
                <p className="muted">
                  {q.kind} · {q.points} points
                </p>
                {q.options.length > 0 && (
                  <ul>
                    {q.options.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                )}
                <p className="written-answer">{a.answer}</p>
                <details>
                  <summary>Instructor answer key and rubric</summary>
                  <p>
                    {keys[q.id]?.correctAnswers?.length
                      ? 'Correct answer: ' + keys[q.id].correctAnswers!.join(', ')
                      : 'Manual grading question; no objective answer key.'}
                  </p>
                  <p>{keys[q.id]?.explanation || 'No rubric or explanation was supplied.'}</p>
                </details>
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
              disabled={
                busy || loadError || ['in_progress', 'restarted', 'invalidated'].includes(status)
              }
              onClick={() => void grade(false, true)}
            >
              Save draft grade
            </button>
            <button
              className="outline-button"
              disabled={
                busy || loadError || ['in_progress', 'restarted', 'invalidated'].includes(status)
              }
              onClick={() => void grade(false)}
            >
              Finalize grade privately
            </button>
            <button
              className="primary"
              disabled={
                busy || loadError || ['in_progress', 'restarted', 'invalidated'].includes(status)
              }
              onClick={() => void grade(true)}
            >
              Publish grade
            </button>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Approve an additional retake for this student?')) return;
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
