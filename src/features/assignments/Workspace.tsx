import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ClipboardList, Code2, FolderOpen, TerminalSquare } from 'lucide-react';
import { taskOneDefinition } from '../assessments/taskOne';
import { type Definition, sumPoints, totals } from '../assessments/model';
import { RestartAttempt } from '../assessments/RestartAttempt';
import { StudentSteps } from '../assessments/StudentSteps';
import type { StudentIdentity } from './assignment';
import type { Lab } from '../../hooks/useLab';
import { Terminal } from '../terminal/Terminal';
import { PracticeIdentity } from './PracticeIdentity';
import { requirementProgress } from '../assessments/requirements';
import { TaskInstructions } from './TaskInstructions';
import { WorkspaceFiles } from './WorkspaceFiles';

const workTabs = [
  { id: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { id: 'files', label: 'Files', Icon: FolderOpen },
  { id: 'editor', label: 'Code Editor', Icon: Code2 },
] as const;
const taskTab = { id: 'task', label: 'Task', Icon: ClipboardList } as const;
type View = (typeof workTabs)[number]['id'] | 'task';
const mobileQuery = '(max-width: 900px)';

export function Workspace({
  lab,
  identity,
  dark,
  definition = taskOneDefinition(),
  basePath = '',
  onRestart,
}: {
  lab: Lab;
  identity: StudentIdentity;
  dark: boolean;
  definition?: Definition;
  basePath?: string;
  onRestart?: () => Promise<void>;
}) {
  const [params] = useSearchParams();
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const [view, setView] = useState<View>('terminal');
  const [taskId, setTaskId] = useState('');
  const [checked, setChecked] = useState('');
  const tabs = mobile ? [taskTab, ...workTabs] : workTabs;
  const activeView = !mobile && view === 'task' ? 'terminal' : view;
  const last = useRef({ key: lab.key, generation: lab.resetGeneration });
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia(mobileQuery);
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const reset = last.current.key === lab.key && last.current.generation !== lab.resetGeneration;
    last.current = { key: lab.key, generation: lab.resetGeneration };
    const saved = sessionStorage.getItem('workspace-view:' + lab.key);
    setView(
      !reset && tabs.some((tab) => tab.id === saved)
        ? (saved as View)
        : mobile
          ? 'task'
          : 'terminal',
    );
    if (reset) {
      sessionStorage.removeItem('task-focus:' + lab.key);
      sessionStorage.removeItem('selected-file:' + lab.key);
      sessionStorage.removeItem('file-drafts:' + lab.key);
    }
    setTaskId(
      reset ? '' : params.get('task') || sessionStorage.getItem('task-focus:' + lab.key) || '',
    );
    setChecked('');
  }, [lab.key, lab.resetGeneration, params]);
  const progress = useMemo(
    () =>
      requirementProgress(
        definition,
        lab.view,
        identity,
        lab.working,
        lab.busy,
        lab.validationError,
      ),
    [
      definition,
      lab.view,
      lab.working,
      lab.busy,
      lab.validationError,
      identity.full_name,
      identity.department,
    ],
  );
  const required = progress.filter(({ task }) => task.points > 0 && !task.bonus);
  const completed = required.filter((item) => item.passed).length;
  const score = sumPoints(required.map((item) => item.earned));
  const chooseView = (next: View) => {
    setView(next);
    sessionStorage.setItem('workspace-view:' + lab.key, next);
  };
  if (!lab.ready)
    return (
      <p className="page" role="status">
        Restoring your workspace…
      </p>
    );

  return (
    <div className="lab-workspace">
      {(!identity.full_name || !identity.department) && !basePath && (
        <PracticeIdentity onSave={() => void lab.refresh()} />
      )}
      <header className="lab-workspace-heading">
        <div>
          <Link className="lab-back" to="/dashboard">
            My learning
          </Link>
          <h1>{definition.title}</h1>
          <p>
            {basePath
              ? lab.readOnly
                ? 'Read-only attempt'
                : 'Practical workspace'
              : 'Local practice'}
          </p>
        </div>
        <StudentSteps basePath={basePath} />
      </header>
      <div className="lab-workspace-status">
        <span role="status">{lab.saving}</span>
        {lab.validationError ? (
          <span role="alert">Practical points unavailable</span>
        ) : lab.busy ? (
          <span>Checking progress…</span>
        ) : (
          <span aria-label="Task progress">
            {completed}/{required.length} criteria complete ·{' '}
            <strong>
              {score} / {totals(definition).practical}
            </strong>{' '}
            provisional points
          </span>
        )}
      </div>
      <div className="lab-workspace-layout" data-view={activeView}>
        <div className="lab-tool-tabs" ref={tabsRef} role="tablist" aria-label="Workspace views">
          {tabs.map(({ id, label, Icon }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={'lab-tab-' + id}
              aria-selected={activeView === id}
              aria-controls={'lab-panel-' + id}
              tabIndex={activeView === id ? 0 : -1}
              onClick={() => chooseView(id)}
              onKeyDown={(event) => {
                const lastIndex = tabs.length - 1;
                let next: number;
                switch (event.key) {
                  case 'ArrowRight':
                    next = (index + 1) % tabs.length;
                    break;
                  case 'ArrowLeft':
                    next = (index + lastIndex) % tabs.length;
                    break;
                  case 'Home':
                    next = 0;
                    break;
                  case 'End':
                    next = lastIndex;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                chooseView(tabs[next].id);
                tabsRef.current?.querySelectorAll('button')[next]?.focus();
              }}
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <section className="lab-tool-body" aria-label="Git tools">
          <div
            id="lab-panel-terminal"
            role="tabpanel"
            aria-labelledby="lab-tab-terminal"
            hidden={activeView !== 'terminal'}
          >
            <Terminal key={lab.key + ':' + lab.resetGeneration} lab={lab} />
          </div>
          <WorkspaceFiles
            key={lab.key}
            lab={lab}
            dark={dark}
            mobile={mobile}
            view={activeView}
            showEditor={() => {
              chooseView('editor');
              document.getElementById('lab-tab-editor')?.focus();
            }}
            showFiles={() => {
              chooseView('files');
              document.getElementById('lab-tab-files')?.focus();
            }}
          />
        </section>
        <aside
          id="lab-panel-task"
          className="lab-task-panel"
          aria-label="Task instructions"
          aria-labelledby={mobile ? 'lab-tab-task' : undefined}
          role={mobile ? 'tabpanel' : undefined}
          hidden={mobile && activeView !== 'task'}
        >
          <TaskInstructions
            progress={progress}
            taskId={taskId}
            identity={identity}
            initializationHint={[
              lab.engine.fs.entries[lab.engine.dir] ? '' : 'mkdir ' + definition.projectName,
              lab.engine.cwd === lab.engine.dir ? '' : 'cd ' + lab.engine.dir,
              'git init',
            ]
              .filter(Boolean)
              .join('\n')}
            checking={lab.busy}
            error={lab.validationError}
            checked={checked}
            onTask={(id) => {
              setTaskId(id);
              setChecked('');
              sessionStorage.setItem('task-focus:' + lab.key, id);
            }}
            onCheck={async () => {
              setChecked('');
              try {
                await lab.refresh();
                setChecked('Workspace checked. Points shown here are provisional.');
              } catch {
                setChecked('Could not check your workspace. Try again.');
              }
            }}
            recovery={
              onRestart || (!basePath && !lab.readOnly) ? (
                <RestartAttempt
                  practice={!basePath}
                  busy={lab.busy}
                  restart={onRestart || lab.restartPractice}
                  attemptId={lab.attemptId}
                />
              ) : undefined
            }
          />
        </aside>
      </div>
      {lab.error && (
        <p className="lab-workspace-error" role="alert">
          {lab.error}{' '}
          <button className="text-button" onClick={() => lab.setError('')}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
