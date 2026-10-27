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
    <section className="terminal">
      <div className="panel-heading terminal-tabs">
        <span>
          <ChevronRight size={15} /> Git Terminal <i className="live-dot" />
        </span>
        <div>
          <span className="terminal-mode">BROWSER SHELL</span>
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
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!input.trim() || lab.busy) return;
            const value = input;
            setInput('');
            const h = [...history, value];
            setHistory(h);
            setCursor(h.length);
            if (value === 'clear') setCleared(lab.engine.events.length + 1);
            await lab.command(value);
            field.current?.focus();
          }}
        >
          <label className="terminal-prompt" htmlFor="command">
            <span className="prompt-user">student@ieee-nub</span>{' '}
            <span className="prompt-path">{lab.engine.cwd}</span>{' '}
            <span className="prompt-branch">({lab.view.branch})</span>
            <br />
            <span className="prompt-symbol">$</span>
            <input
              id="command"
              ref={field}
              aria-label="Terminal command"
              autoComplete="off"
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
            {lab.busy && <span className="dim">Executing…</span>}
          </label>
        </form>
      </div>
    </section>
  );
}
