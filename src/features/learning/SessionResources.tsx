import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Presentation, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import type { LearningDocument } from './materials';
import { DriveVideo, usePresentationDownload } from './TeachingResources';

const Viewer = lazy(() =>
  import('./PresentationViewer').then((module) => ({ default: module.PresentationViewer })),
);

export function SessionResources({ id, document }: { id: string; document: LearningDocument }) {
  const [search, setSearch] = useSearchParams();
  const memoryKey = 'learning-resource:' + id;
  const initial = () => {
    let saved = '';
    try {
      saved = sessionStorage.getItem(memoryKey) || '';
    } catch {
      /* Browser storage is optional. */
    }
    const requested = search.get('resource') || saved;
    return requested === 'slides' && document.presentation_id
      ? 'slides'
      : document.video_url
        ? 'video'
        : 'slides';
  };
  const [tab, setTab] = useState(initial);
  const [visitedSlides, setVisitedSlides] = useState(tab === 'slides');
  const tabs = useRef<HTMLDivElement>(null);
  const { busy, error, download } = usePresentationDownload(id);
  const [related, setRelated] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(memoryKey, tab);
    } catch {
      // Resource navigation also works when browser storage is unavailable.
    }
  }, [memoryKey, tab]);
  function select(next: string) {
    setTab(next);
    if (next === 'slides') setVisitedSlides(true);
    try {
      sessionStorage.setItem(memoryKey, next);
    } catch {
      /* Keep navigation available without storage. */
    }
    setSearch(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.set('resource', next);
        return updated;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  useEffect(() => {
    const resource = search.get('resource');
    if (resource === 'video' || resource === 'slides') {
      setTab(resource);
      if (resource === 'slides') setVisitedSlides(true);
    }
  }, [search]);
  useEffect(() => {
    let live = true;
    setRelated(null);
    if (supabase)
      void supabase.rpc('learning_related_activity', { p_item: id }).then((result) => {
        if (live && !result.error) setRelated(result.data);
      });
    return () => {
      live = false;
    };
  }, [id]);
  const topics = document.topics?.filter(Boolean) || [];
  return (
    <div className="lesson-resources">
      <div ref={tabs} role="tablist" aria-label="Lesson resources" className="lesson-tabs">
        {[
          { value: 'video', label: 'Video', icon: Video },
          { value: 'slides', label: 'Slides', icon: Presentation },
        ].map(({ value, label, icon: Icon }, index) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={'resource-tab-' + value}
            aria-controls={'resource-panel-' + value}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => select(value)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
              select(next ? 'slides' : 'video');
              tabs.current?.querySelectorAll('button')[next]?.focus();
            }}
          >
            <Icon size={18} aria-hidden="true" /> {label}
          </button>
        ))}
        <span className="lesson-tabs-hint">
          {tab === 'video' ? 'Watch the lesson' : 'Study at your own pace'}
        </span>
      </div>
      <div
        id="resource-panel-video"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="resource-tab-video"
        hidden={tab !== 'video'}
      >
        {tab === 'video' &&
          (document.video_url ? (
            <DriveVideo key={document.video_url} url={document.video_url} title={document.title} />
          ) : (
            <p className="resource-empty">A recording has not been added to this session yet.</p>
          ))}
        {document.video_url && (
          <p className="video-position-note">
            Switching to Slides closes the video player. Google Drive may restart the recording when
            you return.
          </p>
        )}
      </div>
      <div
        id="resource-panel-slides"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="resource-tab-slides"
        hidden={tab !== 'slides'}
      >
        {document.presentation_id ? (
          visitedSlides && (
            <Suspense
              fallback={
                <p role="status" className="resource-empty">
                  Loading slides…
                </p>
              }
            >
              <Viewer
                key={document.presentation_id}
                id={id}
                title={document.title}
                active={tab === 'slides'}
                download={() => void download()}
                downloading={busy}
                downloadError={error}
              />
            </Suspense>
          )
        ) : (
          <p className="resource-empty">A presentation has not been added to this session yet.</p>
        )}
      </div>
      {(!!topics.length || related) && (
        <div className="lesson-notes">
          {!!topics.length && (
            <section>
              <h2>In this session</h2>
              <ul className="session-topics">
                {topics.map((topic, index) => (
                  <li key={index} dir="auto">
                    {topic}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {related && (
            <section>
              <h2>Put it into practice</h2>
              <Link className="text-button" to={'/assessments/' + related.id}>
                {related.title} →
              </Link>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
