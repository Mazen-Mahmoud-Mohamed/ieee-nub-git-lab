import { expect, it } from 'vitest';
import { gradeTask2 } from '../../supabase/functions/_shared/task2/grader';
import { GitHubError } from '../../supabase/functions/_shared/task2/github';
import { task2Rubric, TASK2_STARTER } from '../../src/features/task2/policy';
const head = 'a'.repeat(40),
  merge = 'b'.repeat(40),
  repo = {
    id: 200,
    full_name: 'isolated-student/fork',
    owner: { id: 100, type: 'User' },
    fork: true,
    source: { id: TASK2_STARTER.repositoryId },
    default_branch: 'main',
  };
function fixture(
  options: {
    threshold?: number;
    missingMain?: boolean;
    tracked?: boolean;
    treeFailure?: boolean;
    issueFailure?: boolean;
    ownReview?: boolean;
    badDescription?: boolean;
    negate?: boolean;
  } = {},
) {
  const files: Record<string, string> = {
    'sensor.ino': `const int dryThreshold = ${options.threshold || 38};\nvoid loop() {\nif (isDry) { tone(buzzerPin, 1000); } else { noTone(buzzerPin); }\nSerial.print("[LCD] ");\nSerial.println(isDry ? "DRY SOIL" : "SOIL OK");\n}`,
    '.gitignore': '.env\n*.log\nlocal-settings.txt\n' + (options.negate ? '!.env\n!debug.log' : ''),
    'README.md':
      '# Smart Plant\n## Wiring\nConnect sensor A0 and buzzer pin 8 using the classroom wiring assumptions.\n## Run\nUpload the sketch, verify tone and noTone change the buzzer with dry soil readings.\n## Contributing\nCreate a branch, push the change and open a pull request with clear testing steps.\n',
  };
  const pr = {
    id: 400,
    number: 2,
    user: { id: 100 },
    head: { repo: { id: 200 }, ref: 'feature/buzzer', sha: head },
    base: { repo: { id: 200 }, ref: 'main', sha: head },
    title: 'Improve buzzer behavior',
    body: options.badDescription
      ? ''
      : 'Add a clear audible warning when dry soil is detected. Closes #1',
    merged_at: '2026-11-18',
    merge_commit_sha: merge,
  };
  const paths: string[] = [];
  return {
    files,
    paths,
    api: {
      request: async (path: string) => {
        paths.push(path);
        const p = path.replace('/repos/isolated-student/fork', '');
        if (p === '/branches/main') {
          if (options.missingMain) throw new GitHubError(404, 'Missing main');
          return { commit: { sha: head } };
        }
        if (p.startsWith('/branches/feature')) return { commit: { sha: TASK2_STARTER.lcd } };
        if (p.startsWith('/contents/')) {
          const name = p.slice(10).split('?')[0];
          if (!(name in files)) throw new GitHubError(404, 'Missing file');
          return {
            type: 'file',
            encoding: 'base64',
            size: files[name].length,
            sha: 'c'.repeat(40),
            content: Buffer.from(files[name]).toString('base64'),
          };
        }
        if (p.startsWith('/compare/'))
          return { merge_base_commit: { sha: p.slice(9).split('...')[0] } };
        if (p.startsWith('/commits?'))
          return [
            { sha: merge, parents: [{ sha: TASK2_STARTER.main }, { sha: TASK2_STARTER.lcd }] },
          ];
        if (p.startsWith('/git/trees/')) {
          if (options.treeFailure) throw new GitHubError(500, 'GitHub API failed');
          return {
            sha: 'd'.repeat(40),
            tree: options.tracked ? [{ path: 'local-settings.txt' }] : [],
            truncated: false,
          };
        }
        if (p.startsWith('/issues?')) {
          if (options.issueFailure) throw new GitHubError(403, 'GitHub rate limit reached');
          return [
            {
              id: 300,
              number: 1,
              user: { id: 100 },
              title: 'Improve buzzer',
              body: 'Describe the audible buzzer improvement and a boundary test to verify it.',
            },
          ];
        }
        if (p.startsWith('/pulls?')) return [pr];
        if (p === '/pulls/2/files?per_page=100')
          return [{ filename: 'sensor.ino', status: 'modified' }];
        if (p === '/pulls/2/reviews?per_page=100')
          return [
            {
              id: 500,
              user: { id: options.ownReview ? 100 : 101, type: 'User' },
              body: 'Please test the threshold boundary.',
              state: 'COMMENTED',
              commit_id: head,
            },
          ];
        if (p === '/pulls/2') return pr;
        throw Error('Unexpected fixture request ' + p);
      },
    },
  };
}
it('records 14 independent criteria totaling 100, repository identity, policy and captured SHAs', async () => {
  expect(task2Rubric.reduce((n, c) => n + c.points, 0)).toBe(100);
  const f = fixture();
  const result = await gradeTask2(f.api, repo, 100);
  expect(result.practicalScore).toBe(100);
  expect(result.outcomes.every((o) => o.status === 'passed')).toBe(true);
  expect(result.evidence.repositoryId).toBe(200);
  expect(result.evidence.mainSha).toBe(head);
  expect(result.evidence.policyVersion).toBe('github-task2-v1');
  expect(f.paths.filter((p) => p.endsWith('/branches/main'))).toHaveLength(1);
});
it('recovers a later threshold correction without removing unrelated marks', async () => {
  const f = fixture({ threshold: 45 });
  const first = await gradeTask2(f.api, repo, 100);
  expect(first.practicalScore).toBe(90);
  f.files['sensor.ino'] = f.files['sensor.ino'].replace('= 45', '= 38');
  expect((await gradeTask2(f.api, repo, 100)).practicalScore).toBe(100);
  expect(first.outcomes.find((o) => o.id === 't2-lcd')?.earned).toBe(8);
});
it('keeps issues and pull requests independent when main is deleted', async () => {
  const result = await gradeTask2(fixture({ missingMain: true }).api, repo, 100);
  expect(result.outcomes.find((o) => o.id === 't2-issue')?.earned).toBe(6);
  expect(result.outcomes.find((o) => o.id === 't2-pr')?.earned).toBe(8);
  expect(result.outcomes.find((o) => o.id === 't2-threshold')?.status).toBe('unverifiable');
});
it('never infers untracking from a failed tree call or ignore file', async () => {
  for (const options of [{ tracked: true }, { treeFailure: true }]) {
    const result = await gradeTask2(fixture(options).api, repo, 100);
    expect(result.outcomes.find((o) => o.id === 't2-untrack')?.earned).toBe(0);
    expect(result.outcomes.find((o) => o.id === 't2-ignore-settings')?.earned).toBe(4);
  }
});
it('rejects negated ignores and own reviews without cascading failures', async () => {
  const result = await gradeTask2(fixture({ negate: true, ownReview: true }).api, repo, 100);
  expect(result.practicalScore).toBe(86);
  expect(result.outcomes.find((o) => o.id === 't2-ignore-settings')?.earned).toBe(4);
});
it('handles rate limits independently and scores a merged PR despite its poor description', async () => {
  const result = await gradeTask2(
    fixture({ issueFailure: true, badDescription: true }).api,
    repo,
    100,
  );
  expect(result.outcomes.find((o) => o.id === 't2-issue')?.status).toBe('unverifiable');
  expect(result.outcomes.find((o) => o.id === 't2-pr-merged')?.earned).toBe(4);
  expect(result.outcomes.find((o) => o.id === 't2-threshold')?.earned).toBe(10);
});
it('rejects another identity before any evidence request', async () => {
  const f = fixture();
  await expect(gradeTask2(f.api, repo, 101)).rejects.toThrow();
  expect(f.paths).toHaveLength(0);
});
it('does not grade declarations hidden in comments, strings or disabled preprocessing blocks', async () => {
  const f = fixture();
  f.files['sensor.ino'] =
    'const char *note = "const int dryThreshold = 38;";\n// if (isDry) { tone(buzzerPin, 1000); } else { noTone(buzzerPin); }';
  const result = await gradeTask2(f.api, repo, 100);
  expect(result.outcomes.find((o) => o.id === 't2-threshold')?.earned).toBe(0);
  expect(result.outcomes.find((o) => o.id === 't2-buzzer')?.earned).toBe(0);
  f.files['sensor.ino'] = '#if 0\nconst int dryThreshold = 38;\n#endif';
  expect(
    (await gradeTask2(f.api, repo, 100)).outcomes.find((o) => o.id === 't2-threshold')?.status,
  ).toBe('unverifiable');
});
it('does not award all-log ignoring when a different or nested log is explicitly unignored', async () => {
  const f = fixture();
  f.files['.gitignore'] = '.env\n*.log\nlocal-settings.txt\n!secret.log';
  let result = await gradeTask2(f.api, repo, 100);
  expect(result.outcomes.find((o) => o.id === 't2-ignore-logs')?.earned).toBe(0);
  expect(result.outcomes.find((o) => o.id === 't2-ignore-env')?.earned).toBe(4);
  f.files['.gitignore'] = '.env\n/*.log\nlocal-settings.txt';
  result = await gradeTask2(f.api, repo, 100);
  expect(result.outcomes.find((o) => o.id === 't2-ignore-logs')?.earned).toBe(0);
});
