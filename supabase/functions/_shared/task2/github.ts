import { appJwt, boundedBody } from './security.ts';
import { TASK2_STARTER } from '../../../../src/features/task2/policy.ts';
export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class GitHub {
  calls = 0;
  private startedAt = Date.now();
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      ++this.calls > 120 ||
      Date.now() - this.startedAt > 75_000
    )
      throw new GitHubError(422, 'Verification request budget exceeded');
    const response = await this.fetcher('https://api.github.com' + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'IEEE-NUB-Task2',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new GitHubError(
        response.status,
        response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0'
          ? 'GitHub rate limit reached. Wait and check again.'
          : response.status === 401 || response.status === 403
            ? 'GitHub access unavailable. Check the App installation and permissions.'
            : response.status === 404
              ? 'GitHub resource is missing or inaccessible.'
              : 'GitHub is temporarily unavailable. Check again later.',
      );
    const bytes = await boundedBody(response, 2_000_000);
    const value = JSON.parse(new TextDecoder().decode(bytes));
    // Never turn a truncated page into evidence of absence or a complete history.
    if (!path.includes('/compare/') && response.headers.get('link')?.includes('rel="next"'))
      throw new GitHubError(
        422,
        'Evidence exceeds the supported page limit. Ask your instructor to review.',
      );
    return value;
  }
}
export function validateRepository(repo: any, githubId: number) {
  if (
    !Number.isSafeInteger(repo?.id) ||
    repo.owner?.id !== githubId ||
    repo.owner?.type !== 'User' ||
    !repo.fork ||
    repo.id === TASK2_STARTER.repositoryId ||
    (repo.parent?.id !== TASK2_STARTER.repositoryId &&
      repo.source?.id !== TASK2_STARTER.repositoryId) ||
    repo.archived ||
    repo.disabled ||
    repo.default_branch !== 'main' ||
    !/^[\w-]+\/[\w.-]+$/.test(repo.full_name)
  )
    throw new GitHubError(
      403,
      'Choose your personal fork of the Task 2 starter with main as its default branch.',
    );
}
export function validateInstallation(installation: any, githubId: number, appId: string) {
  if (
    !Number.isSafeInteger(installation?.id) ||
    String(installation.app_id) !== appId ||
    installation.account?.id !== githubId ||
    installation.account?.type !== 'User' ||
    installation.suspended_at ||
    installation.repository_selection !== 'selected'
  )
    throw new GitHubError(
      403,
      'Install this App on selected repositories in your connected personal account.',
    );
  for (const permission of ['contents', 'issues', 'pull_requests', 'metadata'])
    if (installation.permissions?.[permission] !== 'read')
      throw new GitHubError(
        403,
        'The App requires read-only Contents, Issues, Pull requests and Metadata permissions.',
      );
  if (Object.values(installation.permissions || {}).some((value) => value !== 'read'))
    throw new GitHubError(403, 'The grader does not accept write permissions.');
  if (
    Object.keys(installation.permissions || {}).some(
      (name) => !['contents', 'issues', 'pull_requests', 'metadata'].includes(name),
    )
  )
    throw new GitHubError(403, 'Remove unnecessary GitHub App permissions before continuing.');
}
export type AppConfig = { appId: string; privateKey: string };
export async function installedRepository(
  config: AppConfig,
  fullName: string,
  githubId: number,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[\w-]+\/[\w.-]+$/.test(fullName))
    throw new GitHubError(400, 'Enter a repository as owner/name.');
  const app = new GitHub(await appJwt(config.appId, config.privateKey), fetcher);
  const installation = await app.request(`/repos/${fullName}/installation`);
  validateInstallation(installation, githubId, config.appId);
  // The first lookup only establishes the installation. Its token is narrowed again to the registered numeric repository ID below.
  const repos = await app.request(`/app/installations/${installation.id}/access_tokens`, 'POST', {
    repositories: [fullName.split('/')[1]],
    permissions: { contents: 'read', issues: 'read', pull_requests: 'read', metadata: 'read' },
  });
  if (typeof repos.token !== 'string')
    throw new GitHubError(503, 'GitHub installation token unavailable');
  const api = new GitHub(repos.token, fetcher);
  const repo = await api.request(`/repos/${fullName}`);
  validateRepository(repo, githubId);
  return { api, repo, installation };
}
