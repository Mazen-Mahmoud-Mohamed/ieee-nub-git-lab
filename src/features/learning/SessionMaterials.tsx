import { useEffect, useState, useRef } from 'react';
import { requireBackend } from '../../services/supabase';
import { DriveVideo } from './SessionResources';
import {
  driveVideo,
  validatePresentation,
  MAX_PRESENTATION_BYTES,
  type LearningDocument,
} from './materials';
import { presentationURL, uploadPresentation } from './materialService';
export function SessionMaterials({
  id,
  document,
  update,
  prepare,
  busy,
  onBusy,
}: {
  id: string;
  document: LearningDocument;
  update: (d: Partial<LearningDocument>) => void;
  prepare: () => Promise<void>;
  busy: boolean;
  onBusy: (v: boolean) => void;
}) {
  const [draftUrl, setDraftUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => setDraftUrl(''), [document.presentation_id]);
  const [assessments, setAssessments] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    let live = true;
    void requireBackend()
      .from('assignments')
      .select('id,title')
      .eq('archived', false)
      .then((r) => {
        if (live) {
          if (r.error) setError('Related assessments could not be loaded.');
          else setAssessments(r.data || []);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const uploading = useRef(false);
  async function upload(file: File) {
    if (busy || uploading.current) return;
    uploading.current = true;
    try {
      if (!document.title.trim()) {
        setError('Enter a session name before uploading your presentation.');
        return;
      }
      if (
        document.presentation_id &&
        !window.confirm(
          'Replace the presentation in this draft? The current published version and its original file remain retained until you publish a new version.',
        )
      ) {
        return;
      }
      setSelectedFile(`${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MiB`);
      onBusy(true);
      setError('');
      setNotice('');
      setProgress(0);
      try {
        if (file.size > MAX_PRESENTATION_BYTES) throw Error('Presentation must be at most 25 MiB.');
        validatePresentation(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
        await prepare();
        const material = await uploadPresentation(id, file, setProgress);
        update({ presentation_id: material });
        setNotice('Uploaded and validated. Ready to publish.');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        onBusy(false);
        setProgress(null);
      }
    } finally {
      uploading.current = false;
    }
  }
  return (
    <section className="session-material-editor">
      <h4>PowerPoint Presentation</h4>
      <div
        className="presentation-drop"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (e.dataTransfer.files.length !== 1) {
            setError('Choose one PPTX presentation at a time.');
            return;
          }
          if (file) void upload(file);
        }}
      >
        <p>Drop a .pptx presentation here (up to 25 MiB).</p>
        <label className="presentation-input-label">
          Upload PowerPoint (.pptx, up to 25 MiB)
          <input
            className="presentation-file-input"
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            disabled={busy}
            ref={inputRef}
            onChange={async (e) => {
              const input = e.currentTarget,
                file = input.files?.[0];
              if (file) await upload(file);
              input.value = '';
            }}
          />
        </label>

        <button
          type="button"
          className="outline-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Browse Files
        </button>
        {selectedFile && <p role="status">{selectedFile}</p>}
      </div>

      {progress !== null && (
        <div role="status">
          <progress max="100" value={progress} />
          {progress}% transferred · waiting for server validation
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {document.presentation_id && (
        <details className="presentation-options">
          <summary>Presentation options</summary>
          <p>Published presentations and their files are retained.</p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (
                window.confirm(
                  'Remove this presentation from the draft? Published copies and the stored file remain retained.',
                )
              )
                update({ presentation_id: null });
            }}
          >
            Remove draft presentation
          </button>
          <button
            className="text-button"
            type="button"
            onClick={async () => {
              try {
                const url = await presentationURL(id, false, document.presentation_id!);
                setDraftUrl(url);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Get draft presentation link
          </button>
          {draftUrl && (
            <a className="outline-button" href={draftUrl} target="_blank" rel="noopener noreferrer">
              Open draft PowerPoint ↗
            </a>
          )}
        </details>
      )}

      <h4>Recorded Lecture</h4>
      <label>
        Google Drive video link
        <input
          type="url"
          value={document.video_url || ''}
          onChange={(e) => update({ video_url: e.target.value })}
        />
      </label>
      <details className="video-options">
        <summary>Video preview and sharing</summary>
        <p>Share the video with your students in Google Drive. Playback depends on Drive access.</p>
        <button
          className="outline-button"
          type="button"
          onClick={() => {
            try {
              const video = driveVideo(document.video_url || '');
              if (video) {
                update({ video_url: video.open });
                setNotice(
                  'Supported Drive file link. Check playback and sharing in the student preview.',
                );
                setError('');
              } else setNotice('No video attached.');
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Check video link
        </button>
        {document.video_url && (
          <details>
            <summary>Preview video for students</summary>
            <DriveVideo url={document.video_url} />
          </details>
        )}
      </details>
      <details className="session-options">
        <summary>Session options: order, topics and related practice</summary>{' '}
        <div className="session-numbers">
          <label>
            Session number
            <input
              type="number"
              min="0"
              max="999999"
              value={document.session_number || 0}
              onChange={(e) => update({ session_number: Number(e.target.value) })}
            />
          </label>
          <label>
            Display order
            <input
              type="number"
              min="0"
              max="999999"
              value={document.display_order || 0}
              onChange={(e) => update({ display_order: Number(e.target.value) })}
            />
          </label>
        </div>
        <label>
          Topics (one per line)
          <textarea
            dir="auto"
            rows={3}
            value={(document.topics || []).join('\n')}
            onChange={(e) => update({ topics: e.target.value.split('\n') })}
          />
        </label>
        <label>
          Related assessment (optional)
          <select
            value={document.related_assessment_id || ''}
            onChange={(e) => update({ related_assessment_id: e.target.value || null })}
          >
            <option value="">No related assessment</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <p>
          The practice button appears only when the published assessment is available to the
          student. Starting still checks deadlines and attempt limits.
        </p>
      </details>
    </section>
  );
}
