import type { AssessmentSession } from '../../hooks/useAssessmentSession';
import type { AttemptState } from './model';
export function SessionBar({
  session,
  state,
}: {
  session: AssessmentSession;
  state: AttemptState | null;
}) {
  if (!state) return null;
  if (state.status === 'restarted')
    return (
      <section className="session-bar" aria-label="Assessment session">
        <p>
          This previous attempt is read only after restart. Its deadline and saved evidence are
          retained.
        </p>
      </section>
    );
  const seconds = Math.ceil(session.remaining / 1000);
  const timed = state.deadline_at !== null;
  const warning = timed && seconds <= 300 && !session.finalized;
  return (
    <section
      className={'session-bar ' + (timed ? 'timed ' : 'untimed ') + (warning ? 'time-warning' : '')}
      aria-label="Assessment session"
    >
      <div>
        <strong>{state.definition.type === 'exam' ? 'Exam' : 'Assignment'}</strong>
        {timed ? (
          <span role="timer" aria-label="Time remaining">
            {session.finalized
              ? 'Finalized'
              : !Number.isFinite(seconds)
                ? 'Syncing timer…'
                : timed
                  ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`
                  : ''}
          </span>
        ) : (
          <span className="untimed-label">
            {session.finalized ? 'Finalized' : 'Untimed assignment'}
          </span>
        )}
        <small role="status">{session.sync}</small>
      </div>
      {session.consent &&
        !session.finalized &&
        state.status === 'in_progress' &&
        session.remaining > 0 && (
          <button className="text-button" onClick={() => void session.save().catch(() => {})}>
            Save now
          </button>
        )}
      {session.finalized && (
        <p role="status">
          This attempt is read only.{' '}
          {state.auto_submitted || state.status === 'expired'
            ? 'Time is up; only your last accepted server save is included.'
            : 'Your submission is finalized.'}
        </p>
      )}
      {warning && (
        <p role="status">
          {seconds <= 0
            ? 'Time is up. Further edits are locked. Only work accepted by the server before the deadline is included.'
            : seconds <= 60
              ? 'Less than one minute remaining.'
              : 'Five minutes or less remaining.'}
        </p>
      )}
      {!session.consent && !session.finalized && state.status === 'in_progress' && (
        <div className="autosave-consent">
          <p>
            Server autosave uploads this attempt’s virtual repository files, answers, and supporting
            command activity every 15 seconds to{' '}
            <strong>
              {import.meta.env.VITE_SUPABASE_URL || 'the configured dedicated Supabase project'}
            </strong>
            . At expiry, the last accepted save is final. Offline changes arriving after the
            deadline are not accepted.
          </p>
          <button className="primary" onClick={session.enableAutosave}>
            Enable server autosave for this attempt
          </button>
        </div>
      )}
      {session.error && (
        <p role="alert" className="error">
          {session.error}
          {session.conflict
            ? ' Editing is paused to protect the newer save. Reload to restore the latest accepted server checkpoint.'
            : ''}
        </p>
      )}
    </section>
  );
}
