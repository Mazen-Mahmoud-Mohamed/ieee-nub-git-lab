import { SessionResources } from '../learning/SessionResources';
import { sessionLabel, TeachingResources } from '../learning/TeachingResources';
import { isLegacyTutorial, orderedTeachingSessions } from '../learning/teachingSessions';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Presentation,
  Video,
  ListVideo,
  GitBranch,
} from 'lucide-react';
import type { LearningDocument } from '../learning/materials';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';

type ContentRow = { id: string; kind: string; document: LearningDocument };
type Catalog = {
  parent: (ContentRow & { parent_id: string | null }) | null;
  flattened?: boolean;
  courseId?: string;
  courseTitle?: string;
  sessions?: ContentRow[];
  total: number;
  rows: ContentRow[];
};

export function PublishedCourses({ standalone = false }: { standalone?: boolean }) {
  const { contentId } = useParams();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const lessonId = data?.parent?.kind === 'lesson' ? data.parent.id : undefined;
  useEffect(() => {
    if (!loading && !error && lessonId) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      heading.current?.focus({ preventScroll: true });
    }
  }, [lessonId, loading, error]);
  useEffect(() => {
    setPage(0);
  }, [contentId]);
  useEffect(() => {
    let live = true;
    if (!supabase) return;
    setLoading(true);
    setData(null);
    setError('');
    const catalog = async (parent: string | null, offset = 0, limit = 25): Promise<Catalog> => {
      const { data, error } = await supabase!.rpc('learning_catalog', {
        p_parent: parent,
        p_offset: offset,
        p_limit: limit,
      });
      if (error || !data || !Array.isArray(data.rows)) throw Error('Catalog unavailable');
      return data;
    };
    const children = async (parent: string) => {
      const rows: ContentRow[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await catalog(parent, offset, 100);
        rows.push(...result.rows);
        if (offset + result.rows.length >= result.total || !result.rows.length) return rows;
      }
    };
    const courseSessions = async (course: string) => {
      const sections = await children(course);
      const lessons = (
        await Promise.all(
          sections.filter((row) => row.kind === 'section').map((row) => children(row.id)),
        )
      )
        .flat()
        .filter((row) => row.kind === 'lesson');
      return orderedTeachingSessions(lessons);
    };
    void (async () => {
      let next = await catalog(contentId || null, contentId ? page * 25 : 0);
      if (!contentId) {
        if (next.total === 1 && next.rows[0]?.kind === 'course')
          next = await catalog(next.rows[0].id);
        else if (page) next = await catalog(null, page * 25);
      }
      if (next.parent?.kind === 'lesson') {
        const section = await catalog(next.parent.parent_id!);
        next.courseId = section.parent?.parent_id || undefined;
        if (next.courseId) {
          const course = await catalog(next.courseId);
          next.courseTitle = course.parent?.document.title;
          next.sessions = await courseSessions(next.courseId);
        }
      } else if (next.parent?.kind === 'course') {
        const sessions = await courseSessions(next.parent.id);
        next = { ...next, rows: sessions, total: sessions.length, flattened: true };
      } else if (next.parent?.kind === 'section') {
        const sessions = orderedTeachingSessions(await children(next.parent.id));
        next = { ...next, rows: sessions, total: sessions.length, flattened: true };
      }
      if (live) setData(next);
    })()
      .catch(() => {
        if (live)
          setError(
            'Course materials could not be loaded. They may be archived or not yet published.',
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [contentId, page, refresh]);
  if (!supabase && !standalone) return null;
  const parent = data?.parent;
  const lesson = parent?.kind === 'lesson';
  const sessions = data?.sessions || [];
  const current = sessions.findIndex((row) => row.id === parent?.id);
  const previous = current > 0 ? sessions[current - 1] : null;
  const next = current >= 0 ? sessions[current + 1] : null;
  const label =
    lesson && parent
      ? sessionLabel(parent.document.title, parent.document.session_number || current + 1)
      : '';
  const coursePath = data?.courseId ? '/learn/' + data.courseId : '/learn';
  return (
    <section
      className={
        (standalone ? 'page course-content published-course' : 'published-course') +
        (lesson ? ' is-lesson' : '')
      }
    >
      {loading && (
        <div className="course-loading" role="status">
          Loading course content…
        </div>
      )}
      {error && (
        <div className="course-loading">
          <p className="error" role="alert">
            {error}
          </p>
          <button className="outline-button" onClick={() => setRefresh((value) => value + 1)}>
            Retry course materials
          </button>
        </div>
      )}
      {!loading && !error && (
        <>
          <header className="course-header">
            {lesson ? (
              <div className="lesson-breadcrumb">
                <Link className="course-back" to={coursePath}>
                  <ArrowLeft size={16} aria-hidden="true" /> Back to Course
                </Link>
                <span>{data?.courseTitle}</span>
              </div>
            ) : (
              <p className="course-eyebrow">
                <BookOpen size={16} aria-hidden="true" /> IEEE NUB · Course Content
              </p>
            )}
            {label && <p className="session-number">{label}</p>}
            <h1 ref={heading} tabIndex={-1} dir="auto">
              {parent?.document.title || 'Your courses'}
            </h1>
            {(!lesson || parent?.document.body.trim()) && (
              <p className="course-description" dir="auto">
                {parent?.document.body.trim() ||
                  (lesson
                    ? 'Follow the recording or work through the slides at your own pace.'
                    : 'Your lectures and slides, together in one place.')}
              </p>
            )}
            {!lesson && data?.flattened && !!data.total && (
              <div className="course-meta">
                <span>
                  <ListVideo size={16} aria-hidden="true" />
                  {data.total} {data.total === 1 ? 'session' : 'sessions'}
                </span>
                <span>Learn at your own pace</span>
              </div>
            )}
          </header>
          {lesson && parent ? (
            <div className="lesson-shell">
              <div className="lesson-main">
                <SessionResources key={parent.id} id={parent.id} document={parent.document} />
                {isLegacyTutorial(parent.id) && !!parent.document.links.length && (
                  <ul className="lesson-links">
                    {parent.document.links.map((link, index) => (
                      <li key={index}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.label} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <nav className="lesson-step-nav" aria-label="Session navigation">
                  {previous ? (
                    <Link aria-label="Previous Session" to={'/learn/' + previous.id}>
                      <ArrowLeft size={18} aria-hidden="true" />
                      <span>
                        <small>Previous session</small>
                        <strong dir="auto">{previous.document.title}</strong>
                      </span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link aria-label="Next Session" to={'/learn/' + next.id}>
                      <span>
                        <small>Next session</small>
                        <strong dir="auto">{next.document.title}</strong>
                      </span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  )}
                </nav>
              </div>
              {!!sessions.length && (
                <aside className="course-outline">
                  <div className="course-outline-heading">
                    <h2>Course sessions</h2>
                    <span>
                      {current >= 0 ? `${current + 1} / ${sessions.length}` : sessions.length}
                    </span>
                  </div>
                  <nav aria-label="Course sessions">
                    {sessions.map((session, index) => (
                      <Link
                        key={session.id}
                        to={'/learn/' + session.id}
                        aria-current={session.id === parent.id ? 'page' : undefined}
                      >
                        <span className="outline-position" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>
                          <strong dir="auto">{session.document.title}</strong>
                          <small>
                            {session.id === parent.id
                              ? 'Currently viewing'
                              : [
                                  session.document.video_url && 'Video',
                                  session.document.presentation_id && 'Slides',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                          </small>
                        </span>
                      </Link>
                    ))}
                  </nav>
                </aside>
              )}
            </div>
          ) : (
            <>
              <div className={data?.flattened ? 'teaching-session-grid' : ''}>
                {(data?.flattened ? data.rows.slice(page * 25, (page + 1) * 25) : data?.rows)?.map(
                  (row, index) => {
                    const number = row.document.session_number || page * 25 + index + 1;
                    const label = sessionLabel(row.document.title, number);
                    return (
                      <article
                        className={row.kind === 'lesson' ? 'teaching-session-card' : 'managed-row'}
                        key={row.id}
                      >
                        {row.kind === 'lesson' && (
                          <div className="session-card-top">
                            <div className="session-identity">
                              <span className="session-index" aria-hidden="true">
                                {String(number).padStart(2, '0')}
                              </span>
                              {label && <span className="session-number">{label}</span>}
                            </div>
                            <GitBranch className="session-card-mark" size={32} aria-hidden="true" />
                          </div>
                        )}
                        <h2 dir="auto">{row.document.title}</h2>
                        {row.kind === 'lesson' && (
                          <p className="session-summary" dir="auto">
                            {row.document.body.trim() ||
                              (row.document.video_url && row.document.presentation_id
                                ? 'Watch the lecture, then revisit the key ideas in the presentation.'
                                : row.document.video_url
                                  ? 'Watch the recorded lecture at your own pace.'
                                  : row.document.presentation_id
                                    ? 'Explore the presentation, one slide at a time.'
                                    : 'Your instructor will add the learning resources here.')}
                          </p>
                        )}
                        {!!row.document.topics?.length && (
                          <ul className="session-topics" aria-label="Topics">
                            {row.document.topics.filter(Boolean).map((topic, index) => (
                              <li key={index} dir="auto">
                                {topic}
                              </li>
                            ))}
                          </ul>
                        )}
                        {row.kind === 'lesson' && (
                          <div className="session-resource-labels">
                            {row.document.video_url && (
                              <span>
                                <Video size={16} aria-hidden="true" /> Recorded lecture
                              </span>
                            )}
                            {row.document.presentation_id && (
                              <span>
                                <Presentation size={16} aria-hidden="true" /> PowerPoint slides
                              </span>
                            )}
                          </div>
                        )}
                        {row.kind === 'lesson' ? (
                          <TeachingResources id={row.id} document={row.document} />
                        ) : (
                          <Link className="outline-button" to={'/learn/' + row.id}>
                            View sessions
                          </Link>
                        )}
                      </article>
                    );
                  },
                )}
              </div>
              {!data?.rows.length && <p className="resource-empty">No sessions available yet.</p>}
              {data && data.total > 25 && (
                <div className="review-actions">
                  <button
                    className="outline-button"
                    disabled={page === 0}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous materials
                  </button>
                  <button
                    className="outline-button"
                    disabled={(page + 1) * 25 >= data.total}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next materials
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
