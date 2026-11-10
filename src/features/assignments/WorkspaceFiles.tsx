import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { FilePlus2, FileText, GitCommitHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Lab } from '../../hooks/useLab';
import { GitGraph } from '../../components/GitGraph';

const DesktopTextEditor = lazy(() => import('./DesktopTextEditor'));

export function WorkspaceFiles({
  lab,
  dark,
  mobile,
  view,
  showEditor,
  showFiles,
}: {
  lab: Lab;
  dark: boolean;
  mobile: boolean;
  view: string;
  showEditor: () => void;
  showFiles: () => void;
}) {
  const selectedKey = 'selected-file:' + lab.key;
  const draftKey = 'file-drafts:' + lab.key;
  const prefix = lab.engine.dir + '/';
  const [selected, setSelected] = useState(
    () => sessionStorage.getItem(selectedKey)?.slice(prefix.length) || '',
  );
  const [form, setForm] = useState<{ mode: 'create' | 'rename'; name: string }>();
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || '{}');
    } catch {
      return {};
    }
  });
  const [fileState, setFileState] = useState('');
  const editVersion = useRef(0);
  const generation = useRef(lab.resetGeneration);
  const files = Object.keys(lab.working).sort();
  const file = Object.hasOwn(lab.working, selected) ? selected : '';
  const text = file ? (drafts[prefix + file] ?? lab.working[file]) : '';
  const locked = lab.readOnly || lab.busy;

  function keepDrafts(next: Record<string, string>) {
    setDrafts(next);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      setError('File draft recovery is unavailable. Check the save status before leaving.');
    }
  }
  useEffect(() => {
    if (generation.current === lab.resetGeneration) return;
    generation.current = lab.resetGeneration;
    editVersion.current++;
    setSelected('');
    setForm(undefined);
    setError('');
    setFileState('');
    keepDrafts({});
  }, [lab.resetGeneration]);
  useEffect(() => {
    if (lab.saving !== 'Saved on this device' || lab.busy || !Object.keys(drafts).length) return;
    const pending = Object.fromEntries(
      Object.entries(drafts).filter(
        ([path, value]) => lab.working[path.slice(prefix.length)] !== value,
      ),
    );
    if (Object.keys(pending).length !== Object.keys(drafts).length) keepDrafts(pending);
  }, [drafts, lab.saving, lab.busy, lab.revision]);
  const open = (name: string) => {
    setSelected(name);
    setFileState('');
    sessionStorage.setItem(selectedKey, prefix + name);
    showEditor();
  };
  const save = (value: string) => {
    if (!file || lab.readOnly) return;
    const version = ++editVersion.current;
    setError('');
    keepDrafts({ ...drafts, [prefix + file]: value });
    setFileState('Saving file…');
    void lab.write(prefix + file, value).then(
      () => {
        if (version === editVersion.current) setFileState('');
      },
      (e) => {
        if (version !== editVersion.current) return;
        setError(String(e));
        setFileState('Save failed · draft retained');
      },
    );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || locked) return;
    const next = filename.trim();
    setError('');
    try {
      if (form.mode === 'create') {
        await lab.createTextFile(next);
        open(next);
      } else {
        await lab.renameTextFile(form.name, next);
        if (form.name !== next && prefix + form.name in drafts) {
          const pending = { ...drafts, [prefix + next]: drafts[prefix + form.name] };
          delete pending[prefix + form.name];
          keepDrafts(pending);
        }
        if (selected === form.name) {
          setSelected(next);
          sessionStorage.setItem(selectedKey, prefix + next);
        }
      }
      setForm(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (name: string) => {
    if (
      !window.confirm(
        'Delete ' + name + ' from the working files? Existing commits keep their saved copies.',
      )
    )
      return;
    try {
      await lab.deleteTextFile(name);
      const pending = { ...drafts };
      delete pending[prefix + name];
      keepDrafts(pending);
      if (selected === name) {
        setSelected('');
        sessionStorage.removeItem(selectedKey);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <div
        id="lab-panel-files"
        role="tabpanel"
        aria-labelledby="lab-tab-files"
        hidden={view !== 'files'}
        className="lab-file-tool"
      >
        <header className="lab-tool-header">
          <div>
            <h2>Project files</h2>
            <p>Open a text file to edit it. Use Git to commit changes.</p>
          </div>
          <button
            className="outline-button"
            aria-label="Create text file"
            disabled={locked}
            onClick={() => {
              setFilename('');
              setError('');
              setForm({ mode: 'create', name: '' });
            }}
          >
            <FilePlus2 size={16} aria-hidden="true" /> New file
          </button>
        </header>
        {form && (
          <form className="lab-file-form" onSubmit={submit}>
            <label>
              {form.mode === 'create' ? 'New file name' : 'Rename ' + form.name}
              <input
                aria-label={form.mode === 'create' ? 'New file name' : 'New filename'}
                placeholder="notes.txt"
                required
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={locked}
              aria-label={form.mode === 'create' ? 'Confirm new file' : 'Confirm rename'}
            >
              {form.mode === 'create' ? 'Create' : 'Rename'}
            </button>
            <button className="text-button" type="button" onClick={() => setForm(undefined)}>
              Cancel
            </button>
          </form>
        )}
        {files.length ? (
          <ul className="lab-file-list">
            {files.map((name) => {
              const row = lab.view.status.find(([path]) => path === name);
              const status = !row
                ? ''
                : row[1] === 0 && row[3] === 0
                  ? 'Untracked'
                  : row[1] !== row[3] && row[2] === row[3]
                    ? 'Staged'
                    : row[1] !== row[2] || row[1] !== row[3]
                      ? 'Changed'
                      : '';
              return (
                <li key={name}>
                  <button className="lab-file-open" onClick={() => open(name)}>
                    <FileText size={17} aria-hidden="true" />
                    <span>{name}</span>
                  </button>
                  {status && <span className="lab-file-status">{status}</span>}
                  <button
                    className="lab-icon-button"
                    disabled={locked}
                    aria-label={'Rename ' + name}
                    onClick={() => {
                      setFilename(name);
                      setError('');
                      setForm({ mode: 'rename', name });
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="lab-icon-button"
                    disabled={locked}
                    aria-label={'Delete ' + name}
                    onClick={() => void remove(name)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="lab-tool-empty">No text files yet. Create one here or use the Terminal.</p>
        )}
        <details className="lab-history">
          <summary>
            <GitCommitHorizontal size={17} aria-hidden="true" /> Git history
          </summary>
          <GitGraph view={lab.view} />
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div
        id="lab-panel-editor"
        role="tabpanel"
        aria-labelledby="lab-tab-editor"
        hidden={view !== 'editor'}
        className="lab-editor-tool"
      >
        <header className="lab-tool-header">
          <div>
            <h2>{file || 'Code Editor'}</h2>
            <p role="status">
              {file
                ? fileState ||
                  (lab.saving === 'Saved on this device' ? 'File saved locally' : lab.saving)
                : 'Select a project file to begin.'}
            </p>
          </div>
          {files.length > 0 && (
            <label className="lab-editor-picker">
              File
              <select
                aria-label="Editor file"
                value={file}
                onChange={(event) => open(event.target.value)}
              >
                {!file && (
                  <option value="" disabled>
                    Choose a file
                  </option>
                )}
                {files.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </header>
        {view === 'editor' &&
          (file ? (
            mobile ? (
              <textarea
                aria-label="Text file editor"
                className="lab-native-editor"
                dir="ltr"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                value={text}
                readOnly={lab.readOnly}
                onChange={(event) => save(event.target.value)}
              />
            ) : (
              <Suspense fallback={<p role="status">Loading editor…</p>}>
                <DesktopTextEditor
                  key={file}
                  value={text}
                  dark={dark}
                  readOnly={lab.readOnly}
                  onChange={save}
                />
              </Suspense>
            )
          ) : (
            <div className="lab-tool-empty">
              <p>Pick a file to edit its contents.</p>
              <button className="outline-button" onClick={showFiles}>
                Browse files
              </button>
            </div>
          ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {file && fileState.startsWith('Save failed') && (
          <button className="outline-button" disabled={locked} onClick={() => save(text)}>
            Retry file save
          </button>
        )}
      </div>
    </>
  );
}
