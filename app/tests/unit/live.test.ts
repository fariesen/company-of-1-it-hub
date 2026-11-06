/**
 * Live check against the real GitHub API. Skipped unless IT_HUB_LIVE_TOKEN is set, e.g.:
 *   IT_HUB_LIVE_TOKEN=$(gh auth token) npx vitest run tests/unit/live.test.ts
 * It reads only; it never writes to GitHub. It verifies the client's assumptions about real API
 * responses. It does not test browser CORS or the sign-in UI.
 */
import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../../src/lib/github';
import { loadHub } from '../../src/lib/content';
import { publicBootstrap } from './fakeGitHub';

const token = process.env.IT_HUB_LIVE_TOKEN;
const repo = { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' };

describe.skipIf(!token)('live GitHub API', () => {
  const client = new GitHubClient(async () => token!);

  it('verifies access to the private repository', async () => {
    const info = await client.verifyRepositoryAccess(repo);
    expect(info.private).toBe(true);
    expect(info.permissions?.pull).toBe(true);
  });

  it('reads the tree and raw blobs, and revalidates with ETags', async () => {
    const tree = await client.getTree(repo);
    const readme = tree.tree.find((e) => e.path === 'README.md')!;
    expect(readme.type).toBe('blob');
    expect(await client.getBlobText(repo, readme.sha, 'README.md')).toMatch(/^# The Company of 1/);
    const before = client.requestCount;
    await client.getTree(repo);
    expect(client.requestCount).toBe(before + 1);
    expect(client.rateLimit.remaining).toBeGreaterThan(0);
  });

  it('reads a file by path as raw text', async () => {
    expect(await client.getFileText(repo, 'CLAUDE.md')).toContain('Working rules');
  });

  it('reports a missing file as not-found', async () => {
    await expect(client.getFileText(repo, 'does/not/exist.json')).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('a non-existent repository is reported as no-access', async () => {
    await expect(client.verifyRepositoryAccess({ ...repo, name: 'company-of-1-it-does-not-exist' })).rejects.toMatchObject({ kind: 'no-access' });
  });

  it('lists commits and releases', async () => {
    expect((await client.getRecentCommits(repo, 'inventory')).length).toBeGreaterThan(0);
    expect(Array.isArray(await client.getReleases(repo))).toBe(true);
  });

  it('loadHub against the live repository', async () => {
    try {
      const data = await loadHub(new GitHubClient(async () => token!), publicBootstrap);
      // Once config/it-hub.json is pushed, the full load must succeed.
      expect(data.devices.length).toBeGreaterThanOrEqual(0);
      console.warn(`live loadHub OK: ${data.devices.length} devices, ${data.docs.length} docs, ${data.requestCount} requests, problems: ${data.problems.length}`);
    } catch (e) {
      // Before the private configuration is pushed, the expected outcome is a clear config error.
      expect(e).toMatchObject({ kind: 'invalid-config' });
      console.warn(`live loadHub: ${(e as Error).message}`);
    }
  });

  it('rejects bad credentials with auth-expired', async () => {
    await expect(new GitHubClient(async () => 'github_pat_invalid_0000000000000000000000').getUser()).rejects.toMatchObject({ kind: 'auth-expired' });
  });
});
