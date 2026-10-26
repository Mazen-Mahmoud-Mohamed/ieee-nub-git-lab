import { useEffect, useRef, useState } from 'react';
import type { Lab } from './useLab';
import { requireBackend, withRetry } from '../services/supabase';
import { ServerClock } from '../features/assessments/clock';
import type { AttemptState } from '../features/assessments/model';
import { clearOutbox, loadOutbox, saveOutbox } from '../services/persistence';
export function autosaveConsentKey(attempt: string) {
  return `autosave-consent:${import.meta.env.VITE_SUPABASE_URL || 'unconfigured'}:${attempt}`;
}
export function useAssessmentSession(lab: Lab, state: AttemptState | null) {
  const [remaining, setRemaining] = useState(Infinity);
  const [sync, setSync] = useState('Local practice');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // Default off. Only the disclosed, user-clicked control below can authorize uploads to this project/attempt.
  const [consent, setConsent] = useState(false);
  const enableAutosave = () => {
    if (!state) return;
    sessionStorage.setItem(autosaveConsentKey(state.id), 'enabled');
    setConsent(true);
  };
  const latest = useRef(lab);
  latest.current = lab;
  const activeAttempt = useRef(state?.id);
  activeAttempt.current = state?.id;
  const revision = useRef(0);
  const clock = useRef<ServerClock | null>(null);
  const saving = useRef<Promise<string | undefined> | null>(null);
  const last = useRef('');
  const stopping = useRef(false);
  useEffect(() => {
    let live = true;
    setInitialized(false);
    setConflict(false);
    setError('');
    setRemaining(Infinity);
    last.current = '';
    stopping.current = false;
    setConsent(!!state && sessionStorage.getItem(autosaveConsentKey(state.id)) === 'enabled');
    if (!state || !lab.ready) return;
    void (async () => {
      const current = latest.current;
      revision.current = state.checkpoint_revision;
      clock.current = new ServerClock(state.server_now, state.deadline_at, performance.now());
      if (!live || activeAttempt.current !== state.id) return;
      if (
        state.payload &&
        (state.status !== 'in_progress' || current.serverRevision !== state.checkpoint_revision)
      )
        await current.restore(
          {
            version: 1,
            ...state.payload,
            flagged: [],
            cwd: state.payload.cwd || '/' + state.definition.projectName,
            config: state.payload.config || {},
            updatedAt: state.server_now,
            serverRevision: state.checkpoint_revision,
          },
          state.status !== 'in_progress',
        );
      if (!live || activeAttempt.current !== state.id) return;
      current.setAttemptId(state.id);
      current.setServerRevision(state.checkpoint_revision);
      current.setReceipt(state.receipt || undefined);
      current.setLocked(state.status !== 'in_progress');
      setSync(
        state.status === 'in_progress' ? 'Waiting for autosave consent' : 'Finalized on server',
      );
      setInitialized(true);
    })().catch((e) => {
      if (live && activeAttempt.current === state.id) setError(String(e));
    });
    return () => {
      live = false;
    };
  }, [state?.id, lab.ready]);
  const refresh = async () => {
    if (!state) return;
    const { data, error } = await requireBackend().rpc('assessment_state', { p_attempt: state.id });
    if (activeAttempt.current !== state.id) return;
    if (error) throw error;
    clock.current = new ServerClock(data.server_now, data.deadline_at, performance.now());
    if (data.receipt) {
      if (!latest.current.receipt && data.payload)
        await latest.current.restore(
          {
            version: 1,
            ...data.payload,
            flagged: [],
            cwd: data.payload.cwd || '/',
            config: data.payload.config || {},
            updatedAt: data.server_now,
          },
          true,
        );
      if (activeAttempt.current !== state.id) return;
      latest.current.setReceipt(data.receipt);
      latest.current.setLocked(true);
      setSync(data.auto_submitted ? 'Auto-submitted at deadline' : 'Finalized on server');
    }
    return data as AttemptState;
  };
  useEffect(() => {
    if (!state || !initialized) return;
    let fetching = false;
    const tick = () => {
      const ms = clock.current?.remaining(performance.now()) ?? Infinity;
      setRemaining(ms);
      if (ms === 0 && !latest.current.receipt) {
        latest.current.setLocked(true);
        if (navigator.onLine && !fetching) {
          fetching = true;
          void refresh()
            .catch(() =>
              setError(
                'Deadline reached. The server finalizes the last accepted autosave. Reconnect to retrieve your receipt.',
              ),
            )
            .finally(() => {
              fetching = false;
            });
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    const poll = setInterval(() => {
      if (navigator.onLine && !latest.current.receipt) void refresh().catch(() => {});
    }, 20000);
    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [state?.id, initialized]);
  const send = async (finalize = false): Promise<string | undefined> => {
    if (!state || !initialized || conflict) throw new Error('Assessment session is not ready');
    if (!finalize && !consent)
      throw new Error('Enable the disclosed autosave control before uploading work');
    while (saving.current) await saving.current;
    if (activeAttempt.current !== state.id) throw new Error('Assessment changed during save.');
    if (latest.current.receipt) return latest.current.receipt;
    const run = async () => {
      if (finalize) stopping.current = true;
      const current = latest.current;
      const saved = await current.capture();
      if (activeAttempt.current !== state.id) throw new Error('Assessment changed during save.');
      const signature = JSON.stringify([
        saved.snapshot,
        saved.answers,
        saved.events,
        saved.config,
        saved.cwd,
      ]);
      if (!finalize && signature === last.current) return;
      const pending = finalize ? await loadOutbox(state.id) : undefined;
      const payload = pending || {
        version: 2,
        action: finalize ? 'submit' : 'checkpoint',
        attemptId: state.id,
        idempotencyKey: crypto.randomUUID(),
        revision: revision.current,
        snapshot: saved.snapshot,
        answers: saved.answers,
        events: saved.events,
        cwd: saved.cwd,
        config: saved.config,
      };
      if (finalize) await saveOutbox(state.id, payload);
      if (activeAttempt.current !== state.id) throw new Error('Assessment changed during save.');
      setSync(finalize ? 'Submitting…' : 'Verifying autosave…');
      const data = await withRetry(async () => {
        const { data, error } = await requireBackend().functions.invoke('assessment-attempt', {
          body: payload,
        });
        if (error) {
          let detail = error.message;
          try {
            const response = await error.context?.json();
            if (response?.error) detail = response.error;
          } catch {}
          throw new Error(detail);
        }
        if (data?.error) throw new Error(data.error);
        return data;
      }, 2);
      if (activeAttempt.current !== state.id) return;
      revision.current = data.revision;
      current.setServerRevision(data.revision);
      last.current = signature;
      setError('');
      if (data.receipt) {
        // A late checkpoint can return an expiry receipt. Display the frozen server evidence,
        // never the newer local payload that was rejected at the deadline.
        const final = await requireBackend().rpc('assessment_state', { p_attempt: state.id });
        if (activeAttempt.current !== state.id) return;
        if (final.error)
          throw new Error(
            'Finalized on the server. Reconnect to recover the receipt and accepted work.',
          );
        if (final.data.payload)
          await current.restore(
            {
              version: 1,
              ...final.data.payload,
              flagged: [],
              cwd: final.data.payload.cwd || '/',
              config: final.data.payload.config || {},
              updatedAt: final.data.server_now,
            },
            true,
          );
        if (activeAttempt.current !== state.id) return;
        current.setReceipt(data.receipt);
        current.setLocked(true);
        await clearOutbox(state.id);
        setSync('Finalized on server');
        return data.receipt as string;
      }
      setSync('Server autosave accepted');
      return undefined;
    };
    const promise = run()
      .catch((e) => {
        if (activeAttempt.current !== state.id) throw e;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setSync('Not synced · work remains on this device');
        if (message.includes('conflict')) {
          setConflict(true);
          latest.current.setLocked(true);
        }
        throw e;
      })
      .finally(() => {
        saving.current = null;
      });
    saving.current = promise;
    return promise;
  };
  const sendLatest = useRef(send);
  sendLatest.current = send;
  useEffect(() => {
    if (!state || !initialized || !consent || state.status !== 'in_progress') return;
    setSync('Server autosave enabled · every 15s');
    const timer = setInterval(() => {
      if (navigator.onLine && !stopping.current && !latest.current.readOnly)
        void sendLatest.current(false).catch(() => {});
    }, 15000);
    const reconnect = () => {
      if (!stopping.current) void sendLatest.current(false).catch(() => {});
      void refresh().catch(() => {});
    };
    window.addEventListener('online', reconnect);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', reconnect);
    };
  }, [state?.id, initialized, consent]);
  return {
    remaining,
    sync,
    error,
    conflict,
    ready: !state || initialized,
    consent,
    finalized: !!lab.receipt,
    enableAutosave,
    submit: () => send(true),
    save: () => send(false),
    refresh,
  };
}
export type AssessmentSession = ReturnType<typeof useAssessmentSession>;
