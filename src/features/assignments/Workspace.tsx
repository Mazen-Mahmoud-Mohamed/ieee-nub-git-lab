import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Files,
  GitBranch,
  Plus,
  PanelLeftClose,
  ArrowUpRight,
  BookOpen,
  FolderOpen,
  Info,
} from 'lucide-react';
import { type StudentIdentity } from './assignment';
import { firstAssessment, type Definition } from '../assessments/model';
import type { Lab } from '../../hooks/useLab';
import { GitGraph } from '../../components/GitGraph';
import { Terminal } from '../terminal/Terminal';
import { PracticeIdentity } from './PracticeIdentity';
import { requirementProgress } from '../assessments/requirements';
import { TaskInstructions } from './TaskInstructions';
export function Workspace({
  lab,
  identity,
  dark,
  definition = firstAssessment,
  basePath = '',
}: {
  lab: Lab;
  identity: StudentIdentity;
  dark: boolean;
  definition?: Definition;
  basePath?: string;
}) {
  const [selected, setSelected] = useState('');
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'files' | 'history'>('files');
  const [section, setSection] = useState(definition.sections[0]?.id || '');
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
  const [terminalHeight, setTerminalHeight] = useState(280),
    [instructionsWidth, setInstructionsWidth] = useState(360);
  const [feedback, setFeedback] = useState('');
  const previous = useRef<{ key: string; done: Set<string> } | undefined>(undefined);
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
  if (!lab.ready) return <div className="page">Restoring your workspace…</div>;
  return (
    <div className={'workspace ' + (expanded ? 'terminal-focused' : '')}>
      {(!identity.full_name || !identity.department) && (
        <PracticeIdentity onSave={() => void lab.refresh()} />
      )}
      <div className="workspace-top">
        <div className="workspace-crumb">
          <Link to="/dashboard">My learning</Link>
          <ChevronRight size={14} />
          <span>{definition.title}</span>
          <span className="badge">IN PROGRESS</span>
        </div>
        <div className="workspace-actions">
          <span className="save-state">
            <i className="live-dot" />
            {lab.saving}
          </span>
          <Link to={basePath + '/review'} className="small-button">
            Review submission
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <div className="mobile-notice">
        <Info size={16} />A desktop keyboard gives you the best terminal experience. Instructions
        and questions work on mobile.
      </div>
      <div
        className="workspace-grid"
        style={
          {
            '--terminal-height': terminalHeight + 'px',
            '--instructions-width': instructionsWidth + 'px',
          } as CSSProperties
        }
      >
        <aside className="explorer">
          <div className="panel-heading">
            <span>Files</span>
            <PanelLeftClose size={15} />
          </div>
          <div className="explorer-tabs">
            <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
              <Files size={14} />
              Files
            </button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              <GitBranch size={14} />
              History
            </button>
          </div>
          {tab === 'files' ? (
            <>
              <div className="folder-heading">
                <span>
                  <ChevronDown size={13} />
                  <FolderOpen size={15} /> {definition.projectName}
                </span>
                <button
                  aria-label="Create text file"
                  disabled={lab.readOnly}
                  onClick={() => setNewFile(!newFile)}
                >
                  <Plus size={15} />
                </button>
              </div>
              {newFile && (
                <form
                  className="new-file"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (lab.readOnly) return;
                    try {
                      const expectedKey = lab.key;
                      const path = lab.engine.dir + '/' + filename;
                      await lab.createTextFile(filename);
                      if (currentKey.current !== expectedKey) return;
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
                    <Check size={14} />
                  </button>
                </form>
              )}
              {files.length ? (
                files.map((p) => {
                  const status = lab.view.status.find(([f]) => p.endsWith('/' + f));
                  return (
                    <button
                      className={'file-row ' + (selected === p ? 'selected' : '')}
                      key={p}
                      onClick={() => {
                        draft.current = null;
                        setText(lab.working[p.slice(lab.engine.dir.length + 1)] || '');
                        focusEditor.current = selected !== p;
                        setSelected(p);
                      }}
                    >
                      <FileText size={15} />
                      <span>{p.replace(lab.engine.dir + '/', '')}</span>
                      <small className="file-status">
                        {!status ? '' : status[1] === 0 ? 'U' : status[1] !== status[2] ? 'M' : ''}
                      </small>
                    </button>
                  );
                })
              ) : (
                <div className="explorer-empty">
                  No files yet.
                  <br />
                  Create your project in the terminal, then add a text file.
                </div>
              )}
              {lab.view.initialized && (
                <div className="git-hidden">
                  <FolderOpen size={14} />
                  .git <span>Git internals</span>
                </div>
              )}
              <div className="explorer-note">
                <Info size={14} />
                <p>Your editor and terminal share the same files. Changes save automatically.</p>
              </div>
              <div className="panel-heading">
                <span>REPOSITORY HISTORY</span>
                <GitBranch size={14} />
              </div>
              <GitGraph view={lab.view} />
            </>
          ) : (
            <GitGraph view={lab.view} />
          )}
        </aside>
        <div className="editor-column">
          <div className="editor-panel">
            <div className="editor-tabs">
              <span>
                <FileText size={14} />
                {selected ? selected.split('/').pop() : 'Welcome to your workspace'}
                {selected && <i className="live-dot" />}
              </span>
              <span className="dim">Text Editor</span>
            </div>
            {selected ? (
              <CodeMirror
                key={selected}
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
              <div className="editor-welcome">
                <div className="welcome-mark">
                  <GitBranch size={34} />
                </div>
                <h2>Select a file from the left panel to start editing.</h2>
                <p>
                  The built-in Text Editor replaces Notepad, nano and Vim. Create a text file in
                  your project, then select it from Files. Your changes save automatically on this
                  device.
                </p>
                <button className="outline-button" onClick={() => void lab.command('help')}>
                  <BookOpen size={15} />
                  Explore terminal commands
                </button>
              </div>
            )}
            <div className="editor-footer">
              <span>UTF-8</span>
              <span>Plain Text</span>
              <span>{selected ? text.split('\n').length + ' lines' : 'Ready when you are'}</span>
            </div>
          </div>
          <details className="workspace-layout-controls">
            <summary>Resize panels</summary>
            <label>
              Terminal height
              <input
                aria-label="Terminal height"
                type="range"
                min="180"
                max="520"
                step="20"
                value={terminalHeight}
                onChange={(e) => setTerminalHeight(Number(e.target.value))}
              />
            </label>
            <label>
              Instructions width
              <input
                aria-label="Instructions width"
                type="range"
                min="300"
                max="480"
                step="20"
                value={instructionsWidth}
                onChange={(e) => setInstructionsWidth(Number(e.target.value))}
              />
            </label>
          </details>
          <Terminal
            lab={lab}
            feedback={previous.current?.key === lab.key ? feedback : ''}
            expanded={expanded}
            onExpand={() => setExpanded(!expanded)}
          />
        </div>
        <TaskInstructions
          definition={definition}
          progress={progress}
          section={section}
          onSection={setSection}
          identity={identity}
          checking={lab.busy}
          error={lab.validationError}
          basePath={basePath}
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
      <footer className="workspace-status">
        <span>
          <GitBranch size={12} />
          {lab.view.branch}
          <span>UTF-8</span>
        </span>
        <span>
          Virtual workspace · Local Git only
          <span>
            <i className="live-dot" /> {lab.receipt ? 'Submitted · read only' : 'All systems ready'}
          </span>
        </span>
      </footer>
    </div>
  );
}
