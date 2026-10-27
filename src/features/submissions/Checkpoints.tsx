import { useState } from 'react';
import type { Lab } from '../../hooks/useLab';
import type { LocalWorkspace } from '../../services/persistence';
import { requireBackend } from '../../services/supabase';
export function Checkpoints({ lab, authenticated }: { lab: Lab; authenticated: boolean }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="checkpoint">
      <summary>Backup & recovery</summary>
      <p>
        A backup keeps a copy of your files and answers. Importing a backup does not submit your
        work or change who owns the attempt.
      </p>
      <div className="checkpoint-actions">
        {authenticated && lab.attemptId && (
          <>
            <button
              className="outline-button"
              disabled={!authenticated || !lab.attemptId || busy || !!lab.receipt}
              onClick={() =>
                void perform(async () => {
                  const { error } = await requireBackend().rpc('save_checkpoint', {
                    p_attempt: lab.attemptId,
                    p_payload: await lab.capture(),
                  });
                  if (error) throw error;
                  setNotice('Cloud checkpoint saved.');
                })
              }
            >
              Save cloud checkpoint
            </button>
            <button
              className="outline-button"
              disabled={!authenticated || !lab.attemptId || busy || !!lab.receipt}
              onClick={() =>
                void perform(async () => {
                  const { data, error } = await requireBackend()
                    .from('workspace_drafts')
                    .select('payload')
                    .eq('attempt_id', lab.attemptId)
                    .single();
                  if (error) throw error;
                  await lab.restore(data.payload as LocalWorkspace);
                  setNotice('Cloud checkpoint restored.');
                })
              }
            >
              Restore cloud checkpoint
            </button>
          </>
        )}
        <label className="backup-import">
          Import local backup
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy || !!lab.receipt}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void perform(async () => {
                if (file.size > 9_000_000) throw new Error('Backup exceeds 9 MB');
                await lab.restore(JSON.parse(await file.text()));
                setNotice('Local backup restored. Existing attempt ownership has not changed.');
              });
            }}
          />
        </label>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
