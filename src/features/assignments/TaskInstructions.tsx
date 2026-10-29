import type { ReactNode } from 'react';
import { taskGuide, taskFeedback } from '../assessments/presentation';
import type { RepoView } from '../git-engine/engine';
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
  view,
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
  view: RepoView;
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
    required = progress.filter((p) => !p.task.bonus),
    complete = required.every((p) => p.passed),
    done = state?.requirements.filter((c) => c.status === 'completed').length || 0,
    guide = current ? taskGuide(current.task) : null,
    feedback = state ? taskFeedback(state, view) : null;
  const displayRequirements = (() => {
    if (
      d.gradingPolicy ||
      !state ||
      !current?.task.rules.some((r) => r.type === 'legacy' && r.outcomeId === 'separate')
    )
      return state?.requirements || [];
    const groups = new Map<string, typeof state.requirements>();
    for (const c of state.requirements) {
      const file = /about|personal-message|message$/.test(c.id)
        ? 'about.txt'
        : /goals/.test(c.id)
          ? 'goals.txt'
          : /notes/.test(c.id)
            ? 'notes.txt'
            : c.id;
      groups.set(file, [...(groups.get(file) || []), c]);
    }
    return [...groups].map(([key, checks]) => ({
      ...checks[0],
      id: key,
      label: key.endsWith('.txt')
        ? `First commit ${key} by itself, with the required text${key === 'about.txt' ? ' and message' : ''}`
        : checks[0].label,
      status: checks.every((c) => c.status === 'completed')
        ? ('completed' as const)
        : checks.some((c) => c.status === 'unverifiable')
          ? ('unverifiable' as const)
          : checking
            ? ('checking' as const)
            : ('incomplete' as const),
    }));
  })();
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
                {d.gradingPolicy && t.task.points === 0
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
              {d.gradingPolicy && current.task.points === 0
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
          <p className="task-start">{guide?.before}</p>
          <ol className="task-actions">
            {guide?.steps.map((step) => (
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
            {d.gradingPolicy
              ? 'Each scored requirement earns its own points. You can continue with unfinished work.'
              : `Earn all ${current.task.points} points when every scored requirement passes. Checklist items do not earn separate points.`}
          </small>
          <ol className="requirement-list">
            {displayRequirements.map((c) => (
              <li key={c.id} data-state={c.status}>
                <span aria-hidden>
                  {c.status === 'completed' ? '✓' : c.status === 'checking' ? '…' : '○'}
                </span>
                <span>
                  {c.label}
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
              {state.passed
                ? 'Ready for the next task'
                : feedback?.history
                  ? 'A mistake in the first commit'
                  : 'What to do next'}
            </strong>
            <p>{checking ? 'Checking your latest changes…' : feedback?.text}</p>
            {!state.passed && !feedback?.history && (
              <button
                className="text-button"
                onClick={() =>
                  onWork(
                    current.task.rules.some(
                      (r) => r.type === 'file' || (r.type === 'legacy' && r.outcomeId === 'files'),
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
            {feedback?.history && (
              <p>
                The introductory commits share this repository with later tasks. New commits cannot
                change those introductions. Keep working for other points, or use the
                policy-controlled Restart Attempt to rebuild the shared history. All work in this
                attempt is retained; a fresh attempt starts from the published starter.
              </p>
            )}
            {feedback?.history && recovery && (
              <button
                className="text-button"
                onClick={() => {
                  const panel = document.getElementById('attempt-recovery');
                  if (panel instanceof HTMLDetailsElement) {
                    panel.open = true;
                    panel.scrollIntoView({ block: 'nearest' });
                    panel.querySelector('summary')?.focus();
                  }
                }}
              >
                See your recovery options
              </button>
            )}
          </div>
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
          <details className="published-instructions">
            <summary>Full published instructions</summary>
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
