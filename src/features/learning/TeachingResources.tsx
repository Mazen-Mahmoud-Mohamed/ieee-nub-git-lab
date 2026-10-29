import { useState } from 'react';
import { Link } from 'react-router-dom';
import { driveVideo, type LearningDocument } from './materials';
import { presentationURL } from './materialService';

export function TeachingResources({
  id,
  document,
  detail = false,
}: {
  id: string;
  document: LearningDocument;
  detail?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [videoError, setVideoError] = useState(false);
  let video;
  try {
    video = driveVideo(document.video_url || '');
  } catch {
    video = null;
  }
  async function presentation(download: boolean) {
    if (busy) return;
    const tab = download ? null : window.open('about:blank', '_blank');
    if (!download && !tab) {
      setError('Allow pop-ups to open the PowerPoint, or choose Download PowerPoint.');
      return;
    }
    if (tab) tab.opener = null;
    setBusy(true);
    setError('');
    try {
      const url = await presentationURL(id, download);
      if (tab) tab.location.replace(url);
      else {
        const a = window.document.createElement('a');
        a.href = url;
        a.download = '';
        window.document.body.append(a);
        a.click();
        a.remove();
      }
    } catch {
      tab?.close();
      setError('PowerPoint could not be opened. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="teaching-resources">
      {video ? (
        detail ? (
          <section className="session-video">
            <h2>Recorded lecture</h2>
            <iframe
              title="Recorded lecture on Google Drive"
              src={video.preview}
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              onError={() => setVideoError(true)}
            />
            <a href={video.open} target="_blank" rel="noopener noreferrer">
              Open in Google Drive ↗
            </a>
            <button className="text-button" onClick={() => setVideoError((v) => !v)}>
              Video won’t play?
            </button>
            {videoError && (
              <p role="alert">
                Open the recording in Google Drive and sign into your student account. If access is
                denied, ask your instructor to share it with you.
              </p>
            )}
          </section>
        ) : (
          <Link className="primary" to={'/learn/' + id}>
            Watch Recording
          </Link>
        )
      ) : (
        <p className="material-pending">Recording coming soon.</p>
      )}
      {document.presentation_id ? (
        <div className="teaching-presentation" aria-label="PowerPoint presentation">
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => void presentation(false)}
          >
            Open PowerPoint
          </button>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => void presentation(true)}
          >
            Download PowerPoint
          </button>
          {busy && <span role="status">Opening PowerPoint…</span>}
        </div>
      ) : (
        <p className="material-pending">PowerPoint coming soon.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
