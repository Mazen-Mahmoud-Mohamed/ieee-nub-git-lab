import { DriveVideo } from '../learning/SessionResources';
import { SessionMaterials } from '../learning/SessionMaterials';
import { driveVideo, type LearningDocument } from '../learning/materials';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminError, adminRPC } from './adminData';
import { RecordActions, type ManagedRecord } from './RecordManagement';
import { Pagination } from './AdminPages';
import { requireBackend } from '../../services/supabase';
type Document = LearningDocument;
type Item = {
  id: string;
  kind: string;
  parent_id: string | null;
  revision: number;
  document: Document;
  archived_at: string | null;
  deleted_at: string | null;
  published_version: number;
};
export function LearningContent() {
  const [query, setQuery] = useSearchParams();
  const parentId = query.get('parent');
  const editorCache = 'learning-editor:' + (parentId || 'root');
  const [parent, setParent] = useState<Item | null>(null),
    [rows, setRows] = useState<ManagedRecord[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0),
    [state, setState] = useState('active'),
    [editing, setEditing] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    void Promise.all([
      parentId ? adminRPC<Item>('manage_learning_edit', { p_id: parentId }) : Promise.resolve(null),
      adminRPC<{ rows: ManagedRecord[]; total: number }>('manage_list', {
        p_kind: 'learning',
        p_state: state,
        p_parent: parentId,
        p_offset: page * 25,
        p_limit: 25,
      }),
    ])
      .then(([p, d]) => {
        if (live) {
          setParent(p);
          setRows(d.rows);
          setTotal(d.total);
        }
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [parentId, page, state, refresh]);
  const recoverForm = (item: Item) => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(editorCache) || 'null');
      if (
        cached?.id === item.id &&
        typeof cached.document?.title === 'string' &&
        Array.isArray(cached.document.links) &&
        typeof cached.revision === 'number'
      ) {
        setNotice(
          'Recovered this editor form from your device. Save or publish checks its original revision. Reload saved version to discard local form changes.',
        );
        return { ...item, document: cached.document, revision: cached.revision };
      }
    } catch {
      /* Saved server content remains available if recovery storage is unavailable. */
    }
    return item;
  };
  const openId = query.get('open');
  useEffect(() => {
    let live = true;
    if (openId)
      void adminRPC<Item>('manage_learning_edit', { p_id: openId })
        .then((item) => {
          if (!live) return;
          if (item.kind === 'lesson') setEditing(recoverForm(item));
          else setQuery({ parent: item.id });
        })
        .catch((e) => {
          if (live) setError(adminError(e));
        });
    return () => {
      live = false;
    };
  }, [openId, setQuery, refresh]);
  useEffect(() => {
    setEditing(null);
    if (!openId)
      try {
        const cached = JSON.parse(sessionStorage.getItem(editorCache) || 'null');
        if (
          cached &&
          cached.parent_id === (parentId || null) &&
          typeof cached.id === 'string' &&
          ['course', 'section', 'lesson'].includes(cached.kind) &&
          typeof cached.document?.title === 'string' &&
          Array.isArray(cached.document.links)
        ) {
          setEditing(cached);
          setNotice(
            'Recovered an editor form from this device. Save or publish to persist it online; concurrent changes are still checked.',
          );
        }
      } catch {
        /* A damaged optional form recovery copy does not affect saved content. */
      }
  }, [parentId, openId, editorCache]);
  useEffect(() => {
    if (editing)
      try {
        sessionStorage.setItem(editorCache, JSON.stringify(editing));
      } catch {
        setNotice(
          'Form recovery storage is unavailable. Save your draft before leaving this page.',
        );
      }
  }, [editing, editorCache]);
  const kind = !parent ? 'course' : parent.kind === 'course' ? 'section' : 'lesson';
  const update = (changes: Partial<Document>) =>
    setEditing((v) =>
      v && v.id === editing?.id ? { ...v, document: { ...v.document, ...changes } } : v,
    );
  const open = async (id: string) => {
    if (busy) return;
    if (
      editing &&
      !window.confirm(
        'Open another item? Save or publish your current form first if you want to keep its changes online.',
      )
    )
      return;
    setError('');
    try {
      const item = await adminRPC<Item>('manage_learning_edit', { p_id: id });
      if (item.kind === 'lesson') setEditing(recoverForm(item));
      else {
        setQuery({ parent: id });
        setPage(0);
        setState('active');
      }
    } catch (e) {
      setError(adminError(e));
    }
  };
  const save = async (publish: boolean) => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await adminRPC('manage_learning_save', {
        p_id: editing.id || null,
        p_kind: editing.kind,
        p_parent: editing.parent_id,
        p_document: {
          ...editing.document,
          video_url: driveVideo(editing.document.video_url || '')?.open || '',
        },
        p_revision: editing.revision || null,
        p_publish: publish,
      });
      sessionStorage.removeItem(editorCache);
      setEditing(null);
      setNotice(
        publish
          ? 'Published. Students see this version when its course and section are published.'
          : 'Draft saved. Published content stays unchanged.',
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      {parent && (
        <button
          className="text-button"
          onClick={() => {
            setQuery(parent.parent_id ? { parent: parent.parent_id } : {});
            setPage(0);
          }}
        >
          ← Back to {parent.kind === 'course' ? 'courses' : 'course'}
        </button>
      )}
      <div className="page-heading">
        <div>
          <h2>{parent ? parent.document.title : 'Courses & lessons'}</h2>
          <p>
            {kind === 'lesson'
              ? 'Add a session name, upload your PowerPoint, add a video link, then publish.'
              : 'Organize courses and sections. Open a section to add learning sessions.'}
          </p>
        </div>
        <button
          className="primary"
          disabled={busy || loading || !!parent?.archived_at || !!parent?.deleted_at}
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              kind,
              parent_id: parentId,
              revision: 0,
              document: { title: '', body: '', links: [] },
              archived_at: null,
              deleted_at: null,
              published_version: 0,
            })
          }
        >
          New {kind === 'lesson' ? 'session' : kind}
        </button>
      </div>
      <p className="session-entry-link">
        <Link
          className="outline-button"
          to={
            '/instructor/sessions' +
            (parent?.kind === 'course'
              ? '?course=' + parent.id
              : parent?.kind === 'section'
                ? '?course=' + parent.parent_id
                : '')
          }
        >
          Learning Sessions · Add a PowerPoint and recorded lecture
        </Link>
      </p>
      {parent && (
        <>
          <button className="outline-button" disabled={busy} onClick={() => setEditing(parent)}>
            View / edit {parent.kind} details
          </button>
          <RecordActions
            kind="learning"
            id={parent.id}
            changed={() => {
              setNotice('Record management completed.');
              setRefresh((n) => n + 1);
            }}
          />
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editing && (
        <section className="form-card editor-fields">
          <h3>
            {editing.revision ? 'Edit' : 'Create'}{' '}
            {editing.kind === 'lesson' ? 'session' : editing.kind}
          </h3>
          {(editing.archived_at || editing.deleted_at) && (
            <p>Restore this content before editing it.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <fieldset disabled={busy || !!editing.archived_at || !!editing.deleted_at}>
              <label>
                {editing.kind === 'lesson' ? 'Session name' : 'Content title'}
                <input
                  dir="auto"
                  required
                  maxLength={180}
                  value={editing.document.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              {editing.kind === 'lesson' && (
                <SessionMaterials
                  id={editing.id}
                  document={editing.document}
                  update={update}
                  busy={busy}
                  onBusy={setBusy}
                  prepare={async () => {
                    const doc = {
                      ...editing.document,
                      video_url: driveVideo(editing.document.video_url || '')?.open || '',
                    };
                    await adminRPC('manage_learning_save', {
                      p_id: editing.id,
                      p_kind: editing.kind,
                      p_parent: editing.parent_id,
                      p_document: doc,
                      p_revision: editing.revision || null,
                      p_publish: false,
                    });
                    const saved = await adminRPC<Item>('manage_learning_edit', {
                      p_id: editing.id,
                    });
                    setEditing((current) =>
                      current && current.id === editing.id
                        ? { ...current, revision: saved.revision }
                        : current,
                    );
                  }}
                />
              )}
              <details className="session-options">
                <summary>Optional description and supporting resources</summary>{' '}
                <label>
                  Lesson or overview text
                  <textarea
                    dir="auto"
                    rows={7}
                    maxLength={20000}
                    value={editing.document.body}
                    onChange={(e) => update({ body: e.target.value })}
                  />
                </label>
                <h4>Educational resources</h4>
                <p>Link to HTTPS materials. This does not upload, copy or delete external files.</p>
                {editing.document.links.map((link, i) => (
                  <div className="resource-editor" key={i}>
                    <label>
                      Resource {i + 1} title
                      <input
                        required
                        maxLength={100}
                        dir="auto"
                        value={link.label}
                        onChange={(e) =>
                          update({
                            links: editing.document.links.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Resource {i + 1} URL
                      <input
                        type="url"
                        required
                        pattern="https://.*"
                        value={link.url}
                        onChange={(e) =>
                          update({
                            links: editing.document.links.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (
                          (link.label || link.url) &&
                          !window.confirm(
                            `Remove resource "${link.label || link.url}" from this draft? Published versions and the external file are unchanged.`,
                          )
                        )
                          return;
                        update({ links: editing.document.links.filter((_, j) => i !== j) });
                      }}
                    >
                      Remove resource {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="outline-button"
                  disabled={editing.document.links.length >= 20}
                  onClick={() =>
                    update({ links: [...editing.document.links, { label: '', url: '' }] })
                  }
                >
                  Add resource link
                </button>
              </details>
              <details className="draft-session-preview">
                <summary>Preview this draft</summary>
                <h3 dir="auto">
                  {editing.document.session_number
                    ? `Session ${editing.document.session_number} — `
                    : ''}
                  {editing.document.title}
                </h3>
                <p className="written-answer" dir="auto">
                  {editing.document.body}
                </p>
                {!!editing.document.topics?.length && (
                  <ul>
                    {editing.document.topics.map((t, i) => (
                      <li dir="auto" key={i}>
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
                {editing.document.video_url && <DriveVideo url={editing.document.video_url} />}
                {editing.document.presentation_id && (
                  <p>
                    The draft presentation can be opened above. Students see it only after
                    publication.
                  </p>
                )}
                <ul>
                  {editing.document.links
                    .filter((l) => /^https:\/\//.test(l.url))
                    .map((l, i) => (
                      <li key={i}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.label}
                        </a>
                      </li>
                    ))}
                </ul>
              </details>
              <div className="review-actions">
                <button className="outline-button">Save content draft</button>
                <button
                  type="button"
                  className="primary"
                  onClick={(e) => {
                    if (e.currentTarget.form?.reportValidity()) void save(true);
                  }}
                >
                  {editing.kind === 'lesson' ? 'Publish session' : 'Publish content version'}
                </button>
              </div>
            </fieldset>
            {editing.revision > 0 && (
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Discard local form changes and load the latest saved content? Published versions and assessment work stay unchanged.',
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    const saved = await adminRPC<Item>('manage_learning_edit', {
                      p_id: editing.id,
                    });
                    setEditing(saved);
                    setNotice('Loaded the latest saved content.');
                  } catch (e) {
                    setError(adminError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reload saved version
              </button>
            )}
            {editing.published_version > 0 && (
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Unpublish "${editing.document.title}"? Students will no longer see it. Retained versions, presentations and assessment work stay unchanged.`,
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await adminRPC('manage_learning_unpublish', {
                      p_id: editing.id,
                      p_revision: editing.revision,
                    });
                    sessionStorage.removeItem(editorCache);
                    setEditing(null);
                    setRefresh((n) => n + 1);
                    setNotice('Content unpublished. Retained versions are unchanged.');
                  } catch (e) {
                    setError(adminError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Unpublish content
              </button>
            )}
            {editing.published_version > 0 && (
              <Link className="outline-button" target="_blank" to={'/learn/' + editing.id}>
                Preview published student view
              </Link>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Close the editor? Any changes since the last successful save will be discarded.',
                  )
                ) {
                  sessionStorage.removeItem(editorCache);
                  setEditing(null);
                }
              }}
            >
              Close content editor
            </button>
          </form>
        </section>
      )}
      <label>
        Show learning content
        <select
          disabled={busy}
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(0);
          }}
        >
          <option value="active">Active</option>
          <option value="archived">Archived Items</option>
          <option value="trash">Trash</option>
          <option value="all">All</option>
        </select>
      </label>
      {loading ? (
        <p role="status">Loading learning content…</p>
      ) : (
        !error && (
          <>
            {!rows.length && <p className="empty-state">No {kind}s here yet.</p>}
            {rows.map((r) => (
              <article className="managed-row" key={r.id}>
                <h3 dir="auto">{r.label}</h3>
                <p>
                  {r.status} · {r.deleted ? 'Trash' : r.archived ? 'Archived' : 'Active'}
                </p>
                <button className="outline-button" disabled={busy} onClick={() => void open(r.id)}>
                  Open content
                </button>
                <RecordActions
                  kind="learning"
                  id={r.id}
                  changed={() => {
                    setNotice('Record management completed.');
                    setRefresh((n) => n + 1);
                  }}
                />
              </article>
            ))}
            <Pagination page={page} total={total} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
export function AssessmentCourse({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const [options, setOptions] = useState<Array<{ id: string; title: string }>>([]),
    [course, setCourse] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      adminRPC<Array<{ id: string; title: string }>>('manage_course_options'),
      adminRPC<ManagedRecord>('manage_preview', { p_kind: 'assessment', p_id: id }),
      requireBackend()
        .from('assessment_courses')
        .select('course_id')
        .eq('assessment_id', id)
        .maybeSingle(),
    ])
      .then(([o, record, r]) => {
        if (!live) return;
        if (r.error) throw r.error;
        setOptions(o || []);
        setRevision(record.revision);
        setCourse(r.data?.course_id || '');
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <section className="course-association">
      <h4>Course organization</h4>
      <p>
        This groups assessments and submission filters. Published criteria and existing attempts
        stay unchanged.
      </p>
      <label>
        Course for this assessment
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">No course assigned</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <button
        className="outline-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await adminRPC('manage_assessment_course', {
              p_assessment: id,
              p_course: course || null,
              p_revision: revision,
            });
            setRevision(
              (await adminRPC<ManagedRecord>('manage_preview', { p_kind: 'assessment', p_id: id }))
                .revision,
            );
            setNotice('Course organization saved.');
          } catch (e) {
            setError(adminError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save course organization
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Link to="/instructor/content">Manage courses</Link>
    </section>
  );
}
