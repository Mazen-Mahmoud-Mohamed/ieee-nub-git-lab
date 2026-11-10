import { taskOneDefinition } from '../assessments/taskOne';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Download, ClipboardCheck } from 'lucide-react';
import { type StudentIdentity } from '../assignments/assignment';
import {
  outcomesFor,
  earnedPoints,
  sumPoints,
  totals,
  answerPresent,
  type Definition,
} from '../assessments/model';
import { StudentSteps } from '../assessments/StudentSteps';
import type { Lab } from '../../hooks/useLab';

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
  definition = taskOneDefinition(),
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
  const outcomes = outcomesFor(definition, lab.view, identity, lab.working);
  const scored = outcomes.filter((item) => !item.bonus && item.points > 0);
  const complete = scored.filter((item) => item.passed);
  const remaining = scored.filter((item) => !item.passed);
  const points = totals(definition);
  const questions = definition.questions.map((question, index) => ({
    question,
    number: index + 1,
    answered: answerPresent(question, lab.answers[question.id]),
  }));
  const answered = questions.filter((item) => item.answered);
  const unanswered = questions.filter((item) => !item.answered);
  const missing = unanswered.filter(({ question }) => question.required);
  const pending = !lab.ready || lab.busy || !!lab.validationError;
  const practice = !submit || !authenticated;

  const finalize = async () => {
    if (
      (remaining.length || missing.length) &&
      !window.confirm(
        'You have unfinished requirements or answers. Submit the work you have now? A submitted attempt is read only.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const receipt = await submit?.();
      if (!receipt) throw new Error('No server receipt returned');
      navigate(basePath + '/result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page lab-review">
      <StudentSteps basePath={basePath} />
      <header className="lab-page-heading">
        <div>
          <span className="lab-kicker">Final review</span>
          <h1>Review &amp; submit</h1>
          <p>{definition.title}</p>
        </div>
        <span className="lab-save-label" role="status">
          {lab.saving}
        </span>
      </header>
      <div className="lab-review-grid">
        <section className="lab-review-card" aria-labelledby="lab-review-practical">
          <h2 id="lab-review-practical">Practical work</h2>
          {pending ? (
            <p>Practical progress is not available yet.</p>
          ) : (
            <>
              <p className="lab-review-score">
                <strong>
                  {sumPoints(scored.map(earnedPoints))} / {points.practical}
                </strong>{' '}
                provisional points
              </p>
              {points.bonus > 0 && (
                <p>
                  Bonus: {sumPoints(outcomes.filter((item) => item.bonus).map(earnedPoints))} /{' '}
                  {points.bonus}
                </p>
              )}
              {[
                { items: complete, label: 'Completed' },
                { items: remaining, label: 'Incomplete' },
              ].map(({ items, label }) => (
                <details key={label}>
                  <summary>
                    {label} <strong>{items.length}</strong>
                  </summary>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <span dir="auto">{item.label}</span>
                        <strong>
                          {earnedPoints(item)} / {item.points}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
          <p>Practical points are verified on submission.</p>
        </section>
        <section className="lab-review-card" aria-labelledby="lab-review-theory">
          <h2 id="lab-review-theory">Questions</h2>
          <p className="lab-review-score">
            <strong>
              {answered.length} / {questions.length}
            </strong>{' '}
            answered
          </p>
          <details>
            <summary>
              Answered <strong>{answered.length}</strong>
            </summary>
            <ul>
              {answered.map(({ question, number }) => (
                <li key={question.id}>
                  <div>
                    <strong>
                      {number}. {question.prompt}
                    </strong>
                    <p className="written-answer" dir="auto">
                      {lab.answers[question.id]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>
              Unanswered <strong>{unanswered.length}</strong>
            </summary>
            <ul>
              {unanswered.map(({ question, number }) => (
                <li key={question.id}>
                  <span>
                    {number}. {question.prompt}
                  </span>
                  <small>{question.required ? 'Required' : 'Optional'}</small>
                </li>
              ))}
            </ul>
          </details>
          <Link className="text-button" to={basePath + '/theory'}>
            Return to Questions <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section className="lab-review-card lab-finalize" aria-labelledby="lab-finalize-title">
        <h2 id="lab-finalize-title">
          <ClipboardCheck size={20} aria-hidden="true" /> Final submission
        </h2>
        {practice ? (
          <p>
            This practice workspace is saved on this device. Sign in and start an assessed attempt
            to submit.
          </p>
        ) : (
          <>
            <p>
              {remaining.length || missing.length
                ? 'You can submit with unfinished work. Unanswered questions receive no credit.'
                : 'Your work is ready for submission.'}
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              I confirm this is my own work. I understand that a finalized attempt is read only.
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error} Your work remains saved on this device.
          </p>
        )}
        <div className="lab-review-actions">
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
            <Download size={16} aria-hidden="true" /> Export backup
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              lab.busy ||
              lab.readOnly ||
              !lab.ready ||
              !agreed ||
              practice ||
              !lab.attemptId ||
              !!lab.receipt
            }
            onClick={() => void finalize()}
          >
            {busy
              ? 'Verifying work…'
              : definition.type === 'exam'
                ? 'Submit Exam'
                : 'Submit assignment'}
            <CheckCircle2 size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
