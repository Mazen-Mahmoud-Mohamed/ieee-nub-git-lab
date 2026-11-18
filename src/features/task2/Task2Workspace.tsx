import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AttemptState, Definition } from '../assessments/model';
import { answerPresent } from '../assessments/model';
import { TASK2_STARTER, emptyTask2Outcomes, task2Rubric, type Task2Outcome } from './policy';
import { browserVerifier, task2Request } from './service';
import { requireBackend } from '../../services/supabase';

export function Task2RubricPreview({ definition }: { definition: Definition }) {
  return (
    <section className="page task2">
      <h2>Real GitHub practical · 100 points</h2>
      <p>{definition.instructions}</p>
      {task2Rubric.map((c) => (
        <article className="form-card" key={c.id}>
          <h3>
            {c.title} · {c.points} points
          </h3>
          <p>{c.description}</p>
          <p>Verification: {c.method}</p>
        </article>
      ))}
    </section>
  );
}
export function Task2Workspace({
  state,
  basePath,
  userId,
}: {
  state: AttemptState;
  basePath: string;
  userId: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<any>();
  const [answers, setAnswers] = useState<Record<string, string>>(state.payload?.answers || {});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState(state.receipt);
  const [confirmed, setConfirmed] = useState(false);
  const [released, setReleased] = useState<{
    practical_score: number;
    theory_score: number;
    feedback: string;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const revision = useRef(state.checkpoint_revision);
  const callbackStarted = useRef(false);
  const storageKey = `task2-answers:${userId}:${state.id}`;
  const readOnly = state.status !== 'in_progress' || !!receipt;
  const page = location.pathname.endsWith('/theory')
    ? 'theory'
    : location.pathname.endsWith('/review')
      ? 'review'
      : 'practical';
  const load = async () => {
    const result = await task2Request({ action: 'status', attemptId: state.id });
    if (result.revision !== revision.current && !result.receipt)
      throw Error(
        'Checkpoint conflict: another tab saved newer work. Reload this page before continuing.',
      );
    setStatus(result);
    if (result.receipt) {
      setReceipt(result.receipt);
      if (state.status === 'in_progress') {
        setAnswers({});
        const frozen = await requireBackend().rpc('assessment_state', { p_attempt: state.id });
        if (!frozen.error) setAnswers(frozen.data.payload?.answers || {});
      }
    }
    return result;
  };
  useEffect(() => {
    let live = true;
    void load()
      .then((result) => {
        if (!live) return;
        try {
          const local = JSON.parse(localStorage.getItem(storageKey) || 'null');
          if (local?.revision === result.revision && !readOnly && !result.receipt)
            setAnswers(local.answers);
        } catch {}
        setReady(true);
      })
      .catch((e) => {
        if (live) setError(String(e.message || e));
      });
    return () => {
      live = false;
    };
  }, [state.id]);
  useEffect(() => {
    if (ready && !readOnly)
      localStorage.setItem(storageKey, JSON.stringify({ revision: revision.current, answers }));
  }, [answers, ready, readOnly, storageKey]);
  useEffect(() => {
    if (!readOnly) return;
    void requireBackend()
      .from('released_results')
      .select('practical_score,theory_score,feedback')
      .eq('attempt_id', state.id)
      .maybeSingle()
      .then(({ data }) => setReleased(data));
  }, [readOnly, state.id]);
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthState = params.get('github_state');
    if (!ready || !oauthState || callbackStarted.current) return;
    callbackStarted.current = true;
    const pendingKey = 'task2-oauth:' + oauthState;
    const proof = sessionStorage.getItem(pendingKey);
    // Remove the code from browser history before doing network work.
    navigate(location.pathname, { replace: true });
    void run('Completing GitHub connection', async () => {
      if (!proof)
        throw Error('Authorization must finish in the browser that started it. Connect again.');
      const pending = JSON.parse(proof);
      if (pending.attemptId !== state.id)
        throw Error('Authorization belongs to a different attempt.');
      try {
        await task2Request({
          action: params.has('github_code') ? 'finish-oauth' : 'finish-install',
          attemptId: state.id,
          state: oauthState,
          verifier: pending.verifier,
          ...(params.has('github_code')
            ? { code: params.get('github_code') }
            : { installationId: params.get('github_installation') }),
        });
      } finally {
        sessionStorage.removeItem(pendingKey);
      }
      await load();
      setNotice('GitHub connected! Choose Find My Fork & Check to verify your work.');
    });
  }, [ready, location.search]);
  const connect = () =>
    run('Opening GitHub', async () => {
      const verifier = browserVerifier();
      const result = await task2Request({ action: 'oauth', attemptId: state.id, verifier });
      sessionStorage.setItem(
        'task2-oauth:' + result.state,
        JSON.stringify({ attemptId: state.id, verifier }),
      );
      const target = new URL(result.url);
      if (target.origin !== 'https://github.com')
        throw Error('Unexpected authorization destination');
      window.location.assign(target.toString());
    });
  const send = (action: 'check' | 'save' | 'submit') =>
    run(
      action === 'check'
        ? 'Checking GitHub'
        : action === 'submit'
          ? 'Submitting'
          : 'Saving answers',
      async () => {
        const finalKey = 'task2-submit:' + state.id;
        const pending = action === 'submit' ? sessionStorage.getItem(finalKey) : null;
        const payload = pending
          ? JSON.parse(pending)
          : {
              action,
              attemptId: state.id,
              answers,
              revision: revision.current,
              idempotencyKey: crypto.randomUUID(),
            };
        if (action === 'submit') sessionStorage.setItem(finalKey, JSON.stringify(payload));
        let result;
        try {
          result = await task2Request(payload);
        } catch (e) {
          if (action === 'submit' && [400, 409].includes((e as { status: number }).status))
            sessionStorage.removeItem(finalKey);
          throw e;
        }
        revision.current = result.revision;
        localStorage.setItem(storageKey, JSON.stringify({ revision: result.revision, answers }));
        if (result.receipt) {
          setReceipt(result.receipt);
          setAnswers({});
          // Expiry may have frozen an older checkpoint. Show only accepted answers after finalization.
          const frozen = await requireBackend().rpc('assessment_state', { p_attempt: state.id });
          setAnswers(frozen.error ? {} : frozen.data.payload?.answers || {});
          sessionStorage.removeItem(finalKey);
          navigate(basePath + '/result');
        }
        await load();
        setNotice(
          action === 'check'
            ? 'GitHub verification saved. Each requirement is scored independently.'
            : action === 'submit'
              ? 'Submission accepted.'
              : 'Theory answers saved online.',
        );
      },
    );
  const outcomes: Task2Outcome[] = status?.check?.outcomes || emptyTask2Outcomes();
  const earned = outcomes.reduce((n, o) => n + o.earned, 0);
  const answered = state.definition.questions.filter((q) => answerPresent(q, answers[q.id])).length;
  const unavailable = !!busy || !ready || readOnly;
  const statusLabels = {
    not_started: 'Not started',
    pending: 'Pending verification',
    passed: 'Passed',
    failed: 'Failed',
    unverifiable: 'Unverifiable automatically',
  };
  const stages = [
    {
      title: 'Merge the starter branches',
      hint: 'Create your fork, merge the LCD branch and resolve the sensor changes.',
      ids: ['t2-fork', 't2-merge', 't2-threshold', 't2-lcd'],
    },
    {
      title: 'Keep personal files out of Git',
      hint: 'Set up .gitignore and stop tracking local settings.',
      ids: ['t2-ignore-env', 't2-ignore-logs', 't2-ignore-settings', 't2-untrack'],
    },
    {
      title: 'Collaborate through GitHub',
      hint: 'Create the buzzer issue, branch, pull request and peer review.',
      ids: ['t2-buzzer', 't2-issue', 't2-pr', 't2-pr-merged', 't2-review'],
    },
    {
      title: 'Document your project',
      hint: 'Explain the wiring, running instructions and how to contribute.',
      ids: ['t2-readme'],
    },
  ];
  return (
    <div className="page task2">
      <header className="lab-page-heading">
        <div>
          <span className="lab-kicker">SESSION 2 · SLIDES 28–61</span>
          <h1>GitHub collaboration</h1>
          <p>Task 2 · 100 practical + 50 theory points</p>
        </div>
        <Link to="/dashboard">My learning</Link>
      </header>
      <nav className="task2-tabs" aria-label="Task 2 steps">
        {[
          ['workspace', 'Practical'],
          ['theory', 'Theory'],
          ['review', 'Review & Submit'],
        ].map(([path, label]) => (
          <Link
            key={path}
            aria-current={
              (page === 'practical' ? path === 'workspace' : path === page) ? 'page' : undefined
            }
            to={basePath + '/' + path}
          >
            {label}
          </Link>
        ))}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          {!ready && (
            <button
              onClick={() =>
                void run('Loading', async () => {
                  await load();
                  setReady(true);
                })
              }
            >
              Retry loading
            </button>
          )}
        </p>
      )}
      {(busy || notice) && (
        <p className="notice" role="status">
          {busy ? busy + '…' : notice}
        </p>
      )}
      {receipt && (
        <section className="form-card">
          <h2>Submission accepted</h2>
          <p>
            Receipt: <code>{receipt}</code>
          </p>
          {released ? (
            <>
              <p>
                Released grade: {Number(released.practical_score) + Number(released.theory_score)} /
                150
              </p>
              <p>{released.feedback}</p>
            </>
          ) : (
            <p>Your grade is awaiting instructor release.</p>
          )}
        </section>
      )}
      {readOnly && !receipt && (
        <p className="notice">This attempt is {state.status} and read only.</p>
      )}
      {page === 'practical' && (
        <>
          <section className="form-card">
            <h2>1. Connect your repository</h2>
            <ol className="task2-setup-steps">
              <li>
                <strong>Create your fork</strong>
                <p>
                  Fork the starter into your own GitHub account. Uncheck{' '}
                  <b>Copy the default branch only</b> so both starter branches are included.
                </p>
                <a
                  className="outline-button"
                  href={'https://github.com/' + TASK2_STARTER.fullName + '/fork'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open starter on GitHub ↗
                </a>
              </li>
              <li>
                <strong>Connect GitHub once</strong>
                <p>
                  {status?.connection?.authorized && !status.connection.revoked
                    ? `Connected as ${status.connection.login}. Your public fork can be checked automatically.`
                    : status?.connection
                      ? `Signed in as ${status.connection.login}. Reconnect once to enable automatic checking.`
                      : 'Sign in with the GitHub account that owns your fork.'}
                </p>
                {status && !status.configured && (
                  <p>
                    GitHub sign-in is being configured. Theory and partial submission still work.
                  </p>
                )}
                {(!status?.connection?.authorized || status?.connection?.revoked) && (
                  <button
                    className="primary"
                    disabled={unavailable || !status?.configured}
                    onClick={() => void connect()}
                  >
                    {status?.connection ? 'Reconnect GitHub' : 'Connect GitHub'}
                  </button>
                )}
                {status?.connection?.authorized && !status.connection.revoked && (
                  <button
                    className="outline-button task2-reconnect"
                    disabled={unavailable}
                    onClick={() => void connect()}
                  >
                    Reconnect GitHub if needed
                  </button>
                )}
              </li>
              <li>
                <strong>Check your work</strong>
                <p>
                  Return here after pushing changes. Your fork is found by GitHub username; no App
                  installation or repository address is needed.
                </p>
              </li>
            </ol>
            {status?.repository && (
              <p>
                Found fork:{' '}
                <a
                  href={'https://github.com/' + status.repository.full_name}
                  target="_blank"
                  rel="noreferrer"
                >
                  {status.repository.full_name}
                </a>{' '}
                · ID {status.repository.repository_id} · {status.repository.status}
                {status.repository.stale ? ' · Changes detected since last verification' : ''}
              </p>
            )}
          </section>
          <section>
            <div className="task2-score">
              <div>
                <h2>2. Practical requirements</h2>
                <p>{earned} / 100 independently verified points</p>
              </div>
              <button
                className="primary"
                disabled={
                  unavailable ||
                  !status?.configured ||
                  !status?.connection?.authorized ||
                  status?.connection?.revoked
                }
                onClick={() => void send('check')}
              >
                {status?.repository ? 'Check My Work' : 'Find My Fork & Check'}
              </button>
            </div>
            <p>
              Push your changes first. Check again after corrections. Submitting freezes the latest
              accepted check. GitHub failures never count as passes.
            </p>
            {status?.check && (
              <p>
                Last check: {new Date(status.check.created_at).toLocaleString()} · main{' '}
                <code>{status.check.evidence.mainSha || 'unavailable'}</code> · policy{' '}
                {status.check.policy_version}
              </p>
            )}
            <div className="task2-requirements">
              {stages.map((stage, index) => {
                const criteria = task2Rubric.filter((c) => stage.ids.includes(c.id));
                const points = criteria.reduce((sum, c) => sum + c.points, 0);
                const score = outcomes
                  .filter((o) => stage.ids.includes(o.id))
                  .reduce((sum, o) => sum + o.earned, 0);
                return (
                  <details className="task2-stage" key={stage.title} open={index === 0}>
                    <summary>
                      <span>
                        <strong>
                          Stage {index + 1}: {stage.title}
                        </strong>
                        <small>{stage.hint}</small>
                      </span>
                      <b>
                        {score} / {points}
                      </b>
                    </summary>
                    <div className="task2-stage-grid">
                      {criteria.map((c) => {
                        const result = outcomes.find((o) => o.id === c.id)!;
                        return (
                          <article className="form-card" key={c.id}>
                            <div className="task2-card-title">
                              <h3>{c.title}</h3>
                              <strong>
                                {result.earned} / {c.points}
                              </strong>
                            </div>
                            <span className={'task2-status ' + result.status}>
                              {busy === 'Checking GitHub'
                                ? 'Pending verification'
                                : statusLabels[result.status]}
                            </span>
                            <p>{c.description}</p>
                            <p>{result.requirements[0].reason}</p>
                            {result.status !== 'passed' && (
                              <p>
                                <strong>Correction:</strong> {c.recovery}
                              </p>
                            )}
                            <details>
                              <summary>Verification and evidence</summary>
                              <p>{c.method}</p>
                              <pre>{result.requirements[0].evidence}</pre>
                            </details>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
          <aside className="notice">
            <strong>Local-only skills</strong>
            <p>
              Stash, clone, pull and keeping an untracked local copy are unverifiable automatically
              from GitHub. They receive theory coverage. A correct merge and its ancestry do not
              prove a local conflict prompt appeared.
            </p>
          </aside>
        </>
      )}
      {page === 'theory' && readOnly && !state.definition.reviewAnswers && (
        <p>Answer review is unavailable for this assessment.</p>
      )}
      {page === 'theory' && (!readOnly || state.definition.reviewAnswers) && (
        <section>
          <div className="task2-score">
            <h2>Theory · {answered} / 15 answered</h2>
            <button
              className="outline-button"
              disabled={unavailable}
              onClick={() => void send('save')}
            >
              Save answers online
            </button>
          </div>
          <p>
            Review and change any answer before submission. Unanswered questions receive zero.
            Multiple select requires the exact set of choices.
          </p>
          {state.definition.questions.map((q, i) => (
            <fieldset className="form-card task2-question" key={q.id}>
              <legend>
                {i + 1}. {q.prompt} · {q.points} points
              </legend>
              {q.kind === 'fill-blank' ? (
                <label>
                  Your answer
                  <input
                    autoCapitalize="none"
                    spellCheck={false}
                    value={answers[q.id] || ''}
                    disabled={readOnly || !!busy || !ready}
                    maxLength={500}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </label>
              ) : (
                q.options.map((option) => (
                  <label className="option" key={option}>
                    <input
                      type={q.kind === 'multiple' ? 'checkbox' : 'radio'}
                      name={q.id}
                      disabled={readOnly || !!busy || !ready}
                      checked={(answers[q.id] || '').split('\n').includes(option)}
                      onChange={(e) =>
                        setAnswers((old) => {
                          const values = (old[q.id] || '').split('\n').filter(Boolean);
                          return {
                            ...old,
                            [q.id]:
                              q.kind === 'multiple'
                                ? (e.target.checked
                                    ? [...new Set([...values, option])]
                                    : values.filter((v) => v !== option)
                                  ).join('\n')
                                : option,
                          };
                        })
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))
              )}
            </fieldset>
          ))}
          <Link className="primary" to={basePath + '/review'}>
            Review & Submit
          </Link>
        </section>
      )}
      {page === 'review' && (
        <section className="form-card">
          <h2>Review your submission</h2>
          <p>
            Practical: {earned} / 100 from{' '}
            {status?.check
              ? new Date(status.check.created_at).toLocaleString()
              : 'no accepted GitHub check yet'}
            .
          </p>
          <p>
            Theory: {answered} answered, {15 - answered} unanswered. Your theory score is calculated
            securely on submission.
          </p>
          <p>
            {status?.check
              ? `Captured main commit: ${status.check.evidence.mainSha || 'unavailable'}`
              : 'You can submit without a connected repository. Practical points will be zero.'}
          </p>
          <p>
            Review each requirement and theory response before submitting. Finalized attempts are
            read only.
          </p>
          <div className="task2-actions">
            <Link to={basePath + '/workspace'}>Review practical</Link>
            <Link to={basePath + '/theory'}>Review theory</Link>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={unavailable}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I am ready to submit the latest accepted GitHub check and these theory answers,
            including any incomplete work.
          </label>
          <button
            className="primary"
            disabled={unavailable || !confirmed}
            onClick={() => void send('submit')}
          >
            Submit Task 2
          </button>
        </section>
      )}
    </div>
  );
}
