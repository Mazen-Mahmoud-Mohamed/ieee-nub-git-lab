import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { driveVideo, type LearningDocument } from './materials';
import { presentationURL } from './materialService';
export function DriveVideo({ url }: { url: string }) {
  const [load, setLoad] = useState(false);
  let video;
  try {
    video = driveVideo(url);
  } catch {
    return <p>Video link is unavailable. Ask your instructor to update it.</p>;
  }
  if (!video) return null;
  return (
    <section className="session-video">
      <h2>Recorded lecture</h2>
      {load ? (
        <iframe
          title="Recorded lecture on Google Drive"
          src={video.preview}
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      ) : (
        <button className="outline-button" onClick={() => setLoad(true)}>
          Load recorded lecture
        </button>
      )}
      <p>
        Google Drive controls playback and access. If the player asks for access or cannot load, use
        the original link or contact your instructor.
      </p>
      <a className="outline-button" href={video.open} target="_blank" rel="noopener noreferrer">
        Open in Google Drive ↗
      </a>
    </section>
  );
}
export function SessionResources({ id, document }: { id: string; document: LearningDocument }) {
  const [urls, setUrls] = useState<{ open: string; download: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [related, setRelated] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    let live = true;
    setUrls(null);
    setRelated(null);
    if (supabase)
      void supabase.rpc('learning_related_activity', { p_item: id }).then((r) => {
        if (live && !r.error) setRelated(r.data);
      });
    return () => {
      live = false;
    };
  }, [id, document.presentation_id]);
  return (
    <div className="session-resources">
      {!!document.topics?.length && (
        <section>
          <h2>Topics covered</h2>
          <ul>
            {document.topics.filter(Boolean).map((topic, i) => (
              <li key={i} dir="auto">
                {topic}
              </li>
            ))}
          </ul>
        </section>
      )}
      {document.video_url && <DriveVideo key={document.video_url} url={document.video_url} />}
      {document.presentation_id && (
        <section>
          <h2>PowerPoint presentation</h2>
          <p>Access the original .pptx file. Your phone may need a compatible presentation app.</p>
          <button
            className="outline-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const [open, download] = await Promise.all([
                  presentationURL(id),
                  presentationURL(id, true),
                ]);
                setUrls({ open, download });
              } catch {
                setError(
                  'Presentation could not be opened. It may be restricted, unpublished or temporarily unavailable. Retry or contact your instructor.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? 'Preparing presentation…'
              : urls
                ? 'Refresh presentation links'
                : 'Get presentation links'}
          </button>
          {urls && (
            <div className="review-actions">
              <a
                className="outline-button"
                href={urls.open}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open PowerPoint ↗
              </a>
              <a className="primary" href={urls.download}>
                Download PowerPoint
              </a>
              <small>Links expire after two minutes. Refresh them if needed.</small>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      {related ? (
        <Link className="primary" to={'/assessments/' + related.id}>
          Practice What You Learned · {related.title}
        </Link>
      ) : document.related_assessment_id ? (
        <p>
          Related practice is shown when you are signed in and it is available under the assessment
          policy. Check My learning for your attempts.
        </p>
      ) : null}
    </div>
  );
}
