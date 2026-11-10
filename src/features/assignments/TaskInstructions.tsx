import type { ReactNode } from 'react';
import { taskGuide, taskFeedback } from '../assessments/presentation';
import { Link } from 'react-router-dom';
import { type Definition } from '../assessments/model';
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
  recovery,
  onWork = () => {},
  onRecheck = () => {},
}: {
  definition: Definition;
  progress: TaskProgress[];
  taskId: string;
  onTask: (id: string) => void;
  identity: StudentIdentity;
  checking: boolean;
  error: string;
  basePath: string;
  recovery?: ReactNode;
  onWork?: (view: string) => void;
  onRecheck?: () => void;
}) {
  const tasks = d.sections.flatMap((s) => s.tasks.map((task) => ({ task, section: s }))),
    index = Math.max(
      0,
      tasks.findIndex((t) => t.task.id === taskId),
    ),
    current = tasks[index],
    state = progress.find((p) => p.task.id === current?.task.id),
    done = state?.requirements.filter((c) => c.status === 'completed').length || 0,
    independent = current?.task.rules.some((r) => r.type === 'criterion'),
    guide = current ? taskGuide(current.task) : null,
    feedback = state ? taskFeedback(state) : null;
  const displayRequirements = state?.requirements || [];
  const labels = {
    completed: 'Completed',
    incomplete: 'Not completed',
    checking: 'Checking',
    unverifiable: 'Unable to verify',
  };
  return (
    <aside
      className="student-task"
      id="workspace-task"
      role="tabpanel"
      aria-labelledby="workspace-tab-task"
      aria-label="Task Instructions"
    >
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
                {i + 1}. {taskGuide(t.task).title}
                {t.task.points === 0
                  ? ' (unscored)'
                  : t.task.bonus
                    ? ' (optional)'
                    : ''}
                {progress.find((p) => p.task.id === t.task.id)?.passed ? ' · Complete' : ''}
              </option>
            ))}
          </select>
        </label>
        <small>
          {index + 1} / {tasks.length} · {current?.section.title}
        </small>
      </div>
      {error && (
        <p role="alert" className="error">
          Unable to verify: {error}
        </p>
      )}
      {current && state ? (
        <>
          <div className="task-heading">
            <span className={'task-status ' + (state.passed ? 'done' : '')}>
              {current.task.points === 0
                ? 'Informational'
                : checking
                  ? 'Checking…'
                  : state.passed
                    ? 'Complete'
                    : 'In progress'}
            </span>
            <span>
              {state.earned} / {current.task.points} points
              {current.task.bonus ? ' · Optional bonus' : ''}
            </span>
          </div>
          <h2 dir="auto">{guide?.title}</h2>
          {!independent && <p className="task-start">{guide?.before}</p>}
          <ol className="task-actions">
            {!independent &&
              guide?.steps.map((step) => (
                <li key={step} dir="auto">
                  {step}
                </li>
              ))}
          </ol>
          {guide?.message && (
            <div className="required-message">
              <strong>Exact commit message</strong>
              <code dir="ltr">{guide.message}</code>
            </div>
          )}
          {guide?.warning && !state.passed && <p className="task-caution">{guide.warning}</p>}
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
          <div className="task-work-actions">
            <button className="outline-button" onClick={() => onWork('terminal')}>
              Open Terminal
            </button>
            <button className="outline-button" onClick={() => onWork('files')}>
              Open Files
            </button>
          </div>
          <h3>Check your work</h3>
          <small>
            Each scored requirement earns its own points. You can continue with unfinished work.
          </small>
          <ol className="requirement-list">
            {displayRequirements.map((c) => (
              <li key={c.id} data-state={c.status}>
                <span aria-hidden>
                  {c.status === 'completed' ? '✓' : c.status === 'checking' ? '…' : '○'}
                </span>
                <span>
                  {c.label}
                  {c.detected && (
                    <details>
                      <summary>Verified evidence</summary>
                      <small>{c.detected}</small>
                    </details>
                  )}
                  {c.passed !== true && displayRequirements.length > 1 && <small>{c.hint}</small>}
                  <small className="requirement-state">
                    {labels[c.status]}
                    {c.preparation
                      ? ' · Preparation · Unscored'
                      : c.points !== undefined
                        ? ` · ${c.earned || 0} / ${c.points} points`
                        : ''}
                  </small>
                </span>
              </li>
            ))}
          </ol>
          <div className="student-next" role="status">
            <strong>
              {state.passed ? 'Ready for the next task' : 'What to do next'}
            </strong>
            <p>{checking ? 'Checking your latest changes…' : feedback}</p>
            {!state.passed && (
              <button
                className="text-button"
                onClick={() =>
                  onWork(
                    current.task.rules.some(
                      (r) => r.type === 'file' || (r.type === 'criterion' && /-(exists|content)$/.test(r.outcomeId || '')),
                    )
                      ? 'files'
                      : 'terminal',
                  )
                }
              >
                Fix This Step
              </button>
            )}
            <button className="text-button" disabled={checking} onClick={onRecheck}>
              Check again
            </button>
          </div>
          {!independent && (
            <details className="check-evidence">
              <summary>Technical check details</summary>
              <p>{guide?.result}</p>
              <p>
                {done} completed · {state.requirements.length - done} remaining
              </p>
              {state.requirements.map((c) => (
                <div key={c.id}>
                  <strong>{c.label}</strong>
                  <p>
                    Expected: {c.expected || c.label}. Detected: {c.detected || labels[c.status]}.
                  </p>
                </div>
              ))}
            </details>
          )}
          <details className="published-instructions">
            <summary>
              {independent
                ? 'Original exercise guide (including optional extension)'
                : 'Full published instructions'}
            </summary>
            {independent &&
              d.sections
                .filter((s) => s.steps.length)
                .map((s) => (
                  <section key={s.id}>
                    <h3>{s.title}</h3>
                    <ol>
                      {s.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </section>
                ))}
            <p className="written-answer" dir="auto">
              {current.task.title}
            </p>
            <p className="written-answer" dir="auto">
              {current.task.instructions}
            </p>
            {current.section.description && <p dir="auto">{current.section.description}</p>}
            {current.section.steps.map((step, i) => (
              <p key={i} dir="auto">
                {step}
              </p>
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
      {recovery}
      <Link className="primary continue-questions" to={basePath + (d.questions.length ? '/theory' : '/review')}>
        {d.questions.length ? 'Continue to Questions' : 'Review submission'}
      </Link>
    </aside>
  );
}
