import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, ShieldCheck, Download, AlertCircle } from 'lucide-react';
import { type StudentIdentity } from '../assignments/assignment';
import {
  firstAssessment,
  outcomesFor,
  totals,
  answerPresent,
  type Definition,
} from '../assessments/model';
import { StudentSteps } from '../assessments/StudentSteps';
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
  definition = firstAssessment,
  basePath = '',
  submit,
}: {
  lab: Lab;
  identity: StudentIdentity;
  authenticated: boolean;
  definition?: Definition;
  basePath?: string;
  submit?: () => Promise<string | undefined>;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const questions = definition.questions.filter((q) => q.points > 0);
  const reflectionQuestions = definition.questions.filter((q) => q.points === 0);
  const working = lab.working;
  const outcomes = outcomesFor(definition, lab.view, identity, working);
  const points = totals(definition);
  const complete =
    !definition.requireComplete || outcomes.filter((o) => !o.bonus).every((o) => o.passed);
  const answered =
    !definition.requireComplete ||
    definition.questions
      .filter((q) => q.required)
      .every((q) => answerPresent(q, lab.answers[q.id]));
  const missing = definition.questions
    .map((q, i) => ({ q, number: i + 1 }))
    .filter(({ q }) => q.required && !answerPresent(q, lab.answers[q.id]));
  return (
    <div className="page narrow">
      <StudentSteps basePath={basePath} />
      <span className="eyebrow">{definition.type.toUpperCase()} / FINAL REVIEW</span>
      <h1>Review &amp; submit</h1>
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
          <span>Provisional practical points</span>
          <strong>
            {outcomes.filter((o) => o.passed && !o.bonus).reduce((sum, o) => sum + o.points, 0)} /{' '}
            {points.practical}
            {points.bonus > 0
              ? ' · Bonus ' +
                outcomes.filter((o) => o.passed && o.bonus).reduce((s, o) => s + o.points, 0) +
                ' / ' +
                points.bonus
              : ''}
          </strong>
        </div>
        <p className="muted">
          This is a preview, not a verified grade. Theory:{' '}
          {questions.filter((q) => lab.answers[q.id]?.trim()).length}/{questions.length} answered ·
          practical reflections:{' '}
          {
            reflectionQuestions.filter((q) => q.required).filter((q) => lab.answers[q.id]?.trim())
              .length
          }
          /{reflectionQuestions.filter((q) => q.required).length}.
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
            {error} Your work remains saved on this device. Correct any missing work and retry;
            uncertain network failures retain the same submission reference.
          </p>
        )}
        {!submit && <Checkpoints lab={lab} authenticated={authenticated} />}
        <div className="review-actions">
          <button
            className="outline-button"
            disabled={!lab.ready || busy}
            onClick={async () => {
              try {
                downloadJSON('ieee-git-lab-backup.json', await lab.capture());
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Download size={16} />
            Export backup
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              lab.busy ||
              !lab.ready ||
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
                if (submit) {
                  const receipt = await submit();
                  if (!receipt) throw new Error('No server receipt returned');
                  navigate(basePath + '/result');
                  return;
                }
                const client = requireBackend();
                const pending = await loadOutbox(lab.attemptId!);
                const saved = await lab.capture();
                const payload = pending || {
                  version: 1,
                  attemptId: lab.attemptId,
                  idempotencyKey: crypto.randomUUID(),
                  snapshot: saved.snapshot,
                  answers: saved.answers,
                  events: saved.events,
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
            {busy
              ? 'Verifying work…'
              : definition.type === 'exam'
                ? 'Submit Exam'
                : 'Submit assignment'}
            <ArrowRight size={16} />
          </button>
        </div>
        {!complete && (
          <p className="muted">
            Required practical tasks remaining:{' '}
            {outcomes
              .filter((o) => !o.bonus && !o.passed)
              .map((o) => o.label)
              .join('; ')}
            .
          </p>
        )}
        {missing.length > 0 && (
          <div className="notice">
            <p>Unanswered required questions: {missing.map((m) => m.number).join(', ')}.</p>
            <Link to={basePath + '/theory'}>Return to Questions</Link>
            {!definition.requireComplete && (
              <p>
                This assessment permits partial submission. Unanswered questions receive no credit;
                exam expiry still finalizes the last accepted save.
              </p>
            )}
          </div>
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
