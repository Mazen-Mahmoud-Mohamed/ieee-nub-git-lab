import { useState } from 'react';
import { GitBranch, GitCommitHorizontal } from 'lucide-react';
import type { RepoView } from '../features/git-engine/engine';
export function GitGraph({ view }: { view: RepoView }) {
  const [selected, setSelected] = useState('');
  if (!view.commits.length)
    return (
      <div className="empty-graph">
        <GitCommitHorizontal size={28} />
        <p>
          Your story starts with
          <br />
          your first commit.
        </p>
        <span>History appears here as you work.</span>
      </div>
    );
  const commits = view.commits;
  const index = new Map(commits.map((c, i) => [c.oid, i]));
  return (
    <div className="git-graph">
      <div className="graph-rows">
        <svg width="48" height={commits.length * 62} aria-label="Commit parent connections">
          {commits.flatMap((c, i) =>
            c.parents.map((p, j) => (
              <path
                key={c.oid + p}
                d={`M 17 ${i * 62 + 20} C ${j ? 58 : 17} ${i * 62 + 44}, ${j ? 58 : 17} ${(index.get(p) ?? i) * 62}, 17 ${(index.get(p) ?? i) * 62 + 20}`}
                fill="none"
                stroke={j ? '#9c89f5' : '#59a9ef'}
                strokeWidth="2"
              />
            )),
          )}
          {commits.map((c, i) => (
            <circle
              key={c.oid}
              cx="17"
              cy={i * 62 + 20}
              r="5"
              fill={c.parents.length > 1 ? '#a68bfa' : '#62b4f4'}
              stroke="var(--panel)"
              strokeWidth="3"
            />
          ))}
        </svg>
        <div>
          {commits.map((c) => (
            <button
              key={c.oid}
              className={'commit-row ' + (selected === c.oid ? 'selected' : '')}
              onClick={() => setSelected(selected === c.oid ? '' : c.oid)}
            >
              <span>{c.message}</span>
              <small>
                {c.oid.slice(0, 7)}{' '}
                {Object.entries(view.branches)
                  .filter(([, oid]) => oid === c.oid)
                  .map(([b]) => (
                    <b key={b}>
                      <GitBranch size={10} />
                      {b}
                      {view.branch === b ? ' · HEAD' : ''}
                    </b>
                  ))}
              </small>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <div className="commit-detail">
          <code>{selected}</code>
          <p>
            Parents:{' '}
            {commits
              .find((c) => c.oid === selected)
              ?.parents.map((p) => p.slice(0, 7))
              .join(', ') || 'root commit'}
          </p>
          {Object.entries(commits.find((c) => c.oid === selected)?.files || {}).map(([p, text]) => (
            <details key={p}>
              <summary>{p}</summary>
              <pre>{text}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
