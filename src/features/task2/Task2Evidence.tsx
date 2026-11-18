import { useEffect, useState } from 'react';
import { requireBackend } from '../../services/supabase';
import type { Task2Outcome } from './policy';
export function Task2Evidence({ attemptId }: { attemptId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [repo, setRepo] = useState<any>();
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void Promise.all([
      requireBackend()
        .from('task2_repositories')
        .select('*')
        .eq('attempt_id', attemptId)
        .maybeSingle(),
      requireBackend()
        .from('task2_checks')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20),
    ]).then(([repository, checks]) => {
      if (!live) return;
      if (repository.error || checks.error) {
        setError('GitHub evidence could not be loaded.');
        return;
      }
      setRepo(repository.data);
      setRows(checks.data || []);
    });
    return () => {
      live = false;
    };
  }, [attemptId]);
  return (
    <section className="task2">
      <h3>GitHub repository evidence</h3>
      {error && <p role="alert">{error}</p>}
      {repo ? (
        <p>
          <a href={'https://github.com/' + repo.full_name} target="_blank" rel="noreferrer">
            {repo.full_name}
          </a>{' '}
          · repository ID {repo.repository_id} · GitHub owner ID {repo.github_id} ·{' '}
          {repo.installation_id ? `GitHub App installation ${repo.installation_id}` : 'Public fork'}{' '}
          · {repo.status}
        </p>
      ) : (
        <p>No repository registered. Partial submission is allowed.</p>
      )}
      {rows.length === 0 && <p>No accepted GitHub verification.</p>}
      {rows.map((row) => (
        <details key={row.id}>
          <summary>
            {new Date(row.created_at).toLocaleString()} ·{' '}
            {(row.outcomes as Task2Outcome[]).reduce((n, o) => n + o.earned, 0)} / 100 · version{' '}
            {row.assignment_version} · {row.policy_version}
          </summary>
          <p>
            Main SHA: <code>{row.evidence.mainSha || 'unavailable'}</code>
          </p>
          {(row.outcomes as Task2Outcome[]).map((o) => (
            <p key={o.id}>
              <strong>
                {o.label}: {o.earned}/{o.points} · {o.status}
              </strong>
              <br />
              {o.requirements[0].reason}
            </p>
          ))}
          <pre>{JSON.stringify(row.evidence, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
