import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, ShieldCheck, Download, AlertCircle } from 'lucide-react';
import {
  questions,
  validateRepository,
  practicalScore,
  reflectionQuestions,
  type StudentIdentity,
} from '../assignments/assignment';
import type { Lab } from '../../hooks/useLab';
import { requireBackend, withRetry } from '../../services/supabase';
import { saveOutbox, clearOutbox, loadOutbox } from '../../services/persistence';
import { Checkpoints } from './Checkpoints';
export function downloadJSON(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Review({
  lab,
  identity,
  authenticated,
}: {
  lab: Lab;
  identity: StudentIdentity;
  authenticated: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const outcomes = validateRepository(lab.view, identity);
  const complete = outcomes.filter((o) => !o.bonus).every((o) => o.passed);
  const answered =
    questions.every((q) => lab.answers[q.id]?.trim()) &&
    reflectionQuestions.slice(0, 2).every((q) => lab.answers[q.id]?.trim());
  return (
    <div className="page narrow">
      <span className="eyebrow">ASSIGNMENT 01 / FINAL REVIEW</span>
      <h1>Ready for your next chapter?</h1>
      <p>
        Review your work before submitting. Your repository is independently verified on the server;
        written answers are reviewed by your instructor.
      </p>
      <div className="form-card">
        <h3>Submission checklist</h3>
        {outcomes.map((o) => (
          <div key={o.id} className={'review-check ' + (o.passed ? 'passed' : '')}>
            <CheckCircle2 size={18} />
            <span>
              {o.label}
              {o.bonus ? ' (optional)' : ''}
            </span>
            <strong>
              {o.passed ? o.points : 0}/{o.points}
            </strong>
          </div>
        ))}
        <hr />
        <div className="review-check">
          <ShieldCheck size={20} />
          <span>Local practical estimate</span>
          <strong>{practicalScore(outcomes)} / 75 + 10</strong>
        </div>
        <p className="muted">
          This is a preview, not a verified grade. Theory:{' '}
          {questions.filter((q) => lab.answers[q.id]?.trim()).length}/12 answered · practical
          reflections:{' '}
          {reflectionQuestions.slice(0, 2).filter((q) => lab.answers[q.id]?.trim()).length}/2.
        </p>
        <details>
          <summary>Review your written responses</summary>
          {[...questions, ...reflectionQuestions].map((q) => (
            <article key={q.id}>
              <h4>{q.prompt}</h4>
              <p className="written-answer">{lab.answers[q.id] || 'Not answered'}</p>
            </article>
          ))}
        </details>
        <hr />
        <label className="checkbox-label">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I
          confirm this is my own work. I understand that a finalized attempt is read only.
        </label>
        {!authenticated && (
          <div className="notice">
            <AlertCircle size={18} />
            This is a local practice workspace. Sign in and complete your profile to start an
            assessed attempt. Practice is kept separately.
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error} Your submission payload is retained locally. Retry with the same reference after
            reconnecting.
          </p>
        )}
        <Checkpoints lab={lab} authenticated={authenticated} />
        <div className="review-actions">
          <button
            className="outline-button"
            onClick={() => downloadJSON('ieee-git-lab-backup.json', lab.snapshot())}
          >
            <Download size={16} />
            Export backup
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !agreed ||
              !complete ||
              !answered ||
              !authenticated ||
              !lab.attemptId ||
              !!lab.receipt
            }
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const client = requireBackend();
                const pending = await loadOutbox(lab.attemptId!);
                const payload = pending || {
                  version: 1,
                  attemptId: lab.attemptId,
                  idempotencyKey: crypto.randomUUID(),
                  snapshot: lab.engine.fs.snapshot(),
                  answers: lab.answers,
                  events: lab.engine.events,
                };
                await saveOutbox(lab.attemptId!, payload);
                await lab.persist();
                const response = await withRetry(async () => {
                  const { data, error } = await client.functions.invoke('submit-attempt', {
                    body: payload,
                  });
                  if (error) throw error;
                  return data;
                });
                if (!response?.receipt)
                  throw new Error('The server did not return a submission receipt.');
                lab.setReceipt(response.receipt);
                await clearOutbox(lab.attemptId!);
                navigate('/confirmation');
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Verifying repository…' : 'Submit assignment'}
            <ArrowRight size={16} />
          </button>
        </div>
        {(!complete || !answered) && (
          <p className="muted">
            Complete the required practical outcomes, theory answers, and two practical reflections
            to submit.
          </p>
        )}
      </div>
    </div>
  );
}
export function Confirmation({ lab }: { lab: Lab }) {
  return (
    <div className="page narrow confirmation">
      <div className="confirmation-icon">
        <CheckCircle2 size={48} />
      </div>
      <span className="eyebrow">
        {lab.receipt ? 'SUBMISSION RECEIVED' : 'NO CONFIRMED SUBMISSION'}
      </span>
      <h1>
        {lab.receipt ? 'One assignment. A big step forward.' : 'Your work is still in progress.'}
      </h1>
      <p>
        {lab.receipt
          ? 'Your repository has been verified and your written responses are awaiting instructor review.'
          : 'A confirmation appears only after the trusted server returns a receipt.'}
      </p>
      {lab.receipt && (
        <div className="receipt">
          SUBMISSION REFERENCE<code>{lab.receipt}</code>
        </div>
      )}
      <Link className="primary" to="/dashboard">
        Back to dashboard
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
