import { useEffect, useState } from 'react';
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
  CheckCircle2,
} from 'lucide-react';
import { type StudentIdentity } from './assignment';
import { firstAssessment, outcomesFor, totals, type Definition } from '../assessments/model';
import type { Lab } from '../../hooks/useLab';
import { GitGraph } from '../../components/GitGraph';
import { Terminal } from '../terminal/Terminal';
import { PracticeIdentity } from './PracticeIdentity';
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
  const assignment = {
    ...definition,
    sections: definition.sections.map((s, i) => ({
      ...s,
      tag: String(i + 1).padStart(2, '0'),
      points: s.tasks.reduce((n, t) => n + t.points, 0),
    })),
  };
  const [expanded, setExpanded] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [filename, setFilename] = useState('');
  const [localError, setLocalError] = useState('');
  const files = Object.keys(lab.engine.fs.entries).filter(
    (p) => p.endsWith('.txt') && !p.includes('/.git/') && lab.engine.fs.entries[p].kind === 'file',
  );
  useEffect(() => {
    let live = true;
    if (selected && files.includes(selected))
      lab.engine.read(selected).then((t) => {
        if (live) setText(t);
      });
    else if (selected) {
      setSelected('');
      setText('');
    }
    return () => {
      live = false;
    };
  }, [selected, lab.revision]);
  const working = Object.fromEntries(
    files.map((p) => [
      p.slice(lab.engine.dir.length + 1),
      new TextDecoder().decode(new Uint8Array(lab.engine.fs.entries[p].data)),
    ]),
  );
  const outcomes = outcomesFor(definition, lab.view, identity, working);
  const points = totals(definition);
  const required = outcomes.filter((o) => !o.bonus);
  const complete = required.filter((o) => o.passed).length;
  const current = assignment.sections.find((s) => s.id === section) ||
    assignment.sections[0] || {
      id: 'empty',
      title: 'No practical tasks',
      description: 'Continue to the theory questions.',
      steps: [],
      tag: '',
      tasks: [],
    };
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
      <div className="workspace-grid">
        <aside className="explorer">
          <div className="panel-heading">
            <span>EXPLORER</span>
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
                      if (!lab.engine.fs.entries[lab.engine.dir])
                        throw new Error(
                          'Create the assessment project directory with mkdir first.',
                        );
                      const path = lab.engine.dir + '/' + filename;
                      if (lab.engine.fs.entries[path]) throw new Error('File already exists');
                      await lab.engine.write(path, '');
                      await lab.refresh();
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
                      onClick={() => setSelected(p)}
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
              <span className="dim">{selected ? 'Plain text' : 'GETTING STARTED'}</span>
            </div>
            {selected ? (
              <CodeMirror
                onCreateEditor={(view) =>
                  view.contentDOM.setAttribute('aria-label', 'Text file editor')
                }
                aria-label="Text file editor"
                value={text}
                height="100%"
                theme={dark ? oneDark : 'light'}
                readOnly={lab.readOnly}
                basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                onChange={(value) => {
                  setText(value);
                  void lab.write(selected, value);
                }}
              />
            ) : (
              <div className="editor-welcome">
                <div className="welcome-mark">
                  <GitBranch size={34} />
                </div>
                <span className="eyebrow">A LITTLE PRACTICE. A LASTING SKILL.</span>
                <h2>
                  Your next chapter
                  <br />
                  starts with a commit.
                </h2>
                <p>
                  This is your space to learn Git by doing.
                  <br />
                  Create your project in the terminal below, then
                  <br />
                  select a text file to start editing.
                </p>
                <div className="welcome-steps">
                  <span>
                    <b>01</b>Read your mission
                  </span>
                  <span>
                    <b>02</b>Build in the terminal
                  </span>
                  <span>
                    <b>03</b>Watch your history grow
                  </span>
                </div>
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
          <Terminal lab={lab} expanded={expanded} onExpand={() => setExpanded(!expanded)} />
        </div>
        <aside className="instructions">
          <div className="panel-heading">
            <span>
              <BookOpen size={15} /> YOUR MISSION
            </span>
            <span className="dim">01 / 01</span>
          </div>
          <div className="instruction-scroll">
            <div className="assignment-label">
              {definition.type.toUpperCase()} <span>GIT COURSE</span>
            </div>
            <h1>{definition.title}</h1>
            <p className="muted">{definition.description}</p>
            <div className="progress-heading">
              <span>Your progress</span>
              <strong>
                {complete} / {required.length} outcomes
              </strong>
            </div>
            <div className="progress-track">
              <div
                style={{ width: `${required.length ? (complete / required.length) * 100 : 100}%` }}
              />
            </div>
            <span className="progress-caption">
              {points.practical} practical pts · {points.theory} theory pts · +{points.bonus} bonus
            </span>
            <div className="mission-list">
              {assignment.sections.map((s) => {
                const related = outcomes.filter((o) => s.tasks.some((t) => t.id === o.id));
                const passed = related.every((o) => o.passed);
                return (
                  <button
                    key={s.id}
                    className={'mission ' + (s.id === section ? 'active' : '')}
                    onClick={() => setSection(s.id)}
                  >
                    <span className={'mission-number ' + (passed ? 'passed' : '')}>
                      {passed ? <Check size={15} /> : s.tag}
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.points} points {s.tasks.every((t) => t.bonus) ? '· Optional' : ''}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                );
              })}
            </div>
            <div className="section-detail">
              <span className="eyebrow">PART {current.tag}</span>
              <h3>{current.title}</h3>
              <p>{current.description}</p>
              <ol>
                {current.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {current.tasks.some((t) => t.rules.some((r) => r.type === 'legacy')) &&
                section === 'init' && (
                  <div className="file-requirements">
                    <details open>
                      <summary>Required file contents</summary>
                      <h4>about.txt</h4>
                      <pre>{`Name: ${identity.full_name || 'Your full name'}\nUniversity: Nahda University\nDepartment: ${identity.department || 'Your department'}`}</pre>
                      <h4>goals.txt</h4>
                      <pre>
                        {
                          'My Goals:\n\n1. Learn Git\n2. Understand version control\n3. Work on team projects'
                        }
                      </pre>
                      <h4>notes.txt</h4>
                      <pre>{'Git Course - Session 1\nIEEE NUB Student Branch'}</pre>
                    </details>
                  </div>
                )}
            </div>
            <details className="checks">
              <summary>Repository outcome checks</summary>
              {outcomes.map((o) => (
                <p key={o.id} className={o.passed ? 'passed' : ''}>
                  <CheckCircle2 size={14} />
                  {o.label}
                </p>
              ))}
            </details>
            <div className="hint">
              <Info size={17} />
              <p>
                It’s okay to experiment.
                <br />
                <span>Progress checks your repository, not the commands you memorize.</span>
              </p>
            </div>
            <Link
              className={
                'primary theory-button ' +
                (complete < required.length && definition.gateTheory ? 'disabled-link' : '')
              }
              to={
                basePath +
                (complete === required.length || !definition.gateTheory ? '/theory' : '/workspace')
              }
            >
              Continue to theory
              <ArrowUpRight size={16} />
            </Link>
            {complete < required.length && (
              <small className="dim">Complete the practical outcomes to unlock theory.</small>
            )}
          </div>
        </aside>
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
