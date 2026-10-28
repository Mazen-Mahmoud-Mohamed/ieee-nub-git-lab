import { introductoryCommitWarning } from './commitWarning';
import { firstAssessment, type Definition } from '../assessments/model';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import type { Lab } from '../../hooks/useLab';
import { tokenize } from './parser';
function commandKind(input: string) {
  try {
    const [cmd, sub, ...args] = tokenize(input);
    if (
      ['ls', 'pwd', 'cat', 'help', 'clear'].includes(cmd) ||
      (cmd === 'git' &&
        (['status', 'log', 'show', 'diff', '--version'].includes(sub) ||
          (sub === 'branch' && !args.length) ||
          (sub === 'config' && args.filter((x) => x !== '--global').length === 1)))
    )
      return 'Read-only';
    return 'State-changing';
  } catch {
    return 'Command';
  }
}
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
export function Terminal({
  lab,
  expanded,
  onExpand,
  feedback = '',
  definition = firstAssessment,
}: {
  lab: Lab;
  expanded: boolean;
  onExpand: () => void;
  feedback?: string;
  definition?: Definition;
}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [cleared, setCleared] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [lab.revision, cleared]);
  const events = lab.engine.events.slice(cleared);
  const warning = introductoryCommitWarning(definition, lab.view);
  return (
    <section
      className="terminal"
      id="workspace-terminal"
      role="tabpanel"
      aria-labelledby="workspace-tab-terminal"
      dir="ltr"
    >
      <div className="panel-heading terminal-tabs">
        <span>
          <ChevronRight size={15} /> Git Terminal <i className="live-dot" />
        </span>
        <div>
          <span className="terminal-mode">Practice Git here</span>
          <button
            title="Clear terminal"
            aria-label="Clear terminal"
            onClick={() => setCleared(lab.engine.events.length)}
          >
            <Trash2 size={14} />
          </button>
          <button
            title={expanded ? 'Restore panels' : 'Expand terminal'}
            aria-label="Toggle terminal focus"
            onClick={() => {
              onExpand();
              field.current?.focus();
            }}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div
        className="terminal-body"
        ref={scroll}
        onClick={() => {
          if (!window.getSelection()?.toString()) field.current?.focus();
        }}
      >
        <div className="terminal-welcome">
          <strong>IEEE NUB Git Lab</strong> <span>— your local Git sandbox</span>
          <p>
            Type <b>help</b> to explore supported commands. Everything stays in your virtual
            workspace.
          </p>
        </div>
        <div role="log" aria-label="Terminal output" aria-live="polite">
          {events.map((event, i) => (
            <div className="terminal-event" key={i}>
              <div>
                <small className="command-result">
                  {event.success ? commandKind(event.command) + ' · Success' : 'Failed'}
                </small>
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
        {feedback && (
          <div className="terminal-task-feedback" role="status">
            {feedback}
          </div>
        )}
        {warning && (
          <p className="notice" role="alert">
            {warning}
          </p>
        )}
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
        {['git ', 'status', ' -m ', '"', '/', '-', '>'].map((symbol) => (
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
    </section>
  );
}
