import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../../src/lib/github';
import { createFakeGitHub } from './fakeGitHub';

const TOKEN = 'github_pat_TESTTOKEN_0123456789abcdefghij';
const repo = { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' };

function setup(extra: Partial<Parameters<typeof createFakeGitHub>[0]> = {}) {
  const gh = createFakeGitHub({
    repos: [{ ...repo, files: { 'README.md': '# Hi' } }],
    tokens: { [TOKEN]: { login: 'fariesen', repos: ['fariesen/company-of-1-it'] }, other: { login: 'stranger', repos: [] } },
    ...extra
  });
  return { gh, client: (t = TOKEN) => new GitHubClient(async () => t, gh.fetch) };
}

describe('GitHubClient', () => {
  it('sends the token only to api.github.com, with no-store caching and no referrer', async () => {
    const { gh, client } = setup();
    await client().getUser();
    const call = gh.calls[0]!;
    expect(new URL(call.url).origin).toBe('https://api.github.com');
    expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.init?.cache).toBe('no-store');
    expect(call.init?.credentials).toBe('omit');
    expect(call.url).not.toContain(TOKEN);
  });

  it('verifies repository access explicitly', async () => {
    const { client } = setup();
    await expect(client().verifyRepositoryAccess(repo)).resolves.toMatchObject({ full_name: 'fariesen/company-of-1-it' });
  });

  it('maps a 404 on the repository to no-access for an authenticated user without permission', async () => {
    const { client } = setup();
    await expect(client('other').verifyRepositoryAccess(repo)).rejects.toMatchObject({ kind: 'no-access' });
  });

  it('maps 401 (expired or revoked credentials) to auth-expired without leaking the token', async () => {
    const { client } = setup({ tokens: { [TOKEN]: { login: 'fariesen', repos: [], expired: true } } });
    const err = await client().getUser().catch((e: Error) => e);
    expect(err).toMatchObject({ kind: 'auth-expired' });
    expect(String((err as Error).message)).not.toContain(TOKEN);
  });

  it('detects rate limiting and reports the retry time', async () => {
    const { client } = setup({ rateLimited: true });
    const err = await client().getUser().catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'rate-limited' });
    expect((err as { retryAt: number }).retryAt).toBeGreaterThan(Date.now());
  });

  it('uses ETags: an unchanged tree is served from memory after a 304', async () => {
    const { gh, client } = setup();
    const c = client();
    const t1 = await c.getTree(repo);
    await c.getTree(repo);
    const treeCalls = gh.calls.filter((x) => x.url.includes('/git/trees/'));
    expect(treeCalls[1]!.headers['If-None-Match']).toBe('"tree-1"');
    expect((await c.getTree(repo)).tree).toEqual(t1.tree);
  });

  it('caches immutable blobs by SHA and clears everything on clear()', async () => {
    const { gh, client } = setup();
    const c = client();
    const tree = await c.getTree(repo);
    const sha = tree.tree[0]!.sha;
    await c.getBlobText(repo, sha, 'README.md');
    await c.getBlobText(repo, sha, 'README.md');
    expect(gh.calls.filter((x) => x.url.includes('/git/blobs/')).length).toBe(1);
    c.clear();
    await c.getBlobText(repo, sha, 'README.md');
    expect(gh.calls.filter((x) => x.url.includes('/git/blobs/')).length).toBe(2);
  });

  it('reports network failures as network errors', async () => {
    const c = new GitHubClient(async () => TOKEN, (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    await expect(c.getUser()).rejects.toMatchObject({ kind: 'network' });
  });

  it('refuses malformed blob SHAs', async () => {
    const { client } = setup();
    await expect(client().getBlobText(repo, '../../etc', 'x')).rejects.toThrow();
  });
});
