import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TerminalSquare } from 'lucide-react';
import type { Lab } from '../../hooks/useLab';
const readableError = (value: string) =>
  value
    .replace(
      /^ENOENT: (.*)$/,
      'Could not find $1. Check the path and create the file or folder first.',
    )
    .replace(
      /^EEXIST: (.*)$/,
      '$1 already exists. Choose a different name or open the existing item.',
    )
    .replace(/^ENOTDIR: (.*)$/, '$1 is not a folder. Check the path.');
const commands = [
  'git status',
  'git add ',
  'git commit -m "',
  'git log --oneline',
  'git branch',
  'git switch ',
  'git merge ',
  'git config --global ',
  'git init',
  'git --version',
  'mkdir ',
  'touch ',
  'cat ',
  'echo ',
  'ls -a',
  'pwd',
  'help',
  'clear',
];
export function Terminal({ lab }: { lab: Lab }) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [cleared, setCleared] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [visibleHeight, setVisibleHeight] = useState(
    () => window.visualViewport?.height || window.innerHeight,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const resize = () => {
      setMobile(media.matches);
      setVisibleHeight(window.visualViewport?.height || window.innerHeight);
      if (document.activeElement === field.current)
        requestAnimationFrame(() => field.current?.scrollIntoView({ block: 'nearest' }));
    };
    media.addEventListener('change', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      media.removeEventListener('change', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [lab.revision, cleared]);
  const events = lab.engine.events.slice(cleared);
  return (
    <section
      className="terminal"
      dir="ltr"
      style={{ '--visible-viewport-height': visibleHeight + 'px' } as CSSProperties}
    >
      <header className="lab-terminal-header">
        <h2>
          <TerminalSquare size={18} aria-hidden="true" /> Git terminal
        </h2>
        <button className="text-button" onClick={() => setCleared(lab.engine.events.length)}>
          Clear terminal
        </button>
      </header>
      <div
        className="terminal-body"
        ref={scroll}
        onClick={() => {
          if (!window.getSelection()?.toString()) field.current?.focus();
        }}
      >
        {!events.length && (
          <p className="lab-terminal-empty">
            Type below and press Run. Use <code>help</code> to see supported commands.
          </p>
        )}
        <div role="log" aria-label="Terminal output" aria-live="polite">
          {events.map((event, i) => (
            <div className="terminal-event" key={i}>
              <div>
                {!event.success && <small className="command-result">Failed</small>}
                <span className="prompt-user">student@ieee-nub</span>{' '}
                <span className="prompt-path">{event.branch}</span>{' '}
                <span className="prompt-symbol">$</span> {event.command}
              </div>
              {event.output !== '\x1bCLEAR' && (
                <pre className={event.success ? '' : 'terminal-error'}>
                  {event.success ? event.output : readableError(event.output)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
      <form
        className="terminal-command-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input.trim() || lab.busy || lab.readOnly) return;
          const value = input;
          setInput('');
          const h = [...history, value];
          setHistory(h);
          setCursor(h.length);
          if (value === 'clear') setCleared(lab.engine.events.length + 1);
          await lab.command(value);
          requestAnimationFrame(() => field.current?.focus());
        }}
      >
        <div className="terminal-location">
          <span className="prompt-user">student@ieee-nub</span>{' '}
          <span className="prompt-path">{lab.engine.cwd}</span>{' '}
          <span className="prompt-branch">({lab.view.branch})</span>
        </div>
        <label className="terminal-prompt" htmlFor="command">
          <span className="prompt-symbol">$</span>
          <input
            id="command"
            ref={field}
            aria-label="Terminal command"
            placeholder="Type a Git command…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            enterKeyHint="go"
            onFocus={() => {
              if (window.matchMedia('(max-width:900px)').matches)
                requestAnimationFrame(() => field.current?.scrollIntoView({ block: 'nearest' }));
            }}
            spellCheck={false}
            value={input}
            disabled={lab.busy || lab.readOnly}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                const next = Math.max(0, cursor - 1);
                setCursor(next);
                setInput(history[next] || '');
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.min(history.length, cursor + 1);
                setCursor(next);
                setInput(history[next] || '');
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const options = commands.filter((c) => c.startsWith(input));
                if (options.length === 1) setInput(options[0]);
              }
              if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                setCleared(lab.engine.events.length);
              }
            }}
          />
        </label>
        <button
          type="submit"
          className="terminal-run"
          disabled={lab.busy || lab.readOnly || !input.trim()}
        >
          {lab.busy ? 'Running…' : 'Run'}
        </button>
      </form>
      {mobile && (
        <div className="terminal-helpers" aria-label="Command helpers">
          <button
            type="button"
            disabled={!history.length || lab.busy || lab.readOnly}
            onClick={() => {
              const next = Math.max(0, cursor - 1);
              setCursor(next);
              setInput(history[next] || '');
              field.current?.focus();
            }}
          >
            Previous command
          </button>
          <button
            type="button"
            disabled={cursor >= history.length || lab.busy || lab.readOnly}
            onClick={() => {
              const next = Math.min(history.length, cursor + 1);
              setCursor(next);
              setInput(history[next] || '');
              field.current?.focus();
            }}
          >
            Next command
          </button>
          {['git ', ' -m ', '"', '/', '-', '>'].map((symbol) => (
            <button
              type="button"
              key={symbol}
              aria-label={'Insert ' + symbol}
              disabled={lab.busy || lab.readOnly}
              onClick={() => {
                const start = field.current?.selectionStart ?? input.length,
                  end = field.current?.selectionEnd ?? start;
                setInput(input.slice(0, start) + symbol + input.slice(end));
                requestAnimationFrame(() => {
                  field.current?.focus();
                  field.current?.setSelectionRange(start + symbol.length, start + symbol.length);
                });
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
