import { Link } from 'react-router-dom';
import type { Definition } from '../assessments/model';
import { totals } from '../assessments/model';
import type { TaskProgress } from '../assessments/requirements';
import type { StudentIdentity } from './assignment';
export function TaskInstructions({
  definition: d,
  progress,
  section,
  onSection,
  identity,
  checking,
  error,
  basePath,
}: {
  definition: Definition;
  progress: TaskProgress[];
  section: string;
  onSection: (id: string) => void;
  identity: StudentIdentity;
  checking: boolean;
  error: string;
  basePath: string;
}) {
  const required = progress.filter((p) => !p.task.bonus),
    all = required.flatMap((p) => p.requirements),
    done = all.filter((c) => c.passed === true).length,
    tasks = required.filter((p) => p.passed).length;
  const requiredSections = d.sections.filter((s) => s.tasks.some((t) => !t.bonus));
  const finishedSections = requiredSections.filter((s) =>
    s.tasks.filter((t) => !t.bonus).every((t) => progress.find((p) => p.task.id === t.id)?.passed),
  ).length;
  const current = d.sections.find((s) => s.id === section) || d.sections[0];
  const points = totals(d);
  const score = required.filter((p) => p.passed).reduce((n, p) => n + p.task.points, 0);
  const bonus = progress
    .filter((p) => p.task.bonus && p.passed)
    .reduce((n, p) => n + p.task.points, 0);
  const complete = tasks === required.length;
  const statusLabel = {
    completed: 'Completed',
    incomplete: 'Not completed',
    checking: 'Checking',
    unverifiable: 'Unable to verify',
  };
  return (
    <aside className="instructions" aria-label="Task Instructions">
      <div className="panel-heading">
        <span>Task Instructions</span>
        <span>{checking ? 'Checking changes…' : 'Live progress'}</span>
      </div>
      <div className="instruction-scroll">
        <details className="workspace-guide">
          <summary>How to use this workspace</summary>
          <ol>
            <li>Create a text file in the project using Files or the terminal.</li>
            <li>
              Select a file from the left panel to open the Text Editor. This replaces Notepad or
              nano.
            </li>
            <li>Type in the editor. Changes save automatically on this device.</li>
            <li>
              Use the Git Terminal for commands. Your editor and terminal share the same files.
            </li>
            <li>Watch the checklist below, then continue to questions or review.</li>
          </ol>
        </details>
        {!error && (
          <div className="requirement-summary" aria-live="polite">
            <strong>
              {done} / {all.length} checks completed
            </strong>
            <span>
              {tasks} / {required.length} scored tasks
            </span>
            <span>
              {finishedSections} / {requiredSections.length} required sections
            </span>
            <span>
              Local practical estimate: {score} / {points.practical}
              {points.bonus ? ' · Bonus ' + bonus + ' / ' + points.bonus : ''}
            </span>
          </div>
        )}
        {!error && (
          <progress aria-label="Requirement progress" value={done} max={all.length || 1} />
        )}
        <p className="progress-explanation">
          Checks show individual steps, including file preparation. Points are earned when a whole
          scored task passes. The server verifies your grade on save or submission.
        </p>
        {checking && <p role="status">Checking the latest workspace changes…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <nav className="section-navigation" aria-label="Practical sections">
          {d.sections.map((s, i) => {
            const items = progress.filter((p) => s.tasks.some((t) => t.id === p.task.id));
            const checks = items.flatMap((p) => p.requirements);
            const finished = checks.filter((c) => c.passed === true).length;
            const passed = items.length > 0 && items.every((p) => p.passed);
            const state = passed ? 'completed' : finished ? 'partial' : 'not-started';
            return (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === current?.id ? 'step' : undefined}
                data-progress={state}
                onClick={() => onSection(s.id)}
              >
                <span className="section-index">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {error
                      ? 'Unable to verify'
                      : passed
                        ? 'Completed'
                        : finished
                          ? 'In progress'
                          : 'Not started'}{' '}
                    · {finished}/{checks.length} checks ·{' '}
                    {s.tasks.reduce((n, t) => n + t.points, 0)} points
                    {s.tasks.every((t) => t.bonus) ? ' · Optional' : ''}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>
        {current ? (
          <section className="current-task" aria-labelledby="current-section-title">
            <h2 id="current-section-title">{current.title}</h2>
            <p>{current.description}</p>
            <h3>What you need to do</h3>
            {current.steps.length > 0 && (
              <ol className="task-steps">
                {current.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
            {current.tasks.map((task) => {
              const state = progress.find((p) => p.task.id === task.id);
              if (!state) return null;
              const missing = state.requirements.filter((c) => c.passed !== true);
              return (
                <article key={task.id} className="task-feedback" aria-label={task.title}>
                  <h3>{task.title}</h3>
                  <span className={state.passed ? 'passed' : 'muted'}>
                    {error || state.requirements.some((c) => c.status === 'unverifiable')
                      ? 'Unable to verify scored task'
                      : state.passed
                        ? 'Scored task complete'
                        : 'Scored task incomplete'}{' '}
                    · {task.points} points{task.bonus ? ' · Optional bonus' : ''}
                  </span>
                  {task.instructions !== current.steps.join('\n') && (
                    <p className="written-answer">{task.instructions}</p>
                  )}
                  {task.rules.some((r) => r.type === 'legacy' && r.outcomeId === 'files') && (
                    <div className="file-requirements">
                      <h4>Required file contents</h4>
                      <strong>about.txt</strong>
                      <pre>{`Name: ${identity.full_name || 'Your full name'}\nUniversity: Nahda University\nDepartment: ${identity.department || 'Your department'}`}</pre>
                      <strong>goals.txt</strong>
                      <pre>
                        {
                          'My Goals:\n\n1. Learn Git\n2. Understand version control\n3. Work on team projects'
                        }
                      </pre>
                      <strong>notes.txt</strong>
                      <pre>{'Git Course - Session 1\nIEEE NUB Student Branch'}</pre>
                    </div>
                  )}
                  <h4>Your progress</h4>
                  <ul className="requirement-list">
                    {state.requirements.map((c) => (
                      <li key={c.id} data-state={c.status}>
                        <span aria-hidden="true">
                          {c.status === 'completed'
                            ? '✓'
                            : c.status === 'checking'
                              ? '…'
                              : c.status === 'unverifiable'
                                ? '!'
                                : '○'}
                        </span>
                        <span>
                          {c.label}
                          {c.preparation && <small>Preparation</small>}
                          <small className="requirement-state">{statusLabel[c.status]}</small>
                          {c.status === 'unverifiable' && <small>{c.hint}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!state.passed && (
                    <div className="next-requirement">
                      <h4>What is missing</h4>
                      <p>
                        {checking
                          ? 'Waiting for the current changes to finish checking.'
                          : missing
                              .filter((c) => !c.preparation)
                              .slice(0, 2)
                              .map((c) => c.label)
                              .join('; ') ||
                            missing[0]?.label ||
                            'The scored conditions are not all met yet.'}
                      </p>
                      <h4>What to do next</h4>
                      <p>{state.next}</p>
                    </div>
                  )}
                  <details className="task-explanation">
                    <summary>How this progress is checked</summary>
                    <p>
                      The checklist reads your actual files, configuration and saved Git history.
                      Preparation checks show work before a commit; committed checks verify the
                      branch named in the task. Typing a command alone does not complete a
                      requirement.
                    </p>
                  </details>
                </article>
              );
            })}
          </section>
        ) : (
          <p>No practical tasks. Continue to the questions or review.</p>
        )}
        <Link
          className={
            'primary theory-button ' +
            (checking || !!error || (!complete && d.gateTheory) ? 'disabled-link' : '')
          }
          aria-disabled={checking || !!error || (!complete && d.gateTheory)}
          to={
            basePath +
            (checking || !!error || (!complete && d.gateTheory)
              ? '/workspace'
              : d.questions.length
                ? '/theory'
                : '/review')
          }
        >
          {d.questions.length ? 'Continue to theory' : 'Review submission'}
        </Link>
        {!complete && d.gateTheory && (
          <small>
            Complete the required scored tasks to unlock theory. Bonus work is optional.
          </small>
        )}
      </div>
    </aside>
  );
}
