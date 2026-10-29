import { SessionResources } from '../learning/SessionResources';
import { TeachingResources } from '../learning/TeachingResources';
import { isLegacyTutorial, orderedTeachingSessions } from '../learning/teachingSessions';
import type { LearningDocument } from '../learning/materials';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
type Catalog = {
  parent: { id: string; parent_id: string | null; kind?: string; document: Content } | null;
  flattened?: boolean;
  courseId?: string;
  total: number;
  rows: Array<{ id: string; kind: string; document: Content }>;
};
type Content = LearningDocument;
export function PublishedCourses({ standalone = false }: { standalone?: boolean }) {
  const { contentId } = useParams();
  const [page, setPage] = useState(0),
    [data, setData] = useState<Catalog | null>(null),
    [loading, setLoading] = useState(!!supabase),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
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
      const rows: Catalog['rows'] = [];
      for (let offset = 0; ; offset += 100) {
        const p = await catalog(parent, offset, 100);
        rows.push(...p.rows);
        if (offset + p.rows.length >= p.total || !p.rows.length) return rows;
      }
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
      }
      if (next.parent?.kind === 'course') {
        const sections = await children(next.parent.id);
        const lessons = (
          await Promise.all(sections.filter((s) => s.kind === 'section').map((s) => children(s.id)))
        )
          .flat()
          .filter((s) => s.kind === 'lesson');
        const teaching = orderedTeachingSessions(lessons);
        next = { ...next, rows: teaching, total: teaching.length, flattened: true };
      } else if (next.parent?.kind === 'section') {
        const teaching = orderedTeachingSessions(await children(next.parent.id));
        next = { ...next, rows: teaching, total: teaching.length, flattened: true };
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
  return (
    <section className={standalone ? 'page narrow published-course' : 'published-course'}>
      {standalone ? (
        <>
          <Link to={data?.courseId ? '/learn/' + data.courseId : '/learn'}>
            ← Back to Course Content
          </Link>
          <h1 dir="auto">{data?.parent?.document.title || 'Course Content'}</h1>
        </>
      ) : (
        <h2 dir="auto">{data?.parent?.document.title || 'Courses'}</h2>
      )}
      {loading && <p role="status">Loading courses…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {error && (
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          Retry course materials
        </button>
      )}
      {data?.parent?.kind === 'lesson' && !isLegacyTutorial(data.parent.id) && (
        <TeachingResources id={data.parent.id} document={data.parent.document} detail />
      )}
      {data?.parent?.kind === 'lesson' && isLegacyTutorial(data.parent.id) && (
        <>
          <p className="written-answer" dir="auto">
            {data.parent.document.body}
          </p>
          <SessionResources id={data.parent.id} document={data.parent.document} />
          <ul>
            {data.parent.document.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {!loading &&
        !error &&
        data?.parent &&
        ['course', 'section'].includes(data.parent.kind || '') &&
        !data.rows.length && <p>No sessions available yet.</p>}
      <div className={data?.flattened ? 'teaching-session-grid' : ''}>
        {!loading &&
          !error &&
          (data?.flattened ? data.rows.slice(page * 25, (page + 1) * 25) : data?.rows)?.map(
            (r, index) => (
              <article
                className={r.kind === 'lesson' ? 'teaching-session-card' : 'managed-row'}
                key={r.id}
              >
                {r.kind === 'lesson' && (
                  <p className="session-number">
                    Session {r.document.session_number || page * 25 + index + 1}
                  </p>
                )}
                <h3 dir="auto">
                  <Link to={'/learn/' + r.id}>{r.document.title}</Link>
                </h3>
                {r.kind === 'lesson' ? (
                  <TeachingResources id={r.id} document={r.document} />
                ) : (
                  <Link className="outline-button" to={'/learn/' + r.id}>
                    View sessions
                  </Link>
                )}
              </article>
            ),
          )}
      </div>
      {!loading && !error && !data?.parent && !data?.rows.length && !contentId && (
        <p>No sessions available yet.</p>
      )}
      {data && data.total > 25 && (
        <div className="review-actions">
          <button
            className="outline-button"
            disabled={page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            Previous materials
          </button>
          <button
            className="outline-button"
            disabled={(page + 1) * 25 >= data.total}
            onClick={() => setPage((n) => n + 1)}
          >
            Next materials
          </button>
        </div>
      )}
    </section>
  );
}
