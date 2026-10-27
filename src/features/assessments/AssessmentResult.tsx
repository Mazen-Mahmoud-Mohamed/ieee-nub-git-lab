import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import type { Lab } from '../../hooks/useLab';
import { totals, type Definition, type AttemptState } from './model';
export function AssessmentResult({
  lab,
  definition,
  state,
  basePath,
}: {
  lab: Lab;
  definition: Definition;
  state: AttemptState;
  basePath: string;
}) {
  const [result, setResult] = useState<{
    practical_score: number;
    theory_score: number;
    feedback: string;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (supabase)
      void supabase
        .from('released_results')
        .select('*')
        .eq('attempt_id', state.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) setError(error.message);
          else setResult(data);
        });
  }, [state.id]);
  const points = totals(definition);
  return (
    <div className="page narrow">
      <span className="eyebrow">{definition.type.toUpperCase()} / SUBMISSION</span>
      <h1>{definition.title}</h1>
      <div className="form-card">
        <h2>
          {lab.receipt
            ? 'Submission received'
            : state.status === 'in_progress'
              ? 'Still in progress'
              : 'Finalizing'}
        </h2>
        {(state.auto_submitted || state.status === 'expired') && (
          <p>
            Automatically finalized at the server deadline. Only the last server-accepted autosave
            was included.
          </p>
        )}
        {lab.receipt && (
          <div className="receipt">
            SUBMISSION REFERENCE<code>{lab.receipt}</code>
          </div>
        )}
        {result ? (
          <>
            <h3>
              Score: {Number(result.practical_score) + Number(result.theory_score)} /{' '}
              {points.practical + points.theory + points.bonus}
              {points.bonus
                ? ' maximum (' +
                  (points.practical + points.theory) +
                  ' mandatory + ' +
                  points.bonus +
                  ' optional bonus)'
                : ''}
            </h3>
            <p>
              Practical: {result.practical_score} · Theory: {result.theory_score}
            </p>
            <p className="written-answer">{result.feedback || 'No additional feedback.'}</p>
          </>
        ) : (
          <p>Results are pending instructor review or release.</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {definition.reviewAnswers && lab.receipt && (
          <details>
            <summary>Review your responses</summary>
            {definition.questions.map((q) => (
              <article key={q.id}>
                <h4>{q.prompt}</h4>
                <p className="written-answer">{lab.answers[q.id] || 'Unanswered'}</p>
              </article>
            ))}
          </details>
        )}
        <div className="review-actions">
          <Link to="/dashboard" className="primary">
            Back to assignments & exams
          </Link>
          {!lab.receipt && (
            <Link to={basePath + '/review'} className="outline-button">
              Review work
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
