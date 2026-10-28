import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminError, adminRPC } from './adminData';
import { Pagination } from './AdminPages';
export type ManagedRecord = {
  id: string;
  kind: string;
  label: string;
  description?: string;
  status: string;
  revision: number;
  archived: boolean;
  deleted: boolean;
  related: number;
  reason: string;
  actions: Record<string, boolean>;
  student_id?: string;
  effects?: Record<string, number>;
};
const labels: Record<string, string> = {
  archive: 'Archive',
  restore: 'Restore',
  trash: 'Move to Trash',
  purge: 'Delete permanently',
  invalidate: 'Invalidate attempt',
};
export function RecordConfirmation({
  records,
  action,
  close,
  saved,
}: {
  records: ManagedRecord[];
  action: string;
  close: () => void;
  saved: () => void;
}) {
  const [reason, setReason] = useState(''),
    [typed, setTyped] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const strong = records.length > 1 || ['trash', 'purge', 'invalidate'].includes(action);
  const phrase = (action === 'purge' ? 'DELETE' : action.toUpperCase()) + ' ' + records.length;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section
      className="management-confirmation form-card"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) close();
      }}
    >
      <h3 id={titleId} ref={heading} tabIndex={-1}>
        {labels[action]} · {records.length} {records.length === 1 ? 'record' : 'records'}
      </h3>
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <strong dir="auto">{r.label}</strong>
            <code>{r.id}</code>
            {r.effects && (
              <ul>
                {Object.entries(r.effects)
                  .filter(([, n]) => n > 0)
                  .map(([label, n]) => (
                    <li key={label}>
                      {label.replaceAll('_', ' ')}: {n}
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p>
        {action === 'archive'
          ? 'Hide these records from routine management lists. Restore them from Archived Items. Existing attempt evidence and grades stay accessible. Archived assessments cannot be newly started. Attempt limits do not change. Archiving course content also hides its lessons from the learning catalog.'
          : action === 'restore'
            ? 'Return these records to management lists. Assessments stay unpublished until you explicitly make them visible. Published learning content becomes visible again when its parent is available. Invalidation is not reversed.'
            : action === 'trash'
              ? 'This is reversible. Move eligible records to Trash and restore them later. Attempt evidence is retained and attempt limits do not reset.'
              : action === 'invalidate'
                ? 'Close this unsubmitted assignment attempt as invalid. Its files and history stay read only. This cannot be undone, does not start a new attempt or grant retake credit, and does not change any official grade.'
                : records[0].kind === 'assessment'
                  ? 'This cannot be undone. Permanently remove this unpublished assessment and the draft documents, sections, tasks, questions, rubrics and course links listed above. Student work, published history and audit records are protected.'
                  : records[0].kind === 'question'
                    ? 'This cannot be undone. Remove only these reusable bank copies. Existing assessment copies, answer keys and audit history stay unchanged.'
                    : 'This cannot be undone. Remove only these never-published learning items and their drafts. Child items, course links and published versions are protected. External resource files are not deleted.'}
      </p>
      <p>
        {records.reduce((n, r) => n + r.related, 0)} related records or links. Protected records are
        rejected again on the server; the entire batch rolls back if any record changed.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await adminRPC('manage_records', {
              p_kind: records[0].kind,
              p_records: records.map((r) => ({ id: r.id, revision: r.revision })),
              p_action: action,
              p_reason: reason,
              p_confirmation: typed,
            });
            saved();
          } catch (e) {
            setError(
              /foreign key/i.test(adminError(e))
                ? 'Another record still needs this item. Archive it or manage its links before deleting.'
                : adminError(e),
            );
            heading.current?.focus();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Reason{strong ? ' (required)' : ' (optional)'}
          {action === 'invalidate' && (
            <small>
              This reason is shown to the student. Keep private review notes out of this field.
            </small>
          )}
          <textarea
            dir="auto"
            rows={2}
            maxLength={500}
            minLength={strong ? 3 : undefined}
            required={strong}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {strong && (
          <label>
            Type {phrase} to confirm
            <input
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              required
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error} Refresh records before retrying: a network interruption may hide a completed
            action. The server applies each batch atomically.
          </p>
        )}
        <div className="review-actions">
          <button type="button" className="outline-button" disabled={busy} onClick={close}>
            Cancel management action
          </button>
          <button
            className={
              ['purge', 'trash', 'invalidate'].includes(action) ? 'danger-button' : 'primary'
            }
            disabled={busy || (strong && typed !== phrase)}
          >
            {busy ? 'Applying…' : 'Confirm ' + labels[action]}
          </button>
        </div>
      </form>
    </section>
  );
}
export function RecordActions({
  kind,
  id,
  changed,
}: {
  kind: string;
  id: string;
  changed?: () => void;
}) {
  const [record, setRecord] = useState<ManagedRecord | null>(null),
    [action, setAction] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setAction('');
    trigger.current?.focus();
  };
  return (
    <div className="record-actions">
      <button
        ref={trigger}
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          setNotice('');
          setAction('');
          setRecord(null);
          try {
            setRecord(await adminRPC<ManagedRecord>('manage_preview', { p_kind: kind, p_id: id }));
          } catch (e) {
            setError(
              /foreign key/i.test(adminError(e))
                ? 'Another record still needs this item. Archive it or manage its links before deleting.'
                : adminError(e),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Manage record
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {record && !action && (
        <div className="record-action-options">
          <p>{record.reason}</p>
          {Object.entries(labels)
            .filter(([key]) => record.actions[key])
            .map(([key, label]) => (
              <button
                key={key}
                className={
                  ['purge', 'trash', 'invalidate'].includes(key)
                    ? 'text-button danger-text'
                    : 'outline-button'
                }
                onClick={() => setAction(key)}
              >
                {label}
              </button>
            ))}
          <button className="text-button" onClick={() => setRecord(null)}>
            Close record actions
          </button>
        </div>
      )}
      {record && action && (
        <RecordConfirmation
          records={[record]}
          action={action}
          close={close}
          saved={() => {
            setNotice(labels[action] + ' completed.');
            setRecord(null);
            setAction('');
            changed?.();
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
export function RecordManager() {
  const [query] = useSearchParams();
  const [kind, setKind] = useState(query.get('kind') || 'assessment'),
    [state, setState] = useState('active'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<ManagedRecord[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [action, setAction] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    setSelected([]);
    setAction('');
    const timer = setTimeout(() => {
      void adminRPC<{ rows: ManagedRecord[]; total: number }>('manage_list', {
        p_kind: kind,
        p_state: state,
        p_search: search,
        p_offset: page * 25,
        p_limit: 25,
      })
        .then((d) => {
          if (live) {
            setRows(d.rows);
            setTotal(d.total);
          }
        })
        .catch((e) => {
          if (live)
            setError(
              /foreign key/i.test(adminError(e))
                ? 'Another record still needs this item. Archive it or manage its links before deleting.'
                : adminError(e),
            );
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, state, search, page, refresh]);
  const chosen = rows.filter((r) => selected.includes(r.id));
  return (
    <section>
      <h2>Archive &amp; Trash</h2>
      <p>
        Manage selected records without changing grading rules. Official submissions and published
        history are retained. At most 25 records can be changed together.
      </p>
      <div className="table-toolbar">
        <label>
          Record type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            {[
              ['assessment', 'Assessments'],
              ['attempt', 'Student attempts'],
              ['question', 'Question bank'],
              ['request', 'Help requests'],
              ['learning', 'Courses'],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show records
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(0);
            }}
          >
            <option value="active">Active</option>
            <option value="archived">Archived Items</option>
            <option value="trash">Trash</option>
            <option value="all">All records</option>
          </select>
        </label>
        <label>
          Search records
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          Refresh records
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading managed records…</p>
      ) : (
        !error && (
          <>
            <p>{chosen.length} selected</p>
            <div className="review-actions">
              {Object.entries(labels)
                .filter(([key]) => chosen.length > 0 && chosen.every((r) => r.actions[key]))
                .map(([key, label]) => (
                  <button key={key} className="outline-button" onClick={() => setAction(key)}>
                    {label} selected ({chosen.length})
                  </button>
                ))}
            </div>
            {!rows.length ? (
              <p className="empty-state">No records match these filters.</p>
            ) : (
              rows.map((r) => (
                <article className="managed-row" key={r.id}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      aria-label={'Select ' + r.label}
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <strong dir="auto">{r.label}</strong>
                  </label>
                  <p dir="auto">{r.description}</p>
                  <small>
                    {r.status} · {r.deleted ? 'In Trash' : r.archived ? 'Archived' : 'Active'}
                  </small>
                  <p>{r.reason}</p>
                  <div className="review-actions">
                    {kind === 'request' && (
                      <Link className="text-button" to="/instructor/requests">
                        View help requests
                      </Link>
                    )}
                    {kind === 'assessment' && !r.deleted && (
                      <Link className="text-button" to={'/instructor/assessments/' + r.id}>
                        View / edit assessment
                      </Link>
                    )}
                    {kind === 'learning' && (
                      <Link className="text-button" to={'/instructor/content?open=' + r.id}>
                        View content
                      </Link>
                    )}
                    {kind === 'attempt' && (
                      <Link
                        className="text-button"
                        to={
                          '/instructor/submissions?ongoing=1&student=' +
                          encodeURIComponent(r.student_id || '')
                        }
                      >
                        View student attempts
                      </Link>
                    )}
                    <RecordActions
                      kind={kind}
                      id={r.id}
                      changed={() => {
                        setNotice('Record management completed.');
                        setRefresh((n) => n + 1);
                      }}
                    />
                  </div>
                </article>
              ))
            )}
            <Pagination page={page} total={total} onPage={setPage} />
          </>
        )
      )}
      {action && chosen.length > 0 && (
        <RecordConfirmation
          records={chosen}
          action={action}
          close={() => setAction('')}
          saved={() => {
            setNotice(`${labels[action]} completed for ${chosen.length} records.`);
            setAction('');
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
export function AdminActivity() {
  const [page, setPage] = useState(0),
    [data, setData] = useState<{ rows: any[]; total: number }>(),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError('');
    void adminRPC<{ rows: any[]; total: number }>('manage_activity', {
      p_offset: page * 25,
      p_limit: 25,
    })
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live)
          setError(
            /foreign key/i.test(adminError(e))
              ? 'Another record still needs this item. Archive it or manage its links before deleting.'
              : adminError(e),
          );
      });
    return () => {
      live = false;
    };
  }, [page, refresh]);
  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>Admin activity</h2>
          <p>Retained administrative history, including records that were deleted.</p>
        </div>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          Refresh activity
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error ? (
        <p role="status">Loading activity…</p>
      ) : (
        data && (
          <>
            {!data.rows.length && <p>No administrative activity yet.</p>}
            {data.rows.map((r) => (
              <article className="managed-row" key={r.id}>
                <strong>
                  {(
                    {
                      purge: 'Deleted permanently',
                      trash: 'Moved to Trash',
                      invalidate: 'Attempt invalidated',
                      archive: 'Archived',
                      restore: 'Restored',
                    } as Record<string, string>
                  )[r.action] || r.action.replaceAll('_', ' ').replaceAll('.', ' · ')}
                </strong>
                <p>
                  {r.record_type} · {r.record_id}
                </p>
                <small>
                  {r.actor_name} · {new Date(r.created_at).toLocaleString()}
                </small>
                {r.reason && <p dir="auto">Reason: {r.reason}</p>}
                {r.metadata && Object.keys(r.metadata).length > 0 && (
                  <details>
                    <summary>What changed</summary>
                    <pre>{JSON.stringify(r.metadata, null, 2)}</pre>
                  </details>
                )}
              </article>
            ))}
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
