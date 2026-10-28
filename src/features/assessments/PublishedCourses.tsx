import { SessionResources } from '../learning/SessionResources';
import type { LearningDocument } from '../learning/materials';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
type Catalog = {
  parent: { id: string; parent_id: string | null; document: Content } | null;
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
    setError('');
    void supabase
      .rpc('learning_catalog', { p_parent: contentId || null, p_offset: page * 25, p_limit: 25 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error)
          setError(
            'Course materials could not be loaded. They may be archived or not yet published.',
          );
        else setData(data && Array.isArray(data.rows) ? data : null);
        setLoading(false);
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
          <Link to={data?.parent?.parent_id ? '/learn/' + data.parent.parent_id : '/learn'}>
            ← Back to learning
          </Link>
          <h1 dir="auto">{data?.parent?.document.title || 'Course materials'}</h1>
        </>
      ) : (
        <h2>Learning Sessions · Course Content</h2>
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
      {data?.parent && (
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
        data?.rows.map((r) => (
          <article className="managed-row" key={r.id}>
            <h3 dir="auto">
              {r.document.session_number ? `Session ${r.document.session_number} — ` : ''}
              {r.document.title}
            </h3>
            <p dir="auto">{r.document.body.slice(0, 180)}</p>
            <Link className="outline-button" to={'/learn/' + r.id}>
              Open {r.kind}
            </Link>
          </article>
        ))}
      {!loading && !error && !data?.rows.length && !contentId && (
        <p>
          No courses are published yet. Ask your instructor about learning materials; the practice
          lab is still available.
        </p>
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
