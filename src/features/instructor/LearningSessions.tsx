import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requireBackend } from '../../services/supabase';
import { SessionMaterials } from '../learning/SessionMaterials';
import { DriveVideo } from '../learning/TeachingResources';
import { RecordActions } from './RecordManagement';
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

type Session = LearningItemSummary & {
  revision: number;
  document: LearningDocument;
};
async function hierarchy() {
  const items: LearningItemSummary[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await requireBackend()
      .from('learning_items')
      .select('id,kind,parent_id,title,published_version,archived_at,deleted_at,created_at')
      .order('created_at')
      .order('id')
      .range(offset, offset + 99);
    if (error) throw error;
    items.push(...(data || []));
    if (!data || data.length < 100) return items;
  }
}
function recoveredSession(saved: Session, courseId: string): Session {
  for (const key of [
    'learning-session-editor:' + courseId,
    'learning-editor:' + saved.parent_id,
    'learning-editor:root',
  ]) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (
        cached?.id === saved.id &&
        cached.parent_id === saved.parent_id &&
        typeof cached.document?.title === 'string' &&
        typeof cached.document?.body === 'string' &&
        Array.isArray(cached.document.links) &&
        typeof cached.revision === 'number'
      )
        return {
          ...saved,
          document: cached.document,
          revision: cached.revision,
        };
    } catch {
      // The server draft is available when device recovery is unavailable.
    }
  }
  return saved;
}
function newSession(sectionId: string, sessions: Session[]): Session {
  return {
    id: crypto.randomUUID(),
    kind: 'lesson',
    parent_id: sectionId,
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
      session_number: Math.max(0, ...sessions.map((s) => s.document.session_number || 0)) + 1,
      display_order: Math.max(0, ...sessions.map((s) => s.document.display_order || 0)) + 10,
    },
  };
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
  const openedId = useRef('');
  const createdSection = useRef('');
  const originalDocument = useRef('');
  const [includeTutorials, setIncludeTutorials] = useState(false);
  const [search, setSearch] = useState('');
  const [publication, setPublication] = useState('all');
  const selectedCourse = useRef(query.get('course') || '');
  const [documents, setDocuments] = useState<Record<string, Session>>({});
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const rows = await hierarchy();
      const requestedId = query.get('open');
      const opened = requestedId
        ? await adminRPC<Session>('manage_learning_edit', { p_id: requestedId })
        : null;
      if (generation.current !== token) return;
      if (opened && opened.kind !== 'lesson') {
        setQuery({ tab: 'structure', parent: opened.id });
        return;
      }
      const requestedSection = rows.find(
        (s) => s.id === query.get('section') && s.kind === 'section',
      );
      const section = opened
        ? rows.find((s) => s.id === opened.parent_id && s.kind === 'section')
        : requestedSection;
      const destination =
        section?.parent_id ||
        defaultSessionCourse(rows, query.get('course') || selectedCourse.current);
      const lessons = courseSessions(rows, destination);
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
      if (opened && openedId.current !== opened.id) {
        openedId.current = opened.id;
        originalDocument.current = JSON.stringify(opened.document);
        const recovered = recoveredSession(opened, destination);
        setEditing(recovered);
        if (recovered !== opened)
          setNotice(
            'Recovered your session form. Save or publish checks the current server revision.',
          );
      } else if (
        query.get('new') === 'session' &&
        requestedSection &&
        createdSection.current !== requestedSection.id &&
        !requestedSection.archived_at &&
        !requestedSection.deleted_at
      ) {
        createdSection.current = requestedSection.id;
        const draft = newSession(requestedSection.id, saved);
        let recovered = draft;
        try {
          const cached = [
            'learning-session-editor:' + destination,
            'learning-editor:' + requestedSection.id,
            'learning-editor:root',
          ]
            .map((key) => JSON.parse(sessionStorage.getItem(key) || 'null'))
            .find((value) => value?.kind === 'lesson' && value.parent_id === requestedSection.id);
          if (
            cached?.kind === 'lesson' &&
            cached.parent_id === requestedSection.id &&
            typeof cached.id === 'string' &&
            typeof cached.document?.title === 'string' &&
            typeof cached.document?.body === 'string' &&
            Array.isArray(cached.document.links)
          )
            recovered = cached;
        } catch {
          /* New session creation remains available without device recovery. */
        }
        originalDocument.current = JSON.stringify(
          saved.find((s) => s.id === recovered.id)?.document || draft.document,
        );
        setEditing(recovered);
        if (recovered !== draft)
          setNotice(
            'Recovered your session form. Save or publish checks the current server revision.',
          );
      }
      if (!requestedId) openedId.current = '';
      if (!query.get('new')) createdSection.current = '';
      setError('');
    } catch (e) {
      if (generation.current === token) setError(adminError(e));
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }, [query, setQuery]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const cache = 'learning-session-editor:' + courseId;
  useEffect(() => {
    if (
      loading ||
      !courseId ||
      query.get('open') ||
      query.get('new') ||
      recoveredCourse.current === courseId
    )
      return;
    recoveredCourse.current = courseId;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cache) || 'null');
      if (
        saved?.kind === 'lesson' &&
        typeof saved.id === 'string' &&
        typeof saved.document?.title === 'string' &&
        Array.isArray(saved.document.links) &&
        courseSections(items, courseId).some((s) => s.id === saved.parent_id)
      ) {
        originalDocument.current = JSON.stringify(documents[saved.id]?.document || {});
        setEditing(saved);
        setNotice(
          'Recovered your session form. Save or publish checks the current server revision.',
        );
      }
    } catch {
      /* Saved server drafts remain available. */
    }
  }, [courseId, cache, loading, query]);
  useEffect(() => {
    if (editing)
      try {
        sessionStorage.setItem(cache, JSON.stringify(editing));
      } catch {
        setNotice('Device draft recovery is unavailable. Save your session before leaving.');
      }
  }, [editing, cache]);
  const course = items.find((c) => c.kind === 'course' && c.id === courseId),
    sections = courseSections(items, courseId),
    allLessons = courseSessions(items, courseId),
    legacy = allLessons.filter((s) => isLegacyTutorial(s.id)),
    sessions = orderedTeachingSessions(
      allLessons.map((s) => ({ ...s, document: documents[s.id]?.document })),
    );
  const visibleSessions = [
    ...sessions,
    ...(includeTutorials ? legacy.map((s) => ({ ...s, document: documents[s.id]?.document })) : []),
  ].filter(
    (s) =>
      s.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
      (publication === 'all' ||
        (publication === 'published' ? s.published_version > 0 : !s.published_version)),
  );
  const clearRecovery = () => {
    if (!editing) return;
    for (const key of [cache, 'learning-editor:' + editing.parent_id, 'learning-editor:root']) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (saved?.id === editing.id) sessionStorage.removeItem(key);
      } catch {
        /* Server content is unaffected by optional device recovery. */
      }
    }
  };
  const canPublish =
    !!course?.published_version &&
    !course.archived_at &&
    !course.deleted_at &&
    sections.some((s) => s.id === editing?.parent_id && s.published_version > 0);
  const unavailable = !!(
    editing?.archived_at ||
    editing?.deleted_at ||
    course?.archived_at ||
    course?.deleted_at ||
    items.find((s) => s.id === editing?.parent_id && (s.archived_at || s.deleted_at))
  );
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
      let section = sections.find((s) => s.published_version > 0) || sections[0];
      if (!section) {
        if (!course.published_version)
          throw Error(
            'Create and publish a section in Courses & sections before adding published sessions.',
          );
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
      const draft = newSession(section.id, Object.values(documents));
      originalDocument.current = JSON.stringify(draft.document);
      setEditing(draft);
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
      const saved = await adminRPC<Session>('manage_learning_edit', {
        p_id: id,
      });
      if (saved.kind !== 'lesson' || !sections.some((s) => s.id === saved.parent_id))
        throw Error('Session is unavailable in this course.');
      originalDocument.current = JSON.stringify(saved.document);
      setEditing(recoveredSession(saved, courseId));
      openedId.current = id;
      setQuery({ course: courseId, open: id });
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
    if (!editing || busy || unavailable) return;
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
          clearRecovery();
        } catch {
          /* Publishing succeeded even when device recovery storage is unavailable. */
        }
        setEditing(null);
        setQuery(courseId ? { course: courseId } : {});
        await load();
        setNotice(
          'Session published. Students can see its PowerPoint and video in Course Content.',
        );
      } else {
        originalDocument.current = JSON.stringify(saved.document);
        setEditing(saved);
        openedId.current = saved.id;
        setQuery({ course: courseId, open: saved.id });
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
          <h2>{course?.title || 'Learning Sessions'}</h2>
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
          No active courses are available.{' '}
          <Link to="/instructor/courses?tab=structure">Create a course</Link> first.
        </p>
      )}
      {editing && (
        <section className="form-card session-form">
          {unavailable && (
            <p role="status">Restore this session and its parent content before editing.</p>
          )}
          {editing.revision > 0 && (
            <RecordActions
              kind="learning"
              id={editing.id}
              changed={() => {
                clearRecovery();
                openedId.current = '';
                void load();
              }}
            />
          )}
          <h3>{editing.published_version ? 'Edit Session' : 'Add Session'}</h3>
          {!canPublish && (
            <p role="status">
              You can save a draft. Publish the parent course and section in{' '}
              <Link to="/instructor/courses?tab=structure">Courses &amp; sections</Link> before
              making this session visible to students.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <fieldset disabled={busy || unavailable}>
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
                busy={busy || unavailable}
                onBusy={setBusy}
                advanced={
                  <>
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
                            maxLength={100}
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
                            maxLength={2000}
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
                            update({
                              links: editing.document.links.filter((_, j) => j !== i),
                            })
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
                        update({
                          links: [...editing.document.links, { label: '', url: '' }],
                        })
                      }
                    >
                      Add supplementary resource
                    </button>
                  </>
                }
                prepare={async () => {
                  const saved = await persist(false);
                  originalDocument.current = JSON.stringify(saved.document);
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

              <details className="draft-session-preview">
                <summary>Preview this draft</summary>
                <h3 dir="auto">{editing.document.title || 'Untitled session'}</h3>
                <p className="written-answer" dir="auto">
                  {editing.document.body}
                </p>
                {!!editing.document.topics?.length && (
                  <ul>
                    {editing.document.topics.map((topic, i) => (
                      <li dir="auto" key={i}>
                        {topic}
                      </li>
                    ))}
                  </ul>
                )}
                {editing.document.video_url && (
                  <DriveVideo
                    key={editing.document.video_url}
                    url={editing.document.video_url}
                    deferred
                  />
                )}
                {editing.document.presentation_id && (
                  <p>
                    Download the draft PowerPoint from Presentation options to review its slides.
                  </p>
                )}
                <ul>
                  {editing.document.links
                    .filter((link) => /^https:\/\//.test(link.url))
                    .map((link, i) => (
                      <li key={i}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.label}
                        </a>
                      </li>
                    ))}
                </ul>
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
            {editing.revision > 0 && (
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    JSON.stringify(editing.document) !== originalDocument.current &&
                    !window.confirm('Discard local changes and load the saved session?')
                  )
                    return;
                  setBusy(true);
                  setError('');
                  try {
                    const saved = await adminRPC<Session>('manage_learning_edit', {
                      p_id: editing.id,
                    });
                    originalDocument.current = JSON.stringify(saved.document);
                    setEditing(saved);
                    setNotice('Loaded the latest saved session.');
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
              <>
                <Link className="outline-button" to={'/learn/' + editing.id}>
                  View student session
                </Link>
                <button
                  type="button"
                  className="outline-button"
                  disabled={busy || unavailable}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Unpublish this session? Students will no longer see it. Files and published history are retained.',
                      )
                    )
                      return;
                    setBusy(true);
                    setError('');
                    try {
                      await adminRPC('manage_learning_unpublish', {
                        p_id: editing.id,
                        p_revision: editing.revision,
                      });
                      clearRecovery();
                      setEditing(null);
                      setQuery(courseId ? { course: courseId } : {});
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
              </>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  JSON.stringify(editing.document) === originalDocument.current ||
                  window.confirm(
                    'Close this form? Changes since the last save will be discarded. Published versions and presentations stay unchanged.',
                  )
                ) {
                  try {
                    clearRecovery();
                  } catch {
                    /* Server drafts and published versions remain available. */
                  }
                  setEditing(null);
                  setQuery(courseId ? { course: courseId } : {});
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
          <div className="table-toolbar">
            <input
              aria-label="Search sessions"
              placeholder="Search sessions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Session publication"
              value={publication}
              onChange={(e) => setPublication(e.target.value)}
            >
              <option value="all">All publication states</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
            {!!legacy.length && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeTutorials}
                  onChange={(e) => setIncludeTutorials(e.target.checked)}
                />
                Include tutorial content
              </label>
            )}
          </div>
          <p>
            Edit a session to replace materials or change its number and display order. Publish to
            apply draft changes.
          </p>
          {visibleSessions.length ? (
            visibleSessions.map((s) => (
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
                  <RecordActions
                    kind="learning"
                    id={s.id}
                    changed={() => {
                      void load();
                      setNotice('Session management completed.');
                    }}
                  />
                  {s.published_version > 0 && (
                    <Link className="outline-button" to={'/learn/' + s.id}>
                      View student session
                    </Link>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p>No sessions match these filters. Clear your filters or choose Add Session.</p>
          )}
        </div>
      )}
    </section>
  );
}
