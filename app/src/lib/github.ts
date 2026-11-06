/**
 * Minimal GitHub REST client for the IT Hub.
 *
 * - Talks only to api.github.com; paths are built from validated, encoded segments.
 * - Uses `cache: 'no-store'` so private responses never land in the browser's HTTP cache on disk.
 *   Conditional requests (ETag / If-None-Match) are handled in memory instead, per signed-in user.
 * - Error messages contain status codes and repository paths only, never credentials or bodies.
 */
import { AppError } from './errors';
import { encodePath } from './paths';
import { GITHUB_API } from './policy';
import type { RepositoryRef } from './bootstrap';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface RepoInfo {
  full_name: string;
  private: boolean;
  default_branch: string;
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean };
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface Tree {
  sha: string;
  truncated: boolean;
  tree: TreeEntry[];
}

export interface CommitSummary {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

export interface Release {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  resetAt?: number;
}

interface CachedResponse {
  etag: string;
  body: unknown;
}

type Fetch = typeof fetch;

export class GitHubClient {
  private readonly etags = new Map<string, CachedResponse>();
  private readonly blobs = new Map<string, string>();
  rateLimit: RateLimitInfo = {};
  requestCount = 0;

  constructor(
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args)
  ) {}

  /** Drops all in-memory private data (used on logout and account switch). */
  clear(): void {
    this.etags.clear();
    this.blobs.clear();
  }

  private async request(path: string, accept = 'application/vnd.github+json', what = path): Promise<{ status: number; body: unknown; text?: string }> {
    if (!path.startsWith('/')) throw new Error('GitHub API path must be absolute');
    const token = await this.getToken();
    const url = GITHUB_API + path;
    const cached = this.etags.get(url);
    const headers: Record<string, string> = {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (cached) headers['If-None-Match'] = cached.etag;

    let res: Response;
    try {
      this.requestCount++;
      res = await this.fetchImpl(url, { headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      throw new AppError('network', 'Could not reach GitHub. Check your connection and try again.');
    }
    this.readRateLimit(res);

    if (res.status === 304 && cached) return { status: 200, body: cached.body };
    if (res.ok) {
      const raw = accept.includes('raw');
      const body: unknown = raw ? await res.text() : await res.json();
      const etag = res.headers.get('ETag');
      if (etag) this.etags.set(url, { etag, body });
      return { status: res.status, body };
    }
    throw this.toError(res, what);
  }

  private readRateLimit(res: Response): void {
    const num = (h: string) => {
      const v = res.headers.get(h);
      return v === null ? undefined : Number(v);
    };
    const reset = num('X-RateLimit-Reset');
    this.rateLimit = { limit: num('X-RateLimit-Limit'), remaining: num('X-RateLimit-Remaining'), resetAt: reset ? reset * 1000 : undefined };
  }

  private toError(res: Response, what: string): AppError {
    if (res.status === 401) return new AppError('auth-expired', 'GitHub rejected the credentials. They may have expired or been revoked. Please sign in again.');
    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (res.status === 429 || (res.status === 403 && remaining === '0')) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
      const reset = Number(res.headers.get('X-RateLimit-Reset') ?? 0) * 1000;
      const retryAt = retryAfter ? Date.now() + retryAfter * 1000 : reset || Date.now() + 60_000;
      return new AppError('rate-limited', `GitHub rate limit reached. Try again after ${new Date(retryAt).toLocaleTimeString()}.`, { retryAt });
    }
    if (res.status === 403) return new AppError('no-access', 'Your GitHub account is not permitted to read this content.', { detail: what });
    // GitHub answers 404 both for missing content and for private repositories the caller cannot see.
    if (res.status === 404) return new AppError('not-found', `Not found or not accessible: ${what}`, { detail: what });
    return new AppError('server', `GitHub returned an error (HTTP ${res.status}).`, { detail: what });
  }

  async getUser(): Promise<GitHubUser> {
    return (await this.request('/user', undefined, 'your GitHub profile')).body as GitHubUser;
  }

  /**
   * Explicit authorization check. A successful sign-in only proves identity; this verifies that the
   * account can read the repository. 404 here means "no access" for a private repository.
   */
  async verifyRepositoryAccess(repo: RepositoryRef): Promise<RepoInfo> {
    const name = `${repo.owner}/${repo.name}`;
    try {
      const info = (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`, undefined, name)).body as RepoInfo;
      if (info.permissions && info.permissions.pull === false) {
        throw new AppError('no-access', `Your GitHub account cannot read ${name}.`, { detail: name });
      }
      return info;
    } catch (e) {
      if (e instanceof AppError && (e.kind === 'not-found' || e.kind === 'no-access')) {
        throw new AppError('no-access', `Your GitHub account does not have access to ${name}. Ask the repository owner to add you as a collaborator.`, { detail: name });
      }
      throw e;
    }
  }

  async getTree(repo: RepositoryRef): Promise<Tree> {
    const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/trees/${encodePath(repo.ref)}?recursive=1`;
    return (await this.request(path, undefined, `${repo.owner}/${repo.name}@${repo.ref}`)).body as Tree;
  }

  /** Blobs are immutable by SHA, so they are cached in memory for the session. */
  async getBlobText(repo: RepositoryRef, sha: string, what: string): Promise<string> {
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('invalid blob sha');
    const hit = this.blobs.get(sha);
    if (hit !== undefined) return hit;
    const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/blobs/${sha}`;
    const text = (await this.request(path, 'application/vnd.github.raw+json', what)).body as string;
    this.blobs.set(sha, text);
    return text;
  }

  async getFileText(repo: RepositoryRef, filePath: string): Promise<string> {
    const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(repo.ref)}`;
    return (await this.request(path, 'application/vnd.github.raw+json', `${repo.name}/${filePath}`)).body as string;
  }

  async getRecentCommits(repo: RepositoryRef, path: string, perPage = 8): Promise<CommitSummary[]> {
    const q = `sha=${encodeURIComponent(repo.ref)}&path=${encodeURIComponent(path)}&per_page=${perPage}`;
    return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/commits?${q}`, undefined, `history of ${path}`)).body as CommitSummary[];
  }

  async getReleases(repo: RepositoryRef): Promise<Release[]> {
    return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/releases?per_page=30`, undefined, 'releases')).body as Release[];
  }
}
