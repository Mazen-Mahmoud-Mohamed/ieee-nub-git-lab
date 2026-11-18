import ignorePackage, { type Ignore } from 'ignore';
// The pinned CommonJS package exports a function in Node and Deno. Deno's npm
// declaration interop treats its default as a namespace; keep one typed adapter.
const createIgnore = ignorePackage as unknown as () => Ignore;
import {
  TASK2_POLICY,
  TASK2_STARTER,
  emptyTask2Outcomes,
} from '../../../../src/features/task2/policy.ts';
import { GitHub, GitHubError, validateRepository } from './github.ts';

export async function gradeTask2(api: Pick<GitHub, 'request'>, repository: any, githubId: number) {
  validateRepository(repository, githubId);
  const root = `/repos/${repository.full_name}`;
  const cache = new Map<string, Promise<any>>();
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, api.request(root + path));
    return cache.get(path)!;
  };
  const optional = async (path: string) => {
    try {
      return await read(path);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  };
  const main = async () => {
    const branch = await read('/branches/main');
    if (!/^[a-f0-9]{40}$/.test(branch?.commit?.sha)) throw Error('Main branch has no valid commit');
    return branch.commit.sha as string;
  };
  const blobs: Record<string, string> = {};
  const file = async (path: string) => {
    const result = await optional(`/contents/${path}?ref=${await main()}`);
    if (result === null) return '';
    if (
      result.type !== 'file' ||
      result.encoding !== 'base64' ||
      result.size > 64_000 ||
      !/^[a-f0-9]{40}$/.test(result.sha) ||
      typeof result.content !== 'string'
    )
      throw Error('Unsupported file');
    blobs[path] = result.sha;
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(result.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)),
    );
  };
  const code = async (keepStrings = false) => {
    const text = await file('sensor.ino');
    if (/^\s*#/m.test(text) || /\bR"/.test(text) || text.includes('\0'))
      throw Error('Source needs manual review');
    // Match literals before comments so quoted comment markers cannot forge an active declaration.
    return text.replace(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (token) => (token.startsWith('/') || !keepStrings ? ' ' : token),
    );
  };
  const reaches = async (base: string, head: string) => {
    if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) return false;
    if (base === head) return true;
    return (await read(`/compare/${base}...${head}?per_page=1`)).merge_base_commit?.sha === base;
  };
  const issues = async (): Promise<any[]> =>
    (await read('/issues?state=all&per_page=100')).filter((i: any) => !i.pull_request);
  const prs = async (): Promise<any[]> =>
    (await read('/pulls?state=all&per_page=100')).filter(
      (p: any) =>
        p.user?.id === githubId &&
        p.head?.repo?.id === repository.id &&
        p.base?.repo?.id === repository.id &&
        p.head?.ref === 'feature/buzzer' &&
        p.base?.ref === 'main',
    );
  const outcomes = emptyTask2Outcomes();
  const failureReasons: Record<string, string> = {
    't2-fork': 'The fork does not retain the required main/display histories and display branch.',
    't2-merge':
      'No qualifying two-parent merge of both supplied histories was found on captured main.',
    't2-threshold':
      'The captured sketch needs exactly one active const int dryThreshold = 38; declaration and no conflict markers.',
    't2-lcd':
      'The captured sketch is missing the active simulated LCD and conditional soil-status print sequence.',
    't2-ignore-env':
      'The root .gitignore is missing an effective .env rule or a later exception permits the file.',
    't2-ignore-logs':
      'The root .gitignore needs *.log with no later exception that may permit log files.',
    't2-ignore-settings':
      'The root .gitignore is missing an effective local-settings.txt rule or a later exception permits it.',
    't2-untrack': 'local-settings.txt is still present in the captured main Git tree.',
    't2-buzzer':
      'The main sketch needs the specified tone/noTone block and a sensor.ino change on your feature/buzzer PR.',
    't2-issue':
      'No own issue has buzzer in its title and an explanation of at least 40 characters.',
    't2-pr':
      'No own feature/buzzer to main PR meets the title/body lengths and Closes #N reference to an existing issue in this fork.',
    't2-pr-merged': 'No merged own buzzer PR has its merge commit reachable from captured main.',
    't2-review':
      'No submitted nonempty review from a different non-bot GitHub user was found on your buzzer PR.',
    't2-readme':
      'README needs complete Wiring, Run and Contributing sections (40+ characters each), pins A0/8 and tone/noTone behavior.',
  };
  const facts: Record<string, unknown> = {};
  const check = async (id: string, test: () => Promise<{ passed: boolean; evidence: unknown }>) => {
    const result = outcomes.find((o) => o.id === id)!;
    try {
      const value = await test();
      result.passed = value.passed;
      result.status = value.passed ? 'passed' : 'failed';
      result.earned = value.passed ? result.points : 0;
      facts[id] = value.evidence;
      Object.assign(result.requirements[0], {
        passed: value.passed,
        earned: result.earned,
        evidence: JSON.stringify(value.evidence),
        reason: value.passed ? 'Verified from GitHub.' : failureReasons[id],
      });
    } catch (error) {
      result.status = 'unverifiable';
      result.requirements[0].reason =
        error instanceof GitHubError
          ? error.message
          : 'GitHub evidence could not be verified. Check the resource and try again.';
      result.requirements[0].evidence =
        'No success inferred from an unavailable or incomplete API response.';
    }
  };
  await check('t2-fork', async () => {
    const lcd = await optional('/branches/feature%2Flcd-display');
    const sha = await main();
    return {
      passed:
        !!lcd &&
        (await reaches(TASK2_STARTER.main, sha)) &&
        (await reaches(TASK2_STARTER.lcd, lcd.commit?.sha)),
      evidence: {
        repositoryId: repository.id,
        ownerId: githubId,
        sourceId: repository.source?.id,
        main: sha,
        lcd: lcd?.commit?.sha || null,
      },
    };
  });
  await check('t2-merge', async () => {
    const sha = await main();
    const commits = await read(`/commits?sha=${sha}&per_page=100`);
    const candidates = commits.filter((c: any) => c.parents?.length === 2);
    if (candidates.length > 10) throw Error('History exceeds verification bounds');
    for (const c of candidates) {
      const [a, b] = c.parents.map((p: any) => p.sha);
      if (
        ((await reaches(TASK2_STARTER.main, a)) && (await reaches(TASK2_STARTER.lcd, b))) ||
        ((await reaches(TASK2_STARTER.main, b)) && (await reaches(TASK2_STARTER.lcd, a)))
      )
        return {
          passed: true,
          evidence: {
            main: sha,
            merge: c.sha,
            parents: [a, b],
            starter: TASK2_STARTER,
            limitation: 'Topology does not prove a local conflict prompt or command execution.',
          },
        };
    }
    return {
      passed: false,
      evidence: { main: sha, mergesExamined: candidates.map((c: any) => c.sha) },
    };
  });
  await check('t2-threshold', async () => {
    const raw = await file('sensor.ino');
    const active = await code();
    return {
      passed:
        (active.match(/\bdryThreshold\s*=/g) || []).length === 1 &&
        /\bconst\s+int\s+dryThreshold\s*=\s*38\s*;/.test(active) &&
        !/^(?:<<<<<<<|=======|>>>>>>>)/m.test(raw),
      evidence: { main: await main(), blob: blobs['sensor.ino'], expectedThreshold: 38 },
    };
  });
  await check('t2-lcd', async () => ({
    passed:
      /Serial\s*\.\s*print\s*\(\s*"\[LCD\] "\s*\)\s*;\s*Serial\s*\.\s*println\s*\(\s*isDry\s*\?\s*"DRY SOIL"\s*:\s*"SOIL OK"\s*\)\s*;/.test(
        await code(true),
      ),
    evidence: { main: await main(), blob: blobs['sensor.ino'] },
  }));
  for (const [id, path, required] of [
    ['t2-ignore-env', '.env', '.env'],
    ['t2-ignore-logs', 'debug.log', '*.log'],
    ['t2-ignore-settings', 'local-settings.txt', 'local-settings.txt'],
  ])
    await check(id, async () => {
      const text = await file('.gitignore');
      const patterns = text.split(/\r?\n/).map((p) => p.trim());
      const lastLogRule = patterns.reduce((last, p, i) => (p === '*.log' ? i : last), -1);
      const logExceptions = patterns
        .slice(lastLogRule + 1)
        .filter(
          (p) =>
            p.startsWith('!') &&
            !p.endsWith('/') &&
            (!/\.[a-z0-9]+$/i.test(p) || /\.log$/i.test(p)),
        );
      return {
        passed:
          patterns.some(
            (p) => p === required || (id !== 't2-ignore-logs' && p === '/' + required),
          ) &&
          createIgnore().add(text).ignores(path) &&
          (id !== 't2-ignore-logs' || logExceptions.length === 0),
        evidence: {
          main: await main(),
          blob: blobs['.gitignore'],
          path,
          requiredRule: required,
          ...(id === 't2-ignore-logs' ? { logExceptions } : {}),
        },
      };
    });
  await check('t2-untrack', async () => {
    const sha = await main();
    const tree = await read(`/git/trees/${sha}`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw Error('Incomplete tree');
    return {
      passed: !tree.tree.some((e: any) => e.path === 'local-settings.txt'),
      evidence: {
        main: sha,
        tree: tree.sha,
        tracked: tree.tree.some((e: any) => e.path === 'local-settings.txt'),
        limitation: 'No claim that a local copy was retained.',
      },
    };
  });
  await check('t2-buzzer', async () => {
    const structure =
      /if\s*\(\s*isDry\s*\)\s*\{\s*tone\s*\(\s*buzzerPin\s*,\s*1000\s*\)\s*;\s*\}\s*else\s*\{\s*noTone\s*\(\s*buzzerPin\s*\)\s*;\s*\}/.test(
        await code(),
      );
    const changed: number[] = [];
    for (const p of await prs())
      if (
        (await read(`/pulls/${p.number}/files?per_page=100`)).some(
          (f: any) => f.filename === 'sensor.ino' && f.status !== 'removed',
        )
      )
        changed.push(p.number);
    return {
      passed: structure && changed.length > 0,
      evidence: { main: await main(), blob: blobs['sensor.ino'], matchingPullRequests: changed },
    };
  });
  await check('t2-issue', async () => {
    const matching = (await issues()).filter(
      (i) =>
        i.user?.id === githubId && /buzzer/i.test(i.title) && (i.body || '').trim().length >= 40,
    );
    return {
      passed: matching.length > 0,
      evidence: {
        issues: matching.map((i) => ({
          id: i.id,
          number: i.number,
          authorId: i.user.id,
          updatedAt: i.updated_at,
        })),
      },
    };
  });
  await check('t2-pr', async () => {
    const localIssues = new Set((await issues()).map((i) => i.number));
    const matching = (await prs()).filter(
      (p) =>
        p.title?.trim().length >= 10 &&
        p.body?.trim().length >= 40 &&
        [...p.body.matchAll(/\bcloses\s+#([1-9]\d*)\b/gi)].some((m) =>
          localIssues.has(Number(m[1])),
        ),
    );
    return {
      passed: matching.length > 0,
      evidence: {
        pulls: matching.map((p) => ({
          id: p.id,
          number: p.number,
          head: p.head.sha,
          base: p.base.sha,
        })),
      },
    };
  });
  await check('t2-pr-merged', async () => {
    const matching = [];
    for (const p of await prs()) {
      const detail = await read(`/pulls/${p.number}`);
      if (
        detail.merged_at &&
        detail.merge_commit_sha &&
        (await reaches(detail.merge_commit_sha, await main()))
      )
        matching.push({ number: p.number, merge: detail.merge_commit_sha });
    }
    return { passed: matching.length > 0, evidence: { main: await main(), pulls: matching } };
  });
  await check('t2-review', async () => {
    const matching = [];
    for (const p of await prs())
      for (const r of await read(`/pulls/${p.number}/reviews?per_page=100`))
        if (
          r.user?.type === 'User' &&
          r.user.id !== githubId &&
          r.body?.trim() &&
          ['COMMENTED', 'APPROVED', 'CHANGES_REQUESTED'].includes(r.state)
        )
          matching.push({
            pull: p.number,
            id: r.id,
            reviewerId: r.user.id,
            commit: r.commit_id,
            submittedAt: r.submitted_at,
          });
    return { passed: matching.length > 0, evidence: { reviews: matching } };
  });
  await check('t2-readme', async () => {
    const text = await file('README.md');
    const sections = ['Wiring', 'Run', 'Contributing'].map((heading) => ({
      heading,
      sufficient:
        (new RegExp('^#{1,6} +' + heading + ' *\\r?\\n([^]*?)(?=^#{1,6} |$(?![^]))', 'im')
          .exec(text)?.[1]
          .trim().length || 0) >= 40,
    }));
    return {
      passed:
        sections.every((s) => s.sufficient) &&
        /\bA0\b/.test(text) &&
        /\b8\b/.test(text) &&
        /\btone\b/.test(text) &&
        /\bnoTone\b/.test(text),
      evidence: { main: await main(), blob: blobs['README.md'], sections },
    };
  });
  let mainSha: string | null = null;
  try {
    mainSha = await main();
  } catch {
    /* Other checks remain independent. */
  }
  return {
    outcomes,
    evidence: {
      policyVersion: TASK2_POLICY,
      repositoryId: repository.id,
      fullName: repository.full_name,
      ownerId: githubId,
      starter: TASK2_STARTER,
      mainSha,
      blobs,
      facts,
      checkedAt: new Date().toISOString(),
    },
    practicalScore: outcomes.reduce((sum, o) => sum + o.earned, 0),
  };
}
