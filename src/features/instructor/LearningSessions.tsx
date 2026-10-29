import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requireBackend } from '../../services/supabase';
import { SessionMaterials } from '../learning/SessionMaterials';
import { isLegacyTutorial, orderedTeachingSessions } from '../learning/teachingSessions';
import { driveVideo, type LearningDocument } from '../learning/materials';
import { adminError, adminRPC } from './adminData';
import {
  courseSections,
  courseSessions,
  defaultSessionCourse,
  sessionCourses,
  type LearningItemSummary,
} from './sessionDestination';

type Session = LearningItemSummary & { revision: number; document: LearningDocument };
async function hierarchy() {
  const items: LearningItemSummary[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await requireBackend()
      .from('learning_items')
      .select('id,kind,parent_id,title,published_version,archived_at,deleted_at,created_at')
      .is('archived_at', null)
      .is('deleted_at', null)
      .order('created_at')
      .order('id')
      .range(offset, offset + 99);
    if (error) throw error;
    items.push(...(data || []));
    if (!data || data.length < 100) return items;
  }
}
export function LearningSessions() {
  const [query, setQuery] = useSearchParams();
  const [items, setItems] = useState<LearningItemSummary[]>([]),
    [courseId, setCourseId] = useState(''),
    [editing, setEditing] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const generation = useRef(0);
  const recoveredCourse = useRef('');
  const selectedCourse = useRef(query.get('course') || '');
  const [documents, setDocuments] = useState<Record<string, Session>>({});
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const rows = await hierarchy();
      const destination = defaultSessionCourse(
        rows,
        selectedCourse.current || query.get('course') || '',
      );
      const lessons = courseSessions(rows, destination).filter((s) => !isLegacyTutorial(s.id));
      const saved: Session[] = [];
      for (let i = 0; i < lessons.length; i += 20)
        saved.push(
          ...(await Promise.all(
            lessons
              .slice(i, i + 20)
              .map((s) => adminRPC<Session>('manage_learning_edit', { p_id: s.id })),
          )),
        );
      if (generation.current !== token) return;
      setItems(rows);
      selectedCourse.current = destination;
      setCourseId(destination);
      setDocuments(Object.fromEntries(saved.map((s) => [s.id, s])));
      setError('');
    } catch (e) {
      if (generation.current === token) setError(adminError(e));
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const cache = 'learning-session-editor:' + courseId;
  useEffect(() => {
    if (loading || !courseId || recoveredCourse.current === courseId) return;
    recoveredCourse.current = courseId;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cache) || 'null');
      if (
        saved?.kind === 'lesson' &&
        typeof saved.id === 'string' &&
        !isLegacyTutorial(saved.id) &&
        typeof saved.document?.title === 'string' &&
        Array.isArray(saved.document.links) &&
        courseSections(items, courseId).some((s) => s.id === saved.parent_id)
      ) {
        setEditing(saved);
        setNotice(
          'Recovered your session form. Save or publish checks the current server revision.',
        );
      }
    } catch {
      /* Saved server drafts remain available. */
    }
  }, [courseId, cache, loading]);
  useEffect(() => {
    if (editing)
      try {
        sessionStorage.setItem(cache, JSON.stringify(editing));
      } catch {
        setNotice('Device draft recovery is unavailable. Save your session before leaving.');
      }
  }, [editing, cache]);
  const course = sessionCourses(items).find((c) => c.id === courseId),
    sections = courseSections(items, courseId),
    allLessons = courseSessions(items, courseId),
    legacy = allLessons.filter((s) => isLegacyTutorial(s.id)),
    sessions = orderedTeachingSessions(
      allLessons.map((s) => ({ ...s, document: documents[s.id]?.document })),
    );
  const canPublish =
    !!course?.published_version &&
    sections.some((s) => s.id === editing?.parent_id && s.published_version > 0);
  const update = (patch: Partial<LearningDocument>) =>
    setEditing((current) =>
      current ? { ...current, document: { ...current.document, ...patch } } : current,
    );
  const add = async () => {
    if (!course || editing || busy || loading) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let section = sections.find((s) => s.published_version > 0);
      if (!section) {
        if (!course.published_version)
          throw Error('Publish this course in Courses & lessons before adding published sessions.');
        if (
          !window.confirm(
            'This course has no published session section. Create an empty published “Learning Sessions” section? Existing course content stays unchanged; your new session remains a draft until you publish it.',
          )
        )
          return;
        const sectionId = crypto.randomUUID();
        await adminRPC('manage_learning_save', {
          p_id: sectionId,
          p_kind: 'section',
          p_parent: course.id,
          p_revision: null,
          p_document: { title: 'Learning Sessions', body: '', links: [] },
          p_publish: true,
        });
        section = {
          id: sectionId,
          kind: 'section',
          parent_id: course.id,
          title: 'Learning Sessions',
          published_version: 1,
          archived_at: null,
          deleted_at: null,
        };
        setItems((rows) => [...rows, section!]);
      }
      setEditing({
        id: crypto.randomUUID(),
        kind: 'lesson',
        parent_id: section.id,
        title: '',
        revision: 0,
        published_version: 0,
        archived_at: null,
        deleted_at: null,
        document: {
          title: '',
          body: '',
          links: [],
          video_url: '',
          session_number: Math.max(0, ...sessions.map((s) => s.document?.session_number || 0)) + 1,
          display_order: Math.max(0, ...sessions.map((s) => s.document?.display_order || 0)) + 10,
        },
      });
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await adminRPC<Session>('manage_learning_edit', { p_id: id });
      if (saved.kind !== 'lesson' || !sections.some((s) => s.id === saved.parent_id))
        throw Error('Session is unavailable in this course.');
      setEditing(saved);
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const persist = async (publish: boolean) => {
    if (!editing) throw Error('Open a session first.');
    const document = {
      ...editing.document,
      video_url: driveVideo(editing.document.video_url || '')?.open || '',
    };
    await adminRPC('manage_learning_save', {
      p_id: editing.id,
      p_kind: 'lesson',
      p_parent: editing.parent_id,
      p_document: document,
      p_revision: editing.revision || null,
      p_publish: publish,
    });
    return adminRPC<Session>('manage_learning_edit', { p_id: editing.id });
  };
  const save = async (publish: boolean) => {
    if (!editing || busy) return;
    if (
      publish &&
      (!course?.published_version ||
        !sections.some((s) => s.id === editing.parent_id && s.published_version > 0))
    ) {
      setError('Publish the parent course and section before publishing this session.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice(publish ? 'Publishing session…' : 'Saving session draft…');
    try {
      const saved = await persist(publish);
      if (publish) {
        try {
          sessionStorage.removeItem(cache);
        } catch {
          /* Publishing succeeded even when device recovery storage is unavailable. */
        }
        setEditing(null);
        await load();
        setNotice(
          'Session published. Students can see its PowerPoint and video in Course Content.',
        );
      } else {
        setEditing(saved);
        setNotice('Session draft saved. You can publish it when ready.');
        await load();
      }
    } catch (e) {
      setNotice('');
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="learning-sessions">
      <div className="page-heading">
        <div>
          <h2>Learning Sessions</h2>
          <p>Upload a PowerPoint and add a recorded lecture in one session.</p>
        </div>
        <button
          className="primary"
          disabled={loading || busy || !!editing || !course || !!error}
          onClick={() => void add()}
        >
          Add Session
        </button>
      </div>
      <label className="session-course">
        Course
        <select
          aria-label="Session course"
          value={courseId}
          disabled={loading || busy || !!editing}
          onChange={(e) => {
            selectedCourse.current = e.target.value;
            setCourseId(e.target.value);
            setQuery(e.target.value ? { course: e.target.value } : {});
            setNotice('');
            setError('');
          }}
        >
          <option value="">Choose a course</option>
          {sessionCourses(items).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {!c.published_version ? ' (draft)' : ''}
            </option>
          ))}
        </select>
      </label>
      {loading && <p role="status">Loading learning sessions…</p>}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button className="outline-button" disabled={busy} onClick={() => void load()}>
            Refresh sessions
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loading && !sessionCourses(items).length && !error && (
        <p>
          No active courses are available. <Link to="/instructor/content">Create a course</Link>{' '}
          first.
        </p>
      )}
      {editing && (
        <section className="form-card session-form">
          <h3>{editing.published_version ? 'Edit Session' : 'Add Session'}</h3>
          {!canPublish && (
            <p role="status">
              You can save a draft. Publish the parent course and section in{' '}
              <Link to="/instructor/content">Courses &amp; lessons</Link> before making this session
              visible to students.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Session Title
                <input
                  required
                  maxLength={180}
                  dir="auto"
                  value={editing.document.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <SessionMaterials
                id={editing.id}
                document={editing.document}
                update={update}
                busy={busy}
                onBusy={setBusy}
                prepare={async () => {
                  const saved = await persist(false);
                  setEditing((current) =>
                    current && current.id === saved.id
                      ? {
                          ...current,
                          revision: saved.revision,
                          published_version: saved.published_version,
                        }
                      : current,
                  );
                }}
              />
              <details className="session-options">
                <summary>Advanced session settings</summary>
                <label>
                  Description
                  <textarea
                    rows={4}
                    maxLength={20000}
                    dir="auto"
                    value={editing.document.body}
                    onChange={(e) => update({ body: e.target.value })}
                  />
                </label>
                <p>
                  Saved under{' '}
                  {sections.find((s) => s.id === editing.parent_id)?.title ||
                    'this course’s session section'}
                  . Course and section organization stays unchanged.
                </p>
                {editing.document.links.map((l, i) => (
                  <div className="resource-editor" key={i}>
                    <label>
                      Resource {i + 1} title
                      <input
                        required
                        value={l.label}
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
                        required
                        type="url"
                        pattern="https://.*"
                        value={l.url}
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
                      onClick={() =>
                        update({ links: editing.document.links.filter((_, j) => j !== i) })
                      }
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
                  Add supplementary resource
                </button>
              </details>
              <div className="review-actions">
                <button className="outline-button">Save Draft</button>
                <button
                  className="primary"
                  type="button"
                  disabled={!canPublish}
                  onClick={(e) => {
                    if (e.currentTarget.form?.reportValidity()) void save(true);
                  }}
                >
                  Publish Session
                </button>
              </div>
            </fieldset>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Close this form? Changes since the last save will be discarded. Published versions and presentations stay unchanged.',
                  )
                ) {
                  try {
                    sessionStorage.removeItem(cache);
                  } catch {
                    /* Server drafts and published versions remain available. */
                  }
                  setEditing(null);
                }
              }}
            >
              Close session form
            </button>
          </form>
        </section>
      )}
      {!loading && course && !editing && (
        <div className="session-list" aria-label="Learning session list">
          <h3>Actual Teaching Sessions</h3>
          <p>
            Edit a session to replace materials or change its number and display order. Publish to
            apply draft changes.
          </p>
          {sessions.length ? (
            sessions.map((s) => (
              <article className="managed-row" key={s.id}>
                <div>
                  <h3 dir="auto">{s.title}</h3>
                  <p>
                    {s.published_version ? 'Published · Version ' + s.published_version : 'Draft'} ·{' '}
                    {sections.find((x) => x.id === s.parent_id)?.title}
                  </p>
                </div>
                <div className="review-actions">
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={() => void open(s.id)}
                  >
                    Edit Session
                  </button>
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Archive this session? It will be hidden from students. Published versions and files are retained.',
                        )
                      )
                        return;
                      setBusy(true);
                      setError('');
                      setNotice('');
                      try {
                        const record = await adminRPC<{ revision: number }>('manage_preview', {
                          p_kind: 'learning',
                          p_id: s.id,
                        });
                        await adminRPC('manage_records', {
                          p_kind: 'learning',
                          p_records: [{ id: s.id, revision: record.revision }],
                          p_action: 'archive',
                          p_reason: 'Instructor archived a teaching session',
                          p_confirmation: 'ARCHIVE 1',
                        });
                        await load();
                        setNotice('Session archived. Files and versions retained.');
                      } catch (e) {
                        setError(adminError(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Archive Session
                  </button>
                  {s.published_version > 0 && (
                    <button
                      className="outline-button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            'Unpublish this session? Students will no longer see it. Files and published history are retained.',
                          )
                        )
                          return;
                        setBusy(true);
                        setError('');
                        setNotice('');
                        try {
                          const record = await adminRPC<Session>('manage_learning_edit', {
                            p_id: s.id,
                          });
                          await adminRPC('manage_learning_unpublish', {
                            p_id: s.id,
                            p_revision: record.revision,
                          });
                          await load();
                          setNotice('Session unpublished. Files and versions retained.');
                        } catch (e) {
                          setError(adminError(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Unpublish Session
                    </button>
                  )}
                  {s.published_version > 0 && (
                    <Link className="outline-button" to={'/learn/' + s.id}>
                      View student session
                    </Link>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>No teaching sessions yet. Choose Add Session to upload your first presentation.</p>
          )}
          {!!legacy.length && (
            <details className="legacy-learning-content">
              <summary>Legacy Learning Content · {legacy.length}</summary>
              <p>
                Hidden from the student session list. Original files, lesson routes and published
                versions are retained.
              </p>
              {legacy.map((s) => (
                <article className="managed-row" key={s.id}>
                  <h4>{s.title}</h4>
                  <Link className="text-button" to={'/instructor/content?parent=' + s.parent_id}>
                    Manage legacy content
                  </Link>
                </article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
