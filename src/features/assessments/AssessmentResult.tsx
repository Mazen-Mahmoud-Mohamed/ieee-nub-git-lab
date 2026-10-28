import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import type { Lab } from '../../hooks/useLab';
import { requirementCatalog } from './requirements';
import { sumPoints, totals, type Definition, type AttemptState } from './model';
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
  type Breakdown = Array<{
    task_key: string;
    points: number;
    requirement_results: Array<{ id: string; earned: number; points: number }> | null;
  }>;
  const key = `${state.id}:${definition.gradingPolicy || 'legacy'}:${definition.reviewAnswers}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    result: { practical_score: number; theory_score: number; feedback: string } | null;
    breakdown: Breakdown;
    error: string;
  }>();
  const current = loaded?.key === key ? loaded : undefined;
  const result = current?.result,
    breakdown = current?.breakdown || [],
    error = current?.error || '';
  useEffect(() => {
    let live = true;
    const client = supabase;
    if (client)
      void Promise.all([
        client.from('released_results').select('*').eq('attempt_id', state.id).maybeSingle(),
        definition.gradingPolicy && definition.reviewAnswers
          ? client
              .from('task_results')
              .select('task_key,points,requirement_results')
              .eq('attempt_id', state.id)
          : Promise.resolve({ data: [], error: null }),
      ])
        .then(([summary, details]) => {
          if (live)
            setLoaded({
              key,
              result: summary.data,
              breakdown: details.data || [],
              error:
                summary.error?.message ||
                (details.error ? 'The released requirement breakdown could not be loaded.' : ''),
            });
        })
        .catch(() => {
          if (live)
            setLoaded({
              key,
              result: null,
              breakdown: [],
              error: 'Released results could not be loaded. Refresh to try again.',
            });
        });
    return () => {
      live = false;
    };
  }, [key, definition.gradingPolicy, definition.reviewAnswers, state.id]);
  const points = totals(definition);
  return (
    <div className="page narrow">
      <span className="eyebrow">{definition.type.toUpperCase()} / SUBMISSION</span>
      <h1>{definition.title}</h1>
      {breakdown.length > 0 && (
        <details className="form-card">
          <summary>Official requirement points</summary>
          {breakdown.map((row) => {
            const task = definition.sections
              .flatMap((s) => s.tasks)
              .find((t) => t.id === row.task_key);
            const checks = task ? requirementCatalog(task) : [];
            return (
              <section key={row.task_key}>
                <h3>
                  {task?.title}: {row.points} / {task?.points}
                  {task?.bonus ? ' bonus' : ''}
                </h3>
                <ul>
                  {row.requirement_results?.map((c) => (
                    <li key={c.id}>
                      {checks.find((r) => r.id === c.id)?.label || c.id}: {c.earned} / {c.points}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </details>
      )}
      <div className="form-card">
        <h2>
          {lab.receipt
            ? 'Submission received'
            : state.status === 'in_progress'
              ? 'Still in progress'
              : state.status === 'invalidated'
                ? 'Attempt invalidated'
                : state.status === 'restarted'
                  ? 'Previous attempt retained after restart'
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
              Official score:{' '}
              {definition.gradingPolicy
                ? sumPoints([Number(result.practical_score), Number(result.theory_score)])
                : Number(result.practical_score) + Number(result.theory_score)}{' '}
              /{' '}
              {definition.gradingPolicy
                ? sumPoints([points.practical, points.theory])
                : points.practical + points.theory}
            </h3>
            {points.bonus > 0 && (
              <p>
                Up to {points.bonus} optional bonus points can raise this score above{' '}
                {definition.gradingPolicy
                  ? sumPoints([points.practical, points.theory])
                  : points.practical + points.theory}
                .
              </p>
            )}
            <p>
              Practical: {result.practical_score} · Theory: {result.theory_score}
            </p>
            <p className="written-answer" dir="auto">
              {result.feedback || 'No additional feedback.'}
            </p>
          </>
        ) : (
          <p>
            {state.status === 'invalidated'
              ? 'This attempt is retained read only. No submission or official grade was created. Ask your instructor about the invalidation.'
              : state.status === 'restarted'
                ? 'This attempt was not submitted for grading. Its previous work is retained; open the new attempt to continue.'
                : 'Results are pending instructor review or release.'}
          </p>
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
                <h4 dir="auto">{q.prompt}</h4>
                <p className="written-answer" dir="auto">
                  {lab.answers[q.id] || 'Unanswered'}
                </p>
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
