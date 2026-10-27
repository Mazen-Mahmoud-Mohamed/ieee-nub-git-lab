import { useEffect, useRef, useState } from 'react';
export function RestartAttempt({
  practice,
  busy,
  restart,
}: {
  practice: boolean;
  busy: boolean;
  restart: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirming) title.current?.focus();
  }, [confirming]);
  return (
    <section className="attempt-recovery" aria-label="Attempt recovery">
      <button
        ref={trigger}
        className="outline-button"
        disabled={busy || pending}
        onClick={() => {
          setConfirming(true);
          setDone(false);
        }}
      >
        Restart Attempt
      </button>
      {done && (
        <p role="status">Practice restarted. Start again from the published instructions.</p>
      )}
      {confirming && (
        <div
          className="form-card"
          role="alertdialog"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !pending) {
              setConfirming(false);
              trigger.current?.focus();
            }
          }}
          aria-modal="false"
          aria-labelledby="restart-title"
          aria-describedby="restart-description"
        >
          <h3 ref={title} tabIndex={-1} id="restart-title">
            {practice ? 'Restart this local practice?' : 'Start a fresh assessed attempt?'}
          </h3>
          <div id="restart-description">
            <p>
              The fresh workspace starts from the course starter. Your files, Git commits, branches,
              staging, Git identity, terminal activity, written answers, question flags and
              provisional task progress do not carry over.
            </p>
            {practice ? (
              <p>
                This resets only practice on this device. A local recovery copy is kept. Assessed
                attempts, submissions and official grades are unchanged.
              </p>
            ) : (
              <>
                <p>
                  Your previous attempt and its last server-accepted work remain available read
                  only. Unsynced work stays saved on this device under the old attempt. Previous
                  submissions, grades and your student profile are preserved.
                </p>
                <p>
                  This consumes a new attempt under the current published assessment and your
                  instructor’s attempt limits or approved retake. Deadlines still apply. If policy
                  denies it, your current attempt is not reset. Active exams cannot be restarted.
                </p>
                <p>
                  If the connection fails, retry this same restart to recover its result before
                  continuing work.
                </p>
              </>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="review-actions">
            <button
              className="outline-button"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setError('');
                trigger.current?.focus();
              }}
            >
              {error ? 'Close' : 'Keep current work'}
            </button>
            <button
              className="primary"
              disabled={pending || busy}
              onClick={async () => {
                setPending(true);
                setError('');
                try {
                  await restart();
                  setConfirming(false);
                  setDone(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? 'Checking restart…' : 'Confirm restart'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
