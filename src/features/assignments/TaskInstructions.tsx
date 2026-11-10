import { Check, ChevronLeft, ChevronRight, Circle, CircleCheck, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TaskProgress } from '../assessments/requirements';
import type { StudentIdentity } from './assignment';

const commands: Record<string, string> = {
  'identity-name': 'git config user.name "Your Name"',
  'identity-email': 'git config user.email you@example.com',
  'main-branch': 'git branch -M main',
  'about-focused': 'git add about.txt',
  'about-message': 'git commit -m "Add personal information"',
  'goals-focused': 'git add goals.txt',
  'notes-focused': 'git add notes.txt',
  'four-commits': 'git log --oneline',
  'skills-branch': 'git switch -c feature/skills',
  'skills-merged': 'git switch main\ngit merge feature/skills',
  clean: 'git status',
};

function status(item: TaskProgress) {
  if (!item.task.points) return 'Unscored';
  if (item.requirements.some((check) => check.status === 'unverifiable')) return 'Unavailable';
  if (item.requirements.some((check) => check.status === 'checking')) return 'Checking';
  if (item.passed) return 'Completed';
  if (item.earned > 0 || item.requirements.some((check) => check.passed)) return 'Partial';
  return 'Not started';
}

export function TaskInstructions({
  progress,
  taskId,
  identity,
  initializationHint,
  checking,
  error,
  checked,
  onTask,
  onCheck,
  recovery,
}: {
  progress: TaskProgress[];
  taskId: string;
  identity: StudentIdentity;
  initializationHint: string;
  checking: boolean;
  error: string;
  checked: string;
  onTask: (id: string) => void;
  onCheck: () => Promise<void>;
  recovery?: ReactNode;
}) {
  const index = Math.max(
    0,
    progress.findIndex(({ task }) => task.id === taskId),
  );
  const current = progress[index];
  if (!current)
    return (
      <>
        <p>This assessment has no practical tasks. Open Questions to continue.</p>
        {recovery}
      </>
    );

  const { task, requirements } = current;
  const state = status(current);
  const criterion = task.rules.length === 1 && task.rules[0].type === 'criterion';
  const outcome = task.rules[0]?.outcomeId;
  const requiredText = criterion
    ? (
        {
          'about-content':
            'Name: ' +
            (identity.full_name || 'your profile name') +
            '\nUniversity: Nahda University\nDepartment: ' +
            (identity.department || 'your profile department'),
          'goals-content':
            'My Goals:\n1. Learn Git\n2. Understand version control\n3. Work on team projects',
          'notes-content': 'Git Course - Session 1\nIEEE NUB Student Branch',
          'skills-content': 'Problem Solving\nCommunication\nTeamwork',
        } as Record<string, string>
      )[outcome || '']
    : '';
  const hint =
    criterion && !current.passed
      ? outcome === 'initialized'
        ? initializationHint
        : commands[outcome || '']
      : '';
  const instructions = task.instructions.split('\n').filter(Boolean);

  return (
    <>
      <div className="lab-task-top">
        <span>
          <ListChecks size={17} aria-hidden="true" /> Practical criteria
        </span>
        <span>
          {index + 1} of {progress.length}
        </span>
      </div>
      <label className="lab-task-picker">
        Choose a criterion
        <select aria-label="Task" value={task.id} onChange={(event) => onTask(event.target.value)}>
          {progress.map((item, i) => (
            <option key={item.task.id} value={item.task.id}>
              {i + 1}. {item.task.title} · {status(item)}
            </option>
          ))}
        </select>
      </label>
      <div className="lab-task-content" key={task.id}>
        <div className="lab-task-result">
          <span className={current.passed ? 'lab-state lab-state-done' : 'lab-state'}>
            {current.passed ? (
              <CircleCheck size={15} aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}
            {state}
          </span>
          <strong>
            {checking || error ? '—' : current.earned} / {task.points} points
          </strong>
        </div>
        <h2 dir="auto">
          {index + 1}. {task.title}
        </h2>
        <h3>What you need to do</h3>
        <ul className="lab-checklist">
          {instructions.map((instruction, i) => (
            <li key={i} dir="auto">
              {criterion && current.passed ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Circle size={13} aria-hidden="true" />
              )}
              <span>{instruction}</span>
            </li>
          ))}
          {!criterion &&
            requirements.map((item) => (
              <li key={item.id}>
                {item.passed ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Circle size={13} aria-hidden="true" />
                )}
                <span>{item.label}</span>
                {!!item.points && (
                  <small>
                    {item.earned ?? 0} / {item.points} points
                  </small>
                )}
              </li>
            ))}
        </ul>
        {requiredText && (
          <div className="lab-command-hint">
            <span>Required text</span>
            <pre dir="auto">{requiredText}</pre>
          </div>
        )}
        {!criterion &&
          task.rules
            .filter((rule) => rule.value && (rule.type === 'file' || rule.type === 'message'))
            .map((rule, i) => (
              <div className="lab-command-hint" key={i}>
                <span>{rule.type === 'file' ? 'Required text' : 'Commit message text'}</span>
                <pre dir="auto">{rule.value}</pre>
              </div>
            ))}
        {hint && (
          <div className="lab-command-hint">
            <span>Try in Terminal</span>
            <pre dir="ltr">{hint}</pre>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {requirements.some((item) => item.detected || (!criterion && item.expected)) && (
          <details className="lab-evidence">
            <summary>Technical evidence</summary>
            <ul>
              {requirements
                .filter((item) => item.detected || item.expected)
                .map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>
                    <p>{item.detected || item.expected}</p>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
      <button
        className="primary lab-check-button"
        disabled={checking}
        onClick={() => void onCheck()}
      >
        <CircleCheck size={17} aria-hidden="true" /> {checking ? 'Checking…' : 'Check Work'}
      </button>
      {checked && (
        <small className="lab-check-feedback" role="status">
          {checked}
        </small>
      )}
      <nav className="lab-criterion-nav" aria-label="Criterion navigation">
        <button
          className="outline-button"
          disabled={index === 0}
          onClick={() => onTask(progress[index - 1].task.id)}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <button
          className="outline-button"
          disabled={index === progress.length - 1}
          onClick={() => onTask(progress[index + 1].task.id)}
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </nav>
      {recovery}
    </>
  );
}
