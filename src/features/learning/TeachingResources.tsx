import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  Presentation,
  Video,
  ExternalLink,
  LoaderCircle,
  Play,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { driveVideo, type LearningDocument } from './materials';
import { presentationURL } from './materialService';

export function sessionLabel(title: string, number?: number) {
  if (!number) return '';
  const label = `Session ${number}`;
  return new RegExp(`^${label}\\b`, 'i').test(title.trim()) ? '' : label;
}

export function usePresentationDownload(id: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const url = await presentationURL(id, true);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = '';
      window.document.body.append(link);
      link.click();
      link.remove();
    } catch {
      setError(
        'The PowerPoint could not be downloaded. Sign in again or ask your instructor for access.',
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, download };
}

export function TeachingResources({ id, document }: { id: string; document: LearningDocument }) {
  const { busy, error, download } = usePresentationDownload(id);
  return (
    <div className="teaching-resources">
      <Link className="primary session-open" to={'/learn/' + id}>
        <span>Open session</span>
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
      {document.presentation_id && (
        <div className="teaching-presentation">
          <Link className="text-button" to={'/learn/' + id + '?resource=slides'}>
            <Presentation size={17} aria-hidden="true" /> View slides
          </Link>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void download()}
          >
            <Download size={16} aria-hidden="true" />
            {busy ? 'Preparing…' : 'Download PowerPoint'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function DriveVideo({
  url,
  deferred = false,
  title = 'Recorded lecture',
}: {
  url: string;
  deferred?: boolean;
  title?: string;
}) {
  const [load, setLoad] = useState(!deferred);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!load || loaded) return;
    const timer = setTimeout(() => setHelp(true), 15000);
    return () => clearTimeout(timer);
  }, [load, loaded, retry]);
  let video;
  try {
    video = driveVideo(url);
  } catch {
    return <p role="status">Recording link unavailable. Ask your instructor to update it.</p>;
  }
  if (!video) return null;
  return (
    <section className="session-video" aria-label="Recorded lecture">
      <div className="lecture-heading">
        <div>
          <Video size={18} aria-hidden="true" />
          <h2>Recorded lecture</h2>
        </div>
        <span>Google Drive</span>
      </div>
      <div className="video-stage">
        {load ? (
          <>
            {!loaded && (
              <div className="video-loading" role="status">
                <LoaderCircle size={24} aria-hidden="true" />
                <span>Loading recording…</span>
                <small>Connecting to Google Drive</small>
              </div>
            )}
            <iframe
              key={retry}
              title="Recorded lecture on Google Drive"
              src={video.preview}
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              aria-label={title + ' — recorded lecture on Google Drive'}
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(true);
                setHelp(true);
              }}
            />
          </>
        ) : (
          <button type="button" className="outline-button" onClick={() => setLoad(true)}>
            <Play size={18} aria-hidden="true" /> Load recorded lecture
          </button>
        )}
      </div>
      <div className="lecture-links">
        <a href={video.open} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" /> Open in Google Drive ↗
        </a>
        <button
          type="button"
          className="text-button"
          onClick={() => setHelp((value) => !value)}
          aria-expanded={help}
        >
          Video won’t play?
        </button>
      </div>
      {help && (
        <div className="video-help">
          <p>
            Open the recording in Google Drive and sign in with the account your instructor shared
            it with.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setLoad(true);
              setLoaded(false);
              setRetry((value) => value + 1);
            }}
          >
            Reload player
          </button>
        </div>
      )}
    </section>
  );
}
