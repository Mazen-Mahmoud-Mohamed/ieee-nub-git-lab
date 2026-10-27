import { useSearchParams } from 'react-router-dom';
import { RestartAttempt } from '../assessments/RestartAttempt';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { Plus, Check } from 'lucide-react';
import type { StudentIdentity } from './assignment';
import { firstAssessment, type Definition } from '../assessments/model';
import type { Lab } from '../../hooks/useLab';
import { GitGraph } from '../../components/GitGraph';
import { Terminal } from '../terminal/Terminal';
import { PracticeIdentity } from './PracticeIdentity';
import { requirementProgress } from '../assessments/requirements';
import { TaskInstructions } from './TaskInstructions';
import { StudentSteps } from '../assessments/StudentSteps';
export function Workspace({
  lab,
  identity,
  dark,
  definition = firstAssessment,
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
  const [routeParams] = useSearchParams();
  const [selected, setSelected] = useState('');
  const [text, setText] = useState('');
  const [history, setHistory] = useState(false);
  const [mobile, setMobile] = useState('workspace');
  const [taskId, setTaskId] = useState(definition.sections[0]?.tasks[0]?.id || '');
  const [expanded, setExpanded] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [filename, setFilename] = useState('');
  const [localError, setLocalError] = useState('');
  const files = Object.keys(lab.working).map((p) => lab.engine.dir + '/' + p);
  const draft = useRef<{ path: string; version: number } | null>(null);
  const editVersion = useRef(0);
  const focusEditor = useRef(false);
  const currentKey = useRef(lab.key);
  currentKey.current = lab.key;
  const [terminalHeight, setTerminalHeight] = useState(260);
  const [feedback, setFeedback] = useState('');
  const previous = useRef<{ key: string; done: Set<string> } | undefined>(undefined);
  const lastReset = useRef({ key: lab.key, generation: lab.resetGeneration });
  useEffect(() => {
    draft.current = null;
    setSelected('');
    setText('');
    const focusKey = 'task-focus:' + lab.key;
    const reset =
      lastReset.current.key === lab.key && lastReset.current.generation !== lab.resetGeneration;
    lastReset.current = { key: lab.key, generation: lab.resetGeneration };
    if (reset) sessionStorage.removeItem(focusKey);
    const wanted = reset ? null : routeParams.get('task') || sessionStorage.getItem(focusKey);
    setTaskId(
      definition.sections.flatMap((s) => s.tasks).some((t) => t.id === wanted)
        ? wanted!
        : definition.sections[0]?.tasks[0]?.id || '',
    );
    previous.current = undefined;
    setFeedback('');
  }, [lab.key, lab.resetGeneration]);
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
  useEffect(() => {
    if (!lab.ready || lab.busy) return;
    const done = new Set(
      progress
        .flatMap((p) => p.requirements)
        .filter((c) => c.passed === true)
        .map((c) => c.id),
    );
    if (!previous.current || previous.current.key !== lab.key) {
      previous.current = { key: lab.key, done };
      setFeedback('');
      return;
    }
    const changed = progress
      .flatMap((p) => p.requirements)
      .filter((c) => c.passed === true && !previous.current!.done.has(c.id));
    setFeedback(
      changed.length
        ? 'Requirement completed: ' +
            changed
              .slice(0, 2)
              .map((c) => c.label)
              .join('; ') +
            (changed.length > 2 ? ' · ' + (changed.length - 2) + ' more' : '')
        : '',
    );
    previous.current = { key: lab.key, done };
  }, [lab.key, lab.ready, lab.busy, lab.revision, progress]);
  useEffect(() => {
    if (!selected) return;
    if (!files.includes(selected)) {
      setSelected('');
      setText('');
      draft.current = null;
      return;
    }
    if (draft.current?.path === selected) return;
    setText(lab.working[selected.slice(lab.engine.dir.length + 1)] || '');
  }, [selected, lab.revision, lab.key]);
  const previousFiles = useRef<{ key: string; files: Set<string> } | undefined>(undefined);
  useEffect(() => {
    const before = previousFiles.current;
    const now = new Set(files);
    if (before?.key === lab.key && !selected) {
      const created = files.find((p) => !before.files.has(p));
      if (created) {
        setText(lab.working[created.slice(lab.engine.dir.length + 1)] || '');
        setSelected(created);
      }
    }
    previousFiles.current = { key: lab.key, files: now };
  }, [lab.key, lab.revision]);
  if (!lab.ready)
    return (
      <p className="page" role="status">
        Restoring your workspace…
      </p>
    );
  const open = (path: string) => {
    draft.current = null;
    setText(lab.working[path.slice(lab.engine.dir.length + 1)] || '');
    focusEditor.current = selected !== path;
    setSelected(path);
  };
  return (
    <div
      className={'workspace student-workspace ' + (expanded ? 'terminal-focused' : '')}
      data-mobile={mobile}
      style={{ '--terminal-height': terminalHeight + 'px' } as CSSProperties}
    >
      {(!identity.full_name || !identity.department) && (
        <PracticeIdentity onSave={() => void lab.refresh()} />
      )}
      <header className="student-workspace-header">
        <h1>{definition.title}</h1>
        <StudentSteps basePath={basePath} />
        <span className="save-state" role="status">
          {lab.saving}
        </span>
      </header>
      <div className="workspace-view-tabs" role="tablist" aria-label="Workspace views">
        <button
          role="tab"
          aria-selected={mobile === 'workspace'}
          onClick={() => setMobile('workspace')}
        >
          Workspace
        </button>
        <button role="tab" aria-selected={mobile === 'tasks'} onClick={() => setMobile('tasks')}>
          Tasks
        </button>
      </div>
      <div className="student-workspace-grid">
        <section className="student-workarea" aria-label="Work area">
          <div className="compact-files">
            <strong>Files</strong>
            <div className="compact-file-list">
              {files.map((path) => {
                const name = path.slice(lab.engine.dir.length + 1),
                  row = lab.view.status.find(([file]) => file === name),
                  code = !row
                    ? ''
                    : row[1] === 0 && row[3] === 0
                      ? 'U'
                      : row[1] === row[2] && row[1] === row[3]
                        ? ''
                        : row[1] === 0
                          ? 'A'
                          : 'M';
                return (
                  <button
                    key={path}
                    className={selected === path ? 'selected' : ''}
                    onClick={() => open(path)}
                  >
                    {name}
                    {code && (
                      <small
                        title={
                          row && row[3] !== row[1] && row[3] === row[2]
                            ? 'Staged change'
                            : code === 'U'
                              ? 'Untracked file'
                              : 'Modified file'
                        }
                      >
                        {' '}
                        {code}
                      </small>
                    )}
                  </button>
                );
              })}
              {!files.length && <span>No text files yet.</span>}
            </div>
            <button
              className="text-button"
              aria-label="Create text file"
              disabled={lab.readOnly}
              onClick={() => setNewFile(!newFile)}
            >
              <Plus size={16} />
            </button>
            <button
              className="text-button"
              aria-expanded={history}
              onClick={() => setHistory(!history)}
            >
              View Git History
            </button>
          </div>
          {newFile && (
            <form
              className="new-file"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const key = lab.key,
                    path = lab.engine.dir + '/' + filename;
                  await lab.createTextFile(filename);
                  if (currentKey.current !== key) return;
                  setText('');
                  focusEditor.current = true;
                  setSelected(path);
                  setNewFile(false);
                  setFilename('');
                  setLocalError('');
                } catch (e) {
                  setLocalError(String(e));
                }
              }}
            >
              <input
                aria-label="New file name"
                placeholder="filename.txt"
                required
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
              />
              <button aria-label="Confirm new file">
                <Check size={15} />
              </button>
            </form>
          )}
          {history && (
            <div className="optional-history">
              <button className="text-button" onClick={() => setHistory(false)}>
                Close history
              </button>
              <GitGraph view={lab.view} />
            </div>
          )}
          <div className="student-editor">
            <div className="student-editor-label">
              {selected ? selected.split('/').pop() : 'Text editor'}
              <small>Edit file text here · saves automatically</small>
            </div>
            {selected ? (
              <CodeMirror
                key={lab.key + ':' + selected}
                onCreateEditor={(view) => {
                  view.contentDOM.setAttribute('aria-label', 'Text file editor');
                  if (focusEditor.current) {
                    view.focus();
                    focusEditor.current = false;
                  }
                }}
                aria-label="Text file editor"
                value={text}
                height="100%"
                theme={dark ? oneDark : 'light'}
                readOnly={lab.readOnly}
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                onChange={(value) => {
                  setText(value);
                  const version = ++editVersion.current;
                  draft.current = { path: selected, version };
                  void lab
                    .write(selected, value)
                    .catch(() => {})
                    .finally(() => {
                      if (draft.current?.version === version) draft.current = null;
                    });
                }}
              />
            ) : (
              <p className="editor-empty">
                Choose a file above to edit its text. Use the terminal below for Git commands.
              </p>
            )}
          </div>
          <label className="terminal-resize">
            Terminal size
            <input
              aria-label="Terminal height"
              type="range"
              min="180"
              max="480"
              step="20"
              value={terminalHeight}
              onChange={(e) => setTerminalHeight(Number(e.target.value))}
            />
          </label>
          <Terminal
            key={`${lab.key}:${lab.resetGeneration}`}
            lab={lab}
            definition={definition}
            feedback={previous.current?.key === lab.key ? feedback : ''}
            expanded={expanded}
            onExpand={() => setExpanded(!expanded)}
          />
        </section>
        <TaskInstructions
          definition={definition}
          progress={progress}
          taskId={taskId}
          onTask={(id) => {
            setTaskId(id);
            sessionStorage.setItem('task-focus:' + lab.key, id);
          }}
          identity={identity}
          checking={lab.busy}
          error={lab.validationError}
          basePath={basePath}
          view={lab.view}
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
      </div>
      {(lab.error || localError) && (
        <div className="floating-error" role="alert">
          {lab.error || localError}
          <button
            onClick={() => {
              lab.setError('');
              setLocalError('');
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
