import { Link, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { requireBackend } from '../../services/supabase';
import { recoveryReason, recoveryError, type RecoveryState } from './recoveryPresentation';
export function RestartAttempt({
  practice,
  busy,
  restart,
  attemptId,
}: {
  practice: boolean;
  busy: boolean;
  restart: () => Promise<void>;
  attemptId?: string;
}) {
  const { assessmentId } = useParams();
  const [policy, setPolicy] = useState<RecoveryState | null>(
    practice ? { code: 'available', canRestart: true, canRequest: false } : null,
  );
  const [loading, setLoading] = useState(false),
    [confirming, setConfirming] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [message, setMessage] = useState('');
  const title = useRef<HTMLHeadingElement>(null),
    details = useRef<HTMLDetailsElement>(null),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPolicy(practice ? { code: 'available', canRestart: true, canRequest: false } : null);
    setConfirming(false);
    setError('');
    return () => {
      generation.current++;
    };
  }, [attemptId, practice]);
  useEffect(() => {
    if (confirming) title.current?.focus();
  }, [confirming]);
  const load = async () => {
    if (practice) return;
    const token = ++generation.current;
    setLoading(true);
    try {
      const { data, error } = await requireBackend().rpc('attempt_recovery_state', {
        p_attempt: attemptId,
      });
      if (error) throw error;
      if (!data?.code) throw Error('Policy unavailable');
      if (generation.current === token) {
        setPolicy(data);
        setError('');
        if (data.code !== 'available') setConfirming(false);
        return data as RecoveryState;
      }
    } catch {
      if (generation.current === token)
        setPolicy({ code: 'unavailable', canRestart: false, canRequest: false });
    } finally {
      if (generation.current === token) setLoading(false);
    }
  };
  return (
    <details
      id="attempt-recovery"
      ref={details}
      className="attempt-recovery"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Help with this attempt</summary>
      <p>
        A new commit cannot change how an earlier commit was made. Start over only if you need a
        fresh history.
      </p>
      {loading ? (
        <p role="status">Checking your options…</p>
      ) : (
        <>
          <p role="status">
            {practice
              ? 'Practice is saved only on this device. You can start over at any time.'
              : policy?.code === 'attempt_limit' && policy.request
                ? 'You’ve used all your available attempts. Your request status is shown below.'
                : recoveryReason(policy?.code || 'unavailable')}
          </p>
          {policy?.request && (
            <div className="request-status" role="status">
              <strong>
                {policy.canRestart && policy.request.status !== 'pending'
                  ? 'Another attempt is now available'
                  : policy.request.status === 'pending'
                    ? 'Request sent · waiting for your instructor'
                    : policy.request.status === 'approved'
                      ? 'Your instructor approved another attempt'
                      : 'Your instructor did not approve another attempt'}
              </strong>
              {policy.request.reply && <p dir="auto">{policy.request.reply}</p>}
            </div>
          )}
          {policy?.code === 'restarted' && policy.successor && assessmentId && (
            <Link
              className="primary"
              to={`/assessments/${assessmentId}/attempts/${policy.successor}/workspace`}
            >
              Open the new attempt
            </Link>
          )}
          {policy?.code === 'profile' && <Link to="/profile">Complete your profile</Link>}
          {policy?.canRequest && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                try {
                  const { error } = await requireBackend().rpc('request_attempt_help', {
                    p_attempt: attemptId,
                    p_message: message,
                  });
                  if (error) throw error;
                  await load();
                } catch {
                  setError('Your request could not be sent. Try again; it will not be sent twice.');
                } finally {
                  setPending(false);
                }
              }}
            >
              <label>
                Tell your instructor what happened (optional)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <button className="primary" disabled={pending || busy}>
                {pending ? 'Sending…' : 'Request another attempt'}
              </button>
            </form>
          )}
          {policy?.canRestart && !confirming && (
            <button
              className="outline-button"
              disabled={busy || pending}
              onClick={() => {
                setConfirming(true);
                setDone(false);
              }}
            >
              Restart Attempt
            </button>
          )}
          {!practice && (
            <button
              className="text-button"
              disabled={loading || pending}
              onClick={() => void load()}
            >
              Check again
            </button>
          )}
        </>
      )}
      {done && (
        <p role="status">Practice restarted. Start again from the published instructions.</p>
      )}
      {confirming && (
        <div
          className="recovery-confirmation"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="restart-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !pending) {
              setConfirming(false);
              details.current?.querySelector('summary')?.focus();
            }
          }}
        >
          <h3 ref={title} tabIndex={-1} id="restart-title">
            Start over?
          </h3>
          <ul>
            <li>
              Your new workspace starts from the course starter. Current files, commits, branches,
              answers and task progress do not carry over.
            </li>
            <li>
              {practice
                ? 'This resets only practice on this device. A local recovery copy is kept.'
                : 'Your previous attempt and saved work stay available read only. Unsynced work stays on this device.'}{' '}
              Previous submissions and official grades are unchanged.
            </li>
            {!practice && (
              <li>
                This uses a new attempt under your instructor’s attempt limits and the current
                published assessment. Deadlines still apply.
              </li>
            )}
          </ul>
          <div className="review-actions">
            <button
              className="outline-button"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setError('');
                details.current?.querySelector('summary')?.focus();
              }}
            >
              {error ? 'Close' : 'Keep current work'}
            </button>
            <button
              className="primary"
              disabled={pending || busy}
              onClick={async () => {
                setPending(true);
                try {
                  await restart();
                  setConfirming(false);
                  setDone(true);
                } catch (e) {
                  const message = recoveryError(e instanceof Error ? e.message : String(e));
                  const state = practice ? undefined : await load();
                  if (state?.code !== 'restarted') setError(message);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? 'Starting over…' : 'Confirm restart'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
