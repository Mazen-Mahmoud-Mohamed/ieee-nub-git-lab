import { Link } from 'react-router-dom';
import { totals, type Definition } from '../assessments/model';
import type { TaskProgress } from '../assessments/requirements';
import type { StudentIdentity } from './assignment';
export function TaskInstructions({
  definition: d,
  progress,
  taskId,
  onTask,
  identity,
  checking,
  error,
  basePath,
}: {
  definition: Definition;
  progress: TaskProgress[];
  taskId: string;
  onTask: (id: string) => void;
  identity: StudentIdentity;
  checking: boolean;
  error: string;
  basePath: string;
}) {
  const tasks = d.sections.flatMap((s) => s.tasks.map((task) => ({ task, section: s }))),
    index = Math.max(
      0,
      tasks.findIndex((t) => t.task.id === taskId),
    ),
    current = tasks[index],
    state = progress.find((p) => p.task.id === current?.task.id),
    required = progress.filter((p) => !p.task.bonus),
    points = totals(d),
    earned = required.filter((p) => p.passed).reduce((n, p) => n + p.task.points, 0),
    bonus = progress.filter((p) => p.task.bonus && p.passed).reduce((n, p) => n + p.task.points, 0),
    complete = required.every((p) => p.passed),
    done = state?.requirements.filter((c) => c.status === 'completed').length || 0;
  const labels = {
    completed: 'Completed',
    incomplete: 'Not completed',
    checking: 'Checking',
    unverifiable: 'Unable to verify',
  };
  return (
    <aside className="student-task" aria-label="Task Instructions">
      <div className="task-picker">
        <label>
          Task
          <select
            aria-label="Task"
            value={current?.task.id || ''}
            onChange={(e) => onTask(e.target.value)}
          >
            {tasks.map((t, i) => (
              <option key={t.task.id} value={t.task.id}>
                {i + 1}. {t.task.title}
                {t.task.bonus ? ' (optional)' : ''}
              </option>
            ))}
          </select>
        </label>
        <small>
          {index + 1} / {tasks.length} · {current?.section.title}
        </small>
      </div>
      {error ? (
        <p role="alert" className="error">
          Unable to verify: {error}
        </p>
      ) : (
        <div className="student-score">
          <strong>
            Provisional: {earned} / {points.practical} points
          </strong>
          {points.bonus > 0 && (
            <span>
              Bonus {bonus} / {points.bonus}
            </span>
          )}
          <small>
            {required.filter((p) => p.passed).length} / {required.length} scored tasks · Official
            score is verified on submission.
          </small>
        </div>
      )}
      {current && state ? (
        <>
          <h2>{current.task.title}</h2>
          <p>
            {current.task.instructions === current.section.steps.join('\n')
              ? current.section.description
              : current.task.instructions.split('\n')[0]}
          </p>
          <h3>
            Requirements · {current.task.points} points{current.task.bonus ? ' (optional)' : ''}
          </h3>
          <ul className="requirement-list">
            {state.requirements.map((c) => (
              <li key={c.id} data-state={c.status}>
                <span aria-hidden>
                  {c.status === 'completed' ? '✓' : c.status === 'checking' ? '…' : '○'}
                </span>
                <span>
                  {c.label}
                  <small className="requirement-state">
                    {labels[c.status]}
                    {c.preparation ? ' · Preparation' : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="task-progress">
            {done} completed · {state.requirements.length - done} remaining
          </p>
          <div className="student-next">
            <strong>Next step</strong>
            <p>
              {checking
                ? 'Checking your latest changes…'
                : state.passed
                  ? 'This task is complete. Choose another task or continue to Questions.'
                  : state.next}
            </p>
          </div>
          {current.task.rules
            .filter((r) => (r.type === 'file' && r.value) || (r.type === 'message' && r.value))
            .map((r, i) => (
              <div className="required-text" key={i}>
                <strong>
                  {r.type === 'message' ? 'Required commit message' : r.path + ' · Required text'}
                </strong>
                <pre>
                  {(r.value || '')
                    .replaceAll('{{name}}', identity.full_name || 'Your full name')
                    .replaceAll('{{department}}', identity.department || 'Your department')}
                </pre>
              </div>
            ))}
          {current.task.rules.some((r) => r.type === 'legacy' && r.outcomeId === 'files') && (
            <div className="required-text">
              <h3>Required file text</h3>
              <strong>about.txt</strong>
              <pre>{`Name: ${identity.full_name || 'Your full name'}\nUniversity: Nahda University\nDepartment: ${identity.department || 'Your department'}`}</pre>
              <strong>goals.txt</strong>
              <pre>
                {'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects'}
              </pre>
              <strong>notes.txt</strong>
              <pre>{'Git Course - Session 1\nIEEE NUB Student Branch'}</pre>
            </div>
          )}
          <details className="published-instructions">
            <summary>Full published instructions</summary>
            <p className="written-answer">{current.task.instructions}</p>
            {current.section.steps.map((step, i) => (
              <p key={i}>{step}</p>
            ))}
          </details>
          <div className="task-navigation">
            <button
              className="outline-button"
              disabled={index === 0}
              onClick={() => onTask(tasks[index - 1].task.id)}
            >
              Previous Task
            </button>
            <button
              className="outline-button"
              disabled={index === tasks.length - 1}
              onClick={() => onTask(tasks[index + 1].task.id)}
            >
              Next Task
            </button>
          </div>
        </>
      ) : (
        <p>No practical tasks. Continue to Questions or Review.</p>
      )}
      <Link
        className={
          'primary continue-questions ' + (!complete && d.gateTheory ? 'disabled-link' : '')
        }
        aria-disabled={!complete && d.gateTheory}
        to={
          basePath +
          (!complete && d.gateTheory ? '/workspace' : d.questions.length ? '/theory' : '/review')
        }
      >
        {d.questions.length ? 'Continue to Questions' : 'Review submission'}
      </Link>
      {!complete && d.gateTheory && (
        <small>
          This published version unlocks Questions after required scored tasks. Bonus work is
          optional.
        </small>
      )}
    </aside>
  );
}
