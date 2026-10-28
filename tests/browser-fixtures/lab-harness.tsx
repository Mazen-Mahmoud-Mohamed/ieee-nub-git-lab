import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLab } from '../../src/hooks/useLab';
import { blankDefinition, type Definition } from '../../src/features/assessments/model';
const make = (name: string, file: string): Definition => ({
  ...blankDefinition('assignment', 'legacy'),
  title: name,
  projectName: name,
  format: 'practical',
  starter: { files: { [file]: 'starter' }, initialize: true, commit: true },
  sections: [
    {
      id: 's',
      title: 'Files',
      description: '',
      steps: [],
      tasks: [
        {
          id: 'file',
          title: 'Save text',
          instructions: 'Save text.',
          bonus: false,
          points: 1,
          rules: [{ type: 'file', path: file, ref: 'main', match: 'contains', value: 'staged' }],
        },
      ],
    },
  ],
});
const definitions = { A: make('Project-A', 'a.txt'), B: make('Project-B', 'b.txt') };
function Harness() {
  const [key, setKey] = useState<'A' | 'B'>('A');
  const lab = useLab('queue-harness-' + key, definitions[key]);
  const [message, setMessage] = useState('');
  const [captured, setCaptured] = useState('');
  const release = useRef<(() => void) | undefined>(undefined);
  return (
    <>
      <h1>{definitions[key].title}</h1>
      <output aria-label="lab-state">
        {JSON.stringify({
          ready: lab.ready,
          busy: lab.busy,
          working: lab.working,
          commits: lab.view.commits.map((c) => ({ message: c.message, files: c.files })),
          error: lab.error,
          readOnly: lab.readOnly,
          answers: lab.answers,
          config: lab.view.config,
        })}
      </output>
      <output aria-label="captured-state">{captured}</output>
      <p role="status" aria-label="queue-status">
        {message}
      </p>
      <button disabled={!lab.ready} onClick={() => setKey(key === 'A' ? 'B' : 'A')}>
        Switch attempt
      </button>
      <button
        disabled={!lab.ready || lab.busy}
        onClick={() => {
          void Promise.all([
            lab.write('a.txt', 'staged version'),
            lab.command('git add a.txt'),
            lab.write('a.txt', 'later working version'),
            lab.command('git commit -m "Save queued changes"'),
          ]).then(() => setMessage('Queue finished'));
          void lab.capture().then((s) => setCaptured(JSON.stringify(s)));
        }}
      >
        Queue rapid operations and capture
      </button>
      <button
        disabled={!lab.ready || lab.busy}
        onClick={() => {
          const engine = lab.engine,
            inspect = engine.inspect.bind(engine);
          engine.inspect = async () => {
            await new Promise<void>((resolve) => {
              release.current = resolve;
            });
            engine.inspect = inspect;
            return inspect();
          };
          void lab
            .write('a.txt', 'late old-attempt value')
            .then(() => setMessage('Delayed inspection finished'));
        }}
      >
        Delay an inspection
      </button>
      <button onClick={() => release.current?.()}>Release old inspection</button>
      <button
        disabled={!lab.ready}
        onClick={async () => {
          const saved = await lab.capture();
          saved.snapshot.entries['/Project-A/a.txt'].data = Array.from(
            new TextEncoder().encode('accepted server content'),
          );
          saved.config = { 'user.name': 'Restored Student', 'user.email': 'restored@example.com' };
          const config = saved.snapshot.entries['/Project-A/.git/config'];
          config.data = Array.from(
            new TextEncoder().encode(
              new TextDecoder()
                .decode(new Uint8Array(config.data))
                .replace('Course starter', 'Restored Student')
                .replace('starter@git-lab.invalid', 'restored@example.com'),
            ),
          );
          saved.answers = { reflection: 'accepted answer' };
          await lab.restore(saved, true);
          setMessage('Server evidence restored');
        }}
      >
        Restore server evidence
      </button>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
