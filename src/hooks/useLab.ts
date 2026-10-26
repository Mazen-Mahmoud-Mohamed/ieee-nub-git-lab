import { useCallback, useEffect, useRef, useState } from 'react';
import { GitEngine, type RepoView } from '../features/git-engine/engine';
import { VirtualFS } from '../features/filesystem/VirtualFS';
import { loadWorkspace, saveWorkspace, type LocalWorkspace } from '../services/persistence';
const empty: RepoView = {
  initialized: false,
  branch: 'main',
  branches: {},
  commits: [],
  status: [],
  config: {},
};
export function useLab(key: string) {
  const engine = useRef(new GitEngine());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(empty);
  const [revision, setRevision] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [attemptId, setAttemptId] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const [saving, setSaving] = useState('Loading local workspace…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadedKey = useRef('');
  useEffect(() => {
    let live = true;
    setReady(false);
    loadedKey.current = '';
    loadWorkspace(key)
      .then((data) => {
        if (!live) return;
        const next = new GitEngine(data ? VirtualFS.restore(data.snapshot) : undefined);
        if (data) {
          next.cwd = data.cwd;
          next.events = data.events;
          next.globalConfig = data.config;
        }
        engine.current = next;
        setAnswers(data?.answers || {});
        setFlagged(data?.flagged || []);
        setAttemptId(data?.attemptId);
        setReceipt(data?.receipt);
        loadedKey.current = key;
        return next.inspect().then(setView);
      })
      .then(() => {
        if (live) {
          setReady(true);
          setRevision((x) => x + 1);
        }
      })
      .catch((e) => setError('Recovery failed: ' + String(e)));
    return () => {
      live = false;
    };
  }, [key]);
  const snapshot = useCallback(
    (): LocalWorkspace => ({
      version: 1,
      snapshot: engine.current.fs.snapshot(),
      cwd: engine.current.cwd,
      config: engine.current.globalConfig,
      events: engine.current.events,
      answers,
      flagged,
      attemptId,
      receipt,
      updatedAt: new Date().toISOString(),
    }),
    [answers, flagged, attemptId, receipt],
  );
  useEffect(() => {
    if (!ready || loadedKey.current !== key) return;
    setSaving('Saving locally…');
    let active = true;
    void saveWorkspace(key, snapshot())
      .then(() => {
        if (active) setSaving('Saved on this device');
      })
      .catch((e) => {
        if (active) {
          setSaving('Save failed');
          setError(String(e));
        }
      });
    return () => {
      active = false;
    };
  }, [key, ready, revision, snapshot]);
  const refresh = async () => {
    setView(await engine.current.inspect());
    setRevision((x) => x + 1);
  };
  const lock = useRef(false);
  const command = async (input: string) => {
    if (lock.current || receipt) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await engine.current.execute(input);
      await refresh();
      return result;
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const write = async (path: string, text: string) => {
    if (receipt) return;
    try {
      await engine.current.write(path, text);
      setRevision((x) => x + 1);
    } catch (e) {
      setError(String(e));
    }
  };
  const newAttempt = async (id: string) => {
    engine.current = new GitEngine();
    setAnswers({});
    setFlagged([]);
    setReceipt(undefined);
    setAttemptId(id);
    await refresh();
  };
  const restore = async (data: LocalWorkspace) => {
    if (receipt) throw new Error('Finalized workspace is read only');
    if (
      data.version !== 1 ||
      !data.answers ||
      !Array.isArray(data.events) ||
      data.events.length > 1000
    )
      throw new Error('Invalid backup');
    const next = new GitEngine(VirtualFS.restore(data.snapshot));
    next.cwd = data.cwd;
    next.globalConfig = data.config;
    next.events = data.events;
    await next.fs.promises.stat(next.cwd);
    engine.current = next;
    setAnswers(data.answers);
    setFlagged(data.flagged || []);
    await refresh();
  };
  return {
    engine: engine.current,
    ready,
    view,
    revision,
    answers,
    setAnswers,
    flagged,
    setFlagged,
    attemptId,
    setAttemptId,
    receipt,
    setReceipt,
    saving,
    error,
    setError,
    busy,
    command,
    write,
    refresh,
    snapshot,
    newAttempt,
    restore,
    persist: () => saveWorkspace(key, snapshot()),
  };
}
export type Lab = ReturnType<typeof useLab>;
