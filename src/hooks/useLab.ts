import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { GitEngine, type RepoView } from '../features/git-engine/engine';
import { VirtualFS } from '../features/filesystem/VirtualFS';
import { loadWorkspace, saveWorkspace, type LocalWorkspace } from '../services/persistence';
import { firstAssessment, validFile, type Definition } from '../features/assessments/model';
import { createStarter } from '../features/assessments/starter';
import { SerialQueue } from '../services/SerialQueue';
const empty: RepoView = {
  initialized: false,
  branch: 'main',
  branches: {},
  commits: [],
  status: [],
  config: {},
};
type Meta = Pick<
  LocalWorkspace,
  'answers' | 'flagged' | 'attemptId' | 'receipt' | 'serverRevision'
>;
type Resource = {
  key: string;
  epoch: number;
  engine: GitEngine;
  queue: SerialQueue;
  saves: SerialQueue;
  meta: Meta;
  stable: LocalWorkspace;
  pending: number;
  locked: boolean;
};
export function useLab(
  key: string,
  definition: Definition = firstAssessment,
  enabled = true,
  migration?: { userId: string; attemptId: string },
) {
  const [resetGeneration, setResetGeneration] = useState(0);
  const fallback = useRef(new GitEngine());
  const resource = useRef<Resource | null>(null);
  const epoch = useRef(0);
  const [ready, setReady] = useState(false),
    [view, setView] = useState(empty),
    [working, setWorking] = useState<Record<string, string>>({}),
    [revision, setRevision] = useState(0);
  const [answers, setAnswersState] = useState<Record<string, string>>({}),
    [flagged, setFlaggedState] = useState<string[]>([]),
    [attemptId, setAttemptIdState] = useState<string>(),
    [receipt, setReceiptState] = useState<string>();
  const [locked, setLockedState] = useState(false),
    [serverRevision, setServerRevisionState] = useState(0),
    [saving, setSaving] = useState('Loading local workspace…'),
    [error, setError] = useState(''),
    [validationError, setValidationError] = useState(''),
    [busy, setBusy] = useState(false);
  const active = (r: Resource) =>
    resource.current === r && r.epoch === epoch.current && r.key === key;
  const context = () => {
    const r = resource.current;
    if (!r || !active(r)) throw Error('Workspace changed or is still loading.');
    return r;
  };
  const saved = (r: Resource): LocalWorkspace => ({
    ...r.stable,
    answers: { ...r.meta.answers },
    flagged: [...r.meta.flagged],
    attemptId: r.meta.attemptId,
    receipt: r.meta.receipt,
    serverRevision: r.meta.serverRevision,
    updatedAt: new Date().toISOString(),
  });
  const persistResource = (r: Resource) => {
    const value = saved(r);
    return r.saves.run(async () => {
      await saveWorkspace(r.key, value);
      if (active(r)) setSaving('Saved on this device');
    });
  };
  const publish = async (r: Resource) => {
    const next = await r.engine.inspect();
    r.stable = {
      ...r.stable,
      snapshot: r.engine.fs.snapshot(),
      cwd: r.engine.cwd,
      config: { ...r.engine.globalConfig },
      events: r.engine.events.map((e) => ({ ...e })),
    };
    if (!active(r)) {
      await persistResource(r);
      return;
    }
    const prefix = r.engine.dir + '/';
    const files = Object.fromEntries(
      Object.entries(r.stable.snapshot.entries)
        .filter(
          ([p, e]) =>
            p.startsWith(prefix) &&
            !p.includes('/.git/') &&
            p.endsWith('.txt') &&
            e.kind === 'file',
        )
        .map(([p, e]) => [
          p.slice(prefix.length),
          new TextDecoder().decode(new Uint8Array(e.data)),
        ]),
    );
    setView(next);
    setWorking(files);
    setValidationError('');
    setRevision((x) => x + 1);
    setSaving('Saving locally…');
    try {
      await persistResource(r);
    } catch (e) {
      if (active(r)) {
        setSaving('Save failed');
        setError('Local save failed: ' + String(e));
      }
    }
  };
  useEffect(() => {
    const token = ++epoch.current;
    resource.current = null;
    setReady(false);
    setBusy(false);
    setValidationError('');
    setError('');
    if (!enabled) return;
    let live = true;
    void (async () => {
      let data = await loadWorkspace(key);
      if (!data && migration) {
        const old = await loadWorkspace(migration.userId);
        if (old?.attemptId === migration.attemptId) data = old;
      }
      const next = data
        ? new GitEngine(VirtualFS.restore(data.snapshot), '/' + definition.projectName)
        : await createStarter(definition);
      if (data) {
        next.cwd = data.cwd;
        next.events = data.events;
        next.globalConfig = data.config;
      }
      if (!live || epoch.current !== token) return;
      const meta: Meta = {
        answers: data?.answers || {},
        flagged: data?.flagged || [],
        attemptId: data?.attemptId,
        receipt: data?.receipt,
        serverRevision: data?.serverRevision || 0,
      };
      const r: Resource = {
        key,
        epoch: token,
        engine: next,
        queue: new SerialQueue(),
        saves: new SerialQueue(),
        meta,
        pending: 0,
        locked: false,
        stable: {
          version: 1,
          snapshot: next.fs.snapshot(),
          cwd: next.cwd,
          config: { ...next.globalConfig },
          events: next.events.map((e) => ({ ...e })),
          ...meta,
          updatedAt: new Date().toISOString(),
        },
      };
      resource.current = r;
      setAnswersState(meta.answers);
      setFlaggedState(meta.flagged);
      setAttemptIdState(meta.attemptId);
      setReceiptState(meta.receipt);
      setServerRevisionState(meta.serverRevision || 0);
      setLockedState(false);
      await publish(r);
      if (active(r) && live) setReady(true);
    })().catch((e) => {
      if (live && epoch.current === token) {
        setError('Recovery failed: ' + String(e));
        setValidationError('The saved workspace could not be verified.');
      }
    });
    return () => {
      live = false;
      if (epoch.current === token) {
        epoch.current++;
        resource.current = null;
      }
    };
  }, [key, enabled]);
  useEffect(() => {
    const r = resource.current;
    if (!ready || !r || !active(r)) return;
    setSaving('Saving locally…');
    void persistResource(r).catch((e) => {
      if (active(r)) {
        setSaving('Save failed');
        setError(String(e));
      }
    });
  }, [key, ready, answers, flagged, attemptId, receipt, serverRevision]);
  async function operate<T>(
    operation: (r: Resource) => Promise<T>,
    allowReadOnly = false,
  ): Promise<T | undefined> {
    const r = context();
    if (!allowReadOnly && (r.locked || r.meta.receipt)) return;
    r.pending++;
    if (active(r)) setBusy(true);
    return r.queue
      .run(async () => {
        if (!active(r) || (!allowReadOnly && (r.locked || r.meta.receipt))) return;
        try {
          const result = await operation(r);
          await publish(r);
          return result;
        } catch (e) {
          if (active(r)) {
            setError(e instanceof Error ? e.message : String(e));
            setValidationError(
              'Unable to verify the latest workspace change. Check the error and try again.',
            );
          }
          throw e;
        }
      })
      .finally(() => {
        r.pending--;
        if (active(r) && r.pending === 0) setBusy(false);
      });
  }
  const command = async (input: string) => {
    try {
      return await operate((r) => r.engine.execute(input));
    } catch {
      return undefined;
    }
  };
  const write = async (path: string, text: string) => {
    await operate((r) => r.engine.write(path, text));
  };
  const createTextFile = async (name: string) => {
    if (!validFile(name))
      throw Error('Use a text filename inside this project, such as about.txt.');
    await operate(async (r) => {
      if (!r.engine.fs.entries[r.engine.dir])
        throw Error('Create the assessment project folder first.');
      const p = r.engine.dir + '/' + name;
      if (r.engine.fs.entries[p]) throw Error('This file already exists. Select it from Files.');
      await r.engine.write(p, '');
    });
  };
  const refresh = async () => {
    await operate(async () => {}, true);
  };
  const capture = async () => {
    const r = context();
    return r.queue.run(async () => {
      if (!active(r)) throw Error('Workspace changed during save.');
      return saved(r);
    });
  };
  const persist = async () => {
    const r = context();
    const value = await capture();
    await r.saves.run(() => saveWorkspace(r.key, value));
  };
  const restore = async (data: LocalWorkspace, serverFinal = false) => {
    const r = context();
    if (r.meta.receipt && !serverFinal) throw Error('Finalized workspace is read only');
    if (
      data.version !== 1 ||
      !data.answers ||
      !Array.isArray(data.events) ||
      data.events.length > 1000
    )
      throw Error('Invalid backup');
    if (serverFinal) {
      r.locked = true;
      setLockedState(true);
    }
    await operate(async (current) => {
      const next = new GitEngine(VirtualFS.restore(data.snapshot), '/' + definition.projectName);
      next.cwd = data.cwd;
      next.globalConfig = data.config;
      next.events = data.events;
      await next.fs.promises.stat(next.cwd);
      current.engine = next;
      current.meta.answers = { ...data.answers };
      current.meta.flagged = [...(data.flagged || [])];
      if (active(current)) {
        setAnswersState(current.meta.answers);
        setFlaggedState(current.meta.flagged);
      }
    }, true);
  };
  const newAttempt = async (id: string) => {
    await operate(async (r) => {
      r.engine = await createStarter(definition);
      r.meta = { answers: {}, flagged: [], attemptId: id, receipt: undefined, serverRevision: 0 };
      if (!active(r)) return;
      setAnswersState({});
      setFlaggedState([]);
      setReceiptState(undefined);
      setAttemptIdState(id);
      setServerRevisionState(0);
    });
  };
  const restartPractice = async () => {
    const r = context();
    if (r.meta.attemptId || r.meta.receipt || r.locked || migration)
      throw Error('Assessed attempts must restart through the server policy.');
    await operate(async (current) => {
      // Preserve the previous practice evidence before resetting its active key.
      await current.saves.run(() =>
        saveWorkspace(current.key + ':restart-backup:' + crypto.randomUUID(), saved(current)),
      );
      current.engine = await createStarter(definition);
      current.meta = { answers: {}, flagged: [], serverRevision: 0 };
      setAnswersState({});
      setFlaggedState([]);
      setAttemptIdState(undefined);
      setReceiptState(undefined);
      setServerRevisionState(0);
      setError('');
      setValidationError('');
      setResetGeneration((x) => x + 1);
    });
  };
  const setAnswers = (value: SetStateAction<Record<string, string>>) => {
    const r = resource.current;
    if (!r || !active(r) || r.locked || r.meta.receipt) return;
    const next = typeof value === 'function' ? value(r.meta.answers) : value;
    r.meta.answers = next;
    setAnswersState(next);
  };
  const setFlagged = (value: SetStateAction<string[]>) => {
    const r = resource.current;
    if (!r || !active(r) || r.locked || r.meta.receipt) return;
    const next = typeof value === 'function' ? value(r.meta.flagged) : value;
    r.meta.flagged = next;
    setFlaggedState(next);
  };
  const setAttemptId = (value: string | undefined) => {
    const r = resource.current;
    if (r && active(r)) {
      r.meta.attemptId = value;
      setAttemptIdState(value);
    }
  };
  const setReceipt = (value: string | undefined) => {
    const r = resource.current;
    if (r && active(r)) {
      r.meta.receipt = value;
      setReceiptState(value);
    }
  };
  const setServerRevision = (value: number) => {
    const r = resource.current;
    if (r && active(r)) {
      r.meta.serverRevision = value;
      setServerRevisionState(value);
    }
  };
  const setLocked = (value: boolean) => {
    const r = resource.current;
    if (r && active(r)) {
      r.locked = value;
      setLockedState(value);
    }
  };
  return {
    key,
    engine: resource.current?.engine || fallback.current,
    ready: ready && enabled && resource.current?.key === key,
    view,
    working,
    revision,
    answers,
    setAnswers,
    flagged,
    setFlagged,
    attemptId,
    setAttemptId,
    receipt,
    setReceipt,
    locked,
    setLocked,
    readOnly: locked || !!receipt,
    serverRevision,
    setServerRevision,
    saving,
    error,
    setError,
    validationError,
    busy,
    command,
    write,
    createTextFile,
    refresh,
    snapshot: () => saved(context()),
    capture,
    newAttempt,
    restartPractice,
    resetGeneration,
    restore,
    persist,
  };
}
export type Lab = ReturnType<typeof useLab>;
