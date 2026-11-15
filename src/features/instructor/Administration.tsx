import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { requireBackend } from '../../services/supabase';
import { adminError, adminRPC } from './adminData';
import { RecordManager, AdminActivity } from './RecordManagement';
import { SectionTabs } from './Instructor';

export function Administration({ name }: { name: string }) {
  const [query] = useSearchParams();
  const tab = query.get('tab') || '';
  return (
    <>
      <SectionTabs
        base="/instructor/administration"
        tabs={[
          ['', 'Account access'],
          ['records', 'Archive & Trash'],
          ['activity', 'Activity'],
          ['settings', 'Settings'],
        ]}
      />
      {tab === 'records' ? (
        <RecordManager />
      ) : tab === 'activity' ? (
        <AdminActivity />
      ) : tab === 'settings' ? (
        <Settings />
      ) : (
        <AccountAccess name={name} />
      )}
    </>
  );
}
function AccountAccess({ name }: { name: string }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    setIsAdmin(undefined);
    void adminRPC<boolean>('is_data_administrator')
      .then((value) => {
        if (live) setIsAdmin(value === true);
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  return (
    <div className="admin-access-grid">
      <section className="form-card">
        <div className="admin-card-icon">
          <ShieldCheck size={23} />
        </div>
        <h2>Authorized account</h2>
        <p>
          Signed in as <strong>{name || 'Instructor'}</strong>. Access is verified by the server.
        </p>
        {error ? (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
              Retry access check
            </button>
          </>
        ) : isAdmin === undefined ? (
          <p role="status">Checking account permissions…</p>
        ) : (
          <div className="admin-role-list">
            <div>
              <CheckCircle2 size={18} />
              <span>
                <strong>Instructor</strong>
                <small>Manage teaching content, assessments and grading.</small>
              </span>
              <span className="status-badge" data-tone="published">
                Authorized
              </span>
            </div>
            <div>
              <LockKeyhole size={18} />
              <span>
                <strong>Data administrator</strong>
                <small>Additional permission for eligible destructive data actions.</small>
              </span>
              <span className="status-badge" data-tone={isAdmin ? 'published' : 'hidden'}>
                {isAdmin ? 'Authorized' : 'Not assigned'}
              </span>
            </div>
          </div>
        )}
      </section>
      <section className="form-card">
        <h2>Access & record protection</h2>
        <p>
          Administrator roles are assigned by the institution. Instructor access does not grant
          data-administrator access.
        </p>
        <ul className="admin-protection-list">
          <li>Students cannot access private drafts or answer keys.</li>
          <li>Published versions and uploaded presentations retain their history.</li>
          <li>
            Archive, restore and destructive actions are checked on the server and recorded in the
            audit trail.
          </li>
        </ul>
      </section>
    </div>
  );
}
function Settings() {
  const [enabled, setEnabled] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setReady(false);
    setError('');
    void requireBackend()
      .from('app_settings')
      .select('accessibility_paste')
      .eq('id', true)
      .single()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setError(error.message);
        else {
          setEnabled(data.accessibility_paste);
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  return (
    <div className="admin-access-grid">
      <section className="form-card">
        <h2>Assessment accessibility</h2>
        <p>
          Allow paste access when assistive technology, language tools or an accommodation requires
          it.
        </p>
        {!ready && !error && <p role="status">Loading settings…</p>}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!ready || busy}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setNotice('');
            }}
          />
          Allow paste in protected answer fields
        </label>
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setNotice('');
            try {
              await adminRPC('update_settings', { p_paste: enabled });
              setNotice('Accessibility setting saved and audited.');
            } catch (e) {
              setError(adminError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            {!ready && (
              <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
                Retry settings
              </button>
            )}
          </>
        )}
      </section>
      <section className="form-card">
        <h2>Data management</h2>
        <p>
          Use Archive & Trash to review eligible records before taking action. Published materials
          and administrative history are retained.
        </p>
        <div className="admin-retention-note">
          <LockKeyhole size={19} />
          <p>
            Review each record's status and available actions before making changes. Additional
            administrator permission is required for destructive actions.
          </p>
        </div>
      </section>
    </div>
  );
}
