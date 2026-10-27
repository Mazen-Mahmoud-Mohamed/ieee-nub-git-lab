import { recoveryReason } from '../assessments/recoveryPresentation';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { requireBackend } from '../../services/supabase';
import { Pagination } from './AdminPages';
type HelpRequest = {
  id: string;
  attempt_id: string;
  assignment_id: string;
  full_name: string;
  email: string;
  title: string;
  message: string;
  status: string;
  reply: string;
  attempt_number: number;
  created_at: string;
  recovery_code: string;
};
export function HelpRequests() {
  const [status, setStatus] = useState('pending'),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<HelpRequest[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<HelpRequest | null>(null),
    [reply, setReply] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const responseField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (selected) responseField.current?.focus();
  }, [selected]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    void requireBackend()
      .rpc('instructor_help_requests', { p_status: status, p_offset: page * 25, p_limit: 25 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setError('Requests could not be loaded. Try again.');
        else {
          setRows(data.rows);
          setTotal(data.total);
        }
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [status, page, refresh]);
  const resolve = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await requireBackend().rpc('resolve_attempt_help', {
        p_request: selected.id,
        p_approve: approve,
        p_reply: reply,
      });
      if (error) throw error;
      setNotice(
        approve
          ? 'Approved. The student can start over while the assessment is open.'
          : 'Request declined. The student can read your response.',
      );
      setSelected(null);
      setReply('');
      setRefresh((x) => x + 1);
    } catch {
      setError(
        'This request could not be updated. It may already be answered or the assessment may have closed. Refresh to check.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="help-requests">
      <div className="page-heading">
        <div>
          <h2>Help requests</h2>
          <p>Review students who need another attempt. Approval keeps their old work and grades.</p>
        </div>
        <button className="outline-button" onClick={() => setRefresh((x) => x + 1)}>
          Refresh requests
        </button>
      </div>
      <label>
        Show requests
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="pending">Waiting for a response</option>
          <option value="approved">Approved</option>
          <option value="rejected">Declined</option>
          <option value="">All requests</option>
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error ? null : loading ? (
        <p role="status">Loading requests…</p>
      ) : !rows.length ? (
        <p className="empty-state">
          No {status === 'pending' ? 'waiting' : ''} requests. Students can ask for help from their
          workspace.
        </p>
      ) : (
        <div className="request-list">
          {rows.map((r) => (
            <article key={r.id} className="request-card">
              <div>
                <h3>{r.full_name}</h3>
                <p>
                  {r.title} · Attempt {r.attempt_number}
                </p>
                <small>
                  {new Date(r.created_at).toLocaleString()} ·{' '}
                  {r.status === 'pending'
                    ? 'Waiting'
                    : r.status === 'rejected'
                      ? 'Declined'
                      : 'Approved'}
                </small>
              </div>
              <p dir="auto">{r.message}</p>
              {r.reply && <p dir="auto">Your response: {r.reply}</p>}
              <div className="review-actions">
                <Link
                  className="text-button"
                  to={`/instructor/submissions?search=${encodeURIComponent(r.email)}&ongoing=1`}
                >
                  View student work
                </Link>
                {r.status === 'pending' && (
                  <button
                    className="primary"
                    onClick={() => {
                      setSelected(r);
                      setReply('');
                    }}
                  >
                    Respond to request
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <section
          className="form-card"
          role="alertdialog"
          aria-label="Respond to help request"
          aria-modal="false"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) setSelected(null);
          }}
        >
          <h3>Respond to {selected.full_name}</h3>
          <p>
            {selected.recovery_code === 'available'
              ? 'Another attempt is already available. Confirm approval or decline with an explanation.'
              : 'Approve one extra attempt, or decline with an explanation.'}{' '}
            This does not reset work, extend deadlines or allow an active exam to restart.
          </p>
          {!['available', 'attempt_limit'].includes(selected.recovery_code) && (
            <p>
              {recoveryReason(selected.recovery_code)} You can decline this request with a response.
            </p>
          )}
          <label>
            Response to the student (optional)
            <textarea
              ref={responseField}
              dir="auto"
              rows={3}
              maxLength={500}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <div className="review-actions">
            <button className="outline-button" disabled={busy} onClick={() => setSelected(null)}>
              Cancel response
            </button>
            <button className="outline-button" disabled={busy} onClick={() => void resolve(false)}>
              Decline request
            </button>
            <button
              className="primary"
              disabled={busy || !['available', 'attempt_limit'].includes(selected.recovery_code)}
              onClick={() => void resolve(true)}
            >
              Approve another attempt
            </button>
          </div>
        </section>
      )}
      <Pagination page={page} total={total} onPage={setPage} />
    </section>
  );
}
