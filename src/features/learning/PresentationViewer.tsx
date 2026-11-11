import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Maximize,
  Minimize,
} from 'lucide-react';
import type { PptxViewer } from '@aiden0z/pptx-renderer';
import { presentationBytes } from './materialService';

function fitSlide(
  viewer: PptxViewer,
  viewport: HTMLDivElement,
  canvas: HTMLDivElement,
  zoom: number,
) {
  const style = getComputedStyle(viewport);
  // Ignore scrollbars while zooming, but fit inside the actual visible area at 100%.
  const width =
    (zoom === 100
      ? viewport.clientWidth
      : viewport.offsetWidth -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth)) -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  const height =
    (zoom === 100
      ? viewport.clientHeight
      : viewport.offsetHeight -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth)) -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);
  if (width <= 0 || height <= 0 || !viewer.slideWidth || !viewer.slideHeight) return;
  const ratio = viewer.slideWidth / viewer.slideHeight;
  const fittedWidth = Math.floor((Math.min(width, height * ratio) * zoom) / 100);
  canvas.style.width = `${fittedWidth}px`;
  canvas.style.height = `${fittedWidth / ratio}px`;
}

export function PresentationViewer({
  id,
  title,
  active = true,
  download,
  downloading,
  downloadError,
}: {
  id: string;
  title: string;
  active?: boolean;
  download: () => void;
  downloading: boolean;
  downloadError: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const viewer = useRef<PptxViewer>(null);
  const generation = useRef(0);
  const rendering = useRef(false);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const fullscreenPending = useRef(false);
  const [total, setTotal] = useState(0);
  const [slide, setSlide] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState('');
  const [slideError, setSlideError] = useState('');
  const [warning, setWarning] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const expanded = nativeFullscreen || fallbackFullscreen;
  const positionKey = 'learning-slide:' + id;

  useEffect(() => {
    const abort = new AbortController();
    generation.current += 1;
    rendering.current = false;
    let deck: PptxViewer | undefined;
    setBusy(false);
    setTotal(0);
    setSlide(0);
    setZoom(100);
    setWarning(false);
    setError('');
    setSlideError('');
    if (mount.current) {
      mount.current.style.width = '';
      mount.current.style.height = '';
    }
    void (async () => {
      const [bytes, renderer] = await Promise.all([
        presentationBytes(id, abort.signal),
        import('@aiden0z/pptx-renderer'),
      ]);
      if (abort.signal.aborted || !mount.current) return;
      deck = new renderer.PptxViewer(mount.current, {
        fitMode: 'contain',
        externalMedia: 'block',
        pdfjs: false,
        zipLimits: renderer.RECOMMENDED_ZIP_LIMITS,
        lazyMedia: true,
        lazySlides: true,
        onNodeError: () => {
          if (!abort.signal.aborted) setWarning(true);
        },
        onSlideError: () => {
          if (!abort.signal.aborted)
            setSlideError(
              'This slide could not be rendered. Try another slide or download the PowerPoint.',
            );
        },
      });
      await deck.open(bytes, { renderMode: 'slide', signal: abort.signal });
      if (abort.signal.aborted) return;
      if (!deck.slideCount) throw Error('This presentation contains no viewable slides.');
      let saved = 0;
      try {
        const value = Number(sessionStorage.getItem(positionKey));
        if (Number.isInteger(value) && value >= 0) saved = Math.min(value, deck.slideCount - 1);
      } catch {
        // Browsing slides still works when this browser cannot retain a position.
      }
      if (viewport.current && mount.current) fitSlide(deck, viewport.current, mount.current, 100);
      await deck.goToSlide(saved);
      if (abort.signal.aborted) return;
      viewer.current = deck;
      setSlide(saved);
      setTotal(deck.slideCount);
    })().catch((cause) => {
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : 'This presentation could not be displayed.',
        );
    });
    return () => {
      abort.abort();
      generation.current += 1;
      rendering.current = false;
      viewer.current = null;
      deck?.destroy();
    };
  }, [id, positionKey, retry]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !total || !active) return;
    const fit = () => {
      if (viewer.current && mount.current) fitSlide(viewer.current, element, mount.current, zoom);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [total, active, zoom, expanded]);

  useEffect(() => {
    const element = panel.current;
    let ownedFullscreen = false;
    const update = () => {
      const isFullscreen = document.fullscreenElement === element;
      setNativeFullscreen(isFullscreen);
      if (isFullscreen) viewport.current?.focus({ preventScroll: true });
      else if (ownedFullscreen && previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
      ownedFullscreen = isFullscreen;
    };
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!fallbackFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewport.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, [fallbackFullscreen]);

  useEffect(() => {
    if (active) return;
    setFallbackFullscreen(false);
    if (document.fullscreenElement === panel.current)
      void document.exitFullscreen().catch(() => {});
  }, [active]);

  async function navigate(next: number) {
    const deck = viewer.current;
    if (!deck || rendering.current || next < 0 || next >= total || next === slide) return;
    const currentGeneration = generation.current;
    const isCurrent = () => generation.current === currentGeneration && viewer.current === deck;
    rendering.current = true;
    setBusy(true);
    setSlideError('');
    setWarning(false);
    try {
      await deck.goToSlide(next);
      if (!isCurrent()) return;
      setSlide(next);
      if (viewport.current) viewport.current.scrollTo(0, 0);
      try {
        sessionStorage.setItem(positionKey, String(next));
      } catch {
        // In-memory slide position is retained while this session is open.
      }
    } catch {
      if (isCurrent())
        setSlideError(
          'This slide could not be rendered. Try another slide or download the PowerPoint.',
        );
    } finally {
      if (isCurrent()) {
        rendering.current = false;
        setBusy(false);
      }
    }
  }

  async function changeZoom(value: number) {
    const deck = viewer.current;
    if (!deck || rendering.current || !viewport.current || !mount.current) return;
    const currentGeneration = generation.current;
    const isCurrent = () => generation.current === currentGeneration && viewer.current === deck;
    rendering.current = true;
    setBusy(true);
    setSlideError('');
    try {
      fitSlide(deck, viewport.current, mount.current, value);
      await deck.renderSlide(slide);
      if (!isCurrent()) return;
      setZoom(value);
      viewport.current?.scrollTo(0, 0);
    } catch {
      if (isCurrent()) {
        if (viewport.current && mount.current)
          fitSlide(deck, viewport.current, mount.current, zoom);
        setSlideError('Zoom could not be changed. Try again or choose Fit slide.');
      }
    } finally {
      if (isCurrent()) {
        rendering.current = false;
        setBusy(false);
      }
    }
  }

  async function fullscreen() {
    const element = panel.current;
    if (!element || fullscreenPending.current) return;
    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      return;
    }
    fullscreenPending.current = true;
    const exiting = document.fullscreenElement === element;
    try {
      if (exiting) await document.exitFullscreen();
      else {
        previousFocus.current = fullscreenButton.current;
        setZoom(100);
        viewport.current?.scrollTo(0, 0);
        if (typeof element.requestFullscreen !== 'function') throw Error('Use expanded view');
        await element.requestFullscreen();
      }
    } catch {
      if (element.isConnected) {
        if (exiting)
          setSlideError('Use Escape or your browser fullscreen control to leave fullscreen.');
        else setFallbackFullscreen(true);
      }
    } finally {
      fullscreenPending.current = false;
    }
  }

  return (
    <section
      ref={panel}
      className={'study-slide-viewer slide-panel' + (fallbackFullscreen ? ' is-expanded' : '')}
      role={fallbackFullscreen ? 'dialog' : undefined}
      aria-modal={fallbackFullscreen || undefined}
      aria-label="PowerPoint slides"
      onKeyDown={(event) => {
        if (fallbackFullscreen && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setFallbackFullscreen(false);
          return;
        }
        if (fallbackFullscreen && event.key === 'Tab') {
          const focusable = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
            ) || [],
          ).filter(
            (element) =>
              !element.matches(':disabled') &&
              !element.closest('[inert]') &&
              element.getClientRects().length > 0,
          );
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
          return;
        }
        if (
          !active ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (event.target instanceof HTMLElement &&
            (event.target.matches('input, textarea, select') || event.target.isContentEditable))
        )
          return;
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          void navigate(
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? total - 1
                : slide + (event.key === 'ArrowRight' ? 1 : -1),
          );
        }
      }}
    >
      <header className="slide-viewer-heading">
        <h2>PowerPoint slides</h2>
        <button
          type="button"
          className="text-button slide-download"
          onClick={download}
          disabled={downloading}
        >
          <Download size={16} aria-hidden="true" />
          {downloading ? 'Preparing download…' : 'Download PPTX'}
        </button>
      </header>
      <div
        ref={viewport}
        className="slide-viewport"
        role="region"
        aria-label="Slide viewport"
        aria-description="Use Left and Right arrow keys to change slides, Home for the first slide, and End for the last slide."
        aria-busy={busy || (!total && !error)}
        tabIndex={0}
      >
        {!total && !error && (
          <div className="slide-loading" role="status">
            <LoaderCircle size={24} aria-hidden="true" />
            <span>Loading slides…</span>
          </div>
        )}
        {error && (
          <div className="slide-message slide-load-error" role="alert">
            <p>{error}</p>
            <button
              className="outline-button"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry preview
            </button>
          </div>
        )}
        <div
          ref={mount}
          className="slide-canvas"
          inert
          style={{
            visibility: total ? 'visible' : 'hidden',
            position: total ? undefined : 'absolute',
          }}
          aria-label={total ? `${title} · Slide ${slide + 1} of ${total}` : undefined}
        />
      </div>
      {!!total && (
        <div className="slide-controls" aria-label="Presentation controls">
          <div className="slide-navigation">
            <button
              type="button"
              className="outline-button"
              disabled={!slide || busy}
              onClick={() => void navigate(slide - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" /> Previous
            </button>
            <output
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Slide ${slide + 1} of ${total}`}
            >
              {slide + 1} / {total}
            </output>
            <button
              type="button"
              className="outline-button"
              disabled={slide + 1 >= total || busy}
              onClick={() => void navigate(slide + 1)}
            >
              Next <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="slide-display-controls">
            <select
              aria-label="Slide zoom"
              disabled={busy}
              value={zoom}
              onChange={(event) => void changeZoom(Number(event.target.value))}
            >
              <option value={100}>Fit slide</option>
              <option value={125}>Zoom 125%</option>
              <option value={150}>Zoom 150%</option>
              <option value={200}>Zoom 200%</option>
            </select>
            <button
              ref={fullscreenButton}
              type="button"
              className="outline-button"
              aria-label="Toggle fullscreen"
              aria-pressed={expanded}
              disabled={busy}
              onClick={() => void fullscreen()}
            >
              {expanded ? (
                <Minimize size={18} aria-hidden="true" />
              ) : (
                <Maximize size={18} aria-hidden="true" />
              )}
              <span>{expanded ? 'Exit fullscreen' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>
      )}
      {slideError && (
        <p className="slide-message" role="alert">
          {slideError}
        </p>
      )}
      {downloadError && (
        <p className="slide-message" role="alert">
          {downloadError}
        </p>
      )}
      {warning ? (
        <p className="slide-message" role="status">
          Some slide elements could not be displayed. Download the original for the full slide.
        </p>
      ) : (
        <details className="slide-preview-note">
          <summary>About this preview</summary>
          <p className="slide-keyboard-hint">
            Use ← / → to change slides, Home for the first, and End for the last. Zoom in to scroll
            around a slide; choose Fit slide to see it all.
          </p>
          <p>
            Slides are shown as a static preview. Animations, linked media and some fonts may
            differ. The original PowerPoint download includes all presentation features.
          </p>
        </details>
      )}
    </section>
  );
}
