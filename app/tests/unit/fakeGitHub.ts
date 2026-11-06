/**
 * In-memory fake of the GitHub REST endpoints the IT Hub uses. It enforces a token -> repository
 * access map so authorization paths can be tested. This is a test double: it proves the app's
 * handling of GitHub responses, not that real GitHub authentication works.
 */
import { createHash } from 'node:crypto';

export interface FakeRepo {
  owner: string;
  name: string;
  ref: string;
  files: Record<string, string>;
  private?: boolean;
}

export interface FakeOptions {
  repos: FakeRepo[];
  /** token -> { login, repos it can read } */
  tokens: Record<string, { login: string; repos: string[]; expired?: boolean }>;
  commits?: { sha: string; message: string; date: string }[];
  releases?: { tag_name: string; draft: boolean; prerelease: boolean }[];
  rateLimited?: boolean;
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex');

export function createFakeGitHub(opts: FakeOptions) {
  const calls: { url: string; headers: Record<string, string>; init?: RequestInit }[] = [];
  let treeVersion = 1;

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 304 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-RateLimit-Limit': '5000', 'X-RateLimit-Remaining': '4990', ...headers } });
  const text = (body: string) => new Response(body, { status: 200, headers: { 'X-RateLimit-Remaining': '4990' } });

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: url.href, headers, init });
    if (url.origin !== 'https://api.github.com') throw new TypeError('unexpected host ' + url.origin);
    if (opts.rateLimited) return json(403, { message: 'API rate limit exceeded' }, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 600) });

    const token = (headers.Authorization ?? '').replace(/^Bearer /, '');
    const who = opts.tokens[token];
    if (!who || who.expired) return json(401, { message: 'Bad credentials' });
    if (url.pathname === '/user') return json(200, { login: who.login, name: null, avatar_url: 'https://avatars.githubusercontent.com/u/1' });

    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return json(404, { message: 'Not Found' });
    const full = `${decodeURIComponent(m[1]!)}/${decodeURIComponent(m[2]!)}`;
    const repo = opts.repos.find((r) => `${r.owner}/${r.name}` === full);
    if (!repo || !who.repos.includes(full)) return json(404, { message: 'Not Found' });
    const rest = m[3] ?? '';

    if (rest === '') return json(200, { full_name: full, private: repo.private ?? true, default_branch: repo.ref, permissions: { pull: true, push: false, admin: false } });
    if (rest.startsWith('/git/trees/')) {
      const etag = `"tree-${treeVersion}"`;
      if (headers['If-None-Match'] === etag) return json(304, null, { ETag: etag });
      const tree = Object.entries(repo.files).map(([path, content]) => ({ path, type: 'blob', sha: sha(content), size: content.length }));
      return json(200, { sha: 'root', truncated: false, tree }, { ETag: etag });
    }
    if (rest.startsWith('/git/blobs/')) {
      const want = rest.slice('/git/blobs/'.length);
      const hit = Object.values(repo.files).find((c) => sha(c) === want);
      return hit === undefined ? json(404, { message: 'Not Found' }) : text(hit);
    }
    if (rest.startsWith('/contents/')) {
      const path = decodeURIComponent(rest.slice('/contents/'.length));
      const hit = repo.files[path];
      return hit === undefined ? json(404, { message: 'Not Found' }) : text(hit);
    }
    if (rest === '/commits') return json(200, (opts.commits ?? []).map((c) => ({ sha: c.sha, html_url: 'https://github.com/x', commit: { message: c.message, author: { name: 'Owner', date: c.date } } })));
    if (rest === '/releases') return json(200, (opts.releases ?? []).map((r) => ({ ...r, name: r.tag_name, published_at: '2026-11-01T00:00:00Z', html_url: 'https://github.com/x' })));
    return json(404, { message: 'Not Found' });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    bumpTree: () => {
      treeVersion++;
    }
  };
}

export const device = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    category: id.startsWith('AIC') ? 'ai-computer' : 'user-computer',
    name: `Device ${id}`,
    lifecycle: 'active',
    hardware: { manufacturer: 'unknown', gpu: 'unknown' },
    updated: '2026-11-06',
    ...extra
  });

export const snapshot = (deviceId: string, collectedAt: string, software: { name: string; version?: string }[] = []) =>
  JSON.stringify({
    schemaVersion: 1,
    deviceId,
    collectedAt,
    agent: { name: 'it-hub-windows-agent', version: '0.1.0' },
    identity: { identityHash: 'unknown', hostname: 'HOST', manufacturer: 'Maker', model: 'Model X' },
    os: { caption: 'Windows 11 Pro', version: '10.0.26100', build: '26100' },
    cpu: [{ name: 'CPU One' }],
    memory: { totalGB: 32 },
    storage: [{ model: 'SSD', sizeGB: 1000 }],
    gpu: [{ name: 'GPU One' }, { name: 'Parsec Virtual Display Adapter', virtual: true }],
    network: [],
    software,
    diagnostics: [{ section: 'software', status: 'ok' }]
  });

export const privateConfig = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    application: { name: 'Test Hub', configVersion: 't1' },
    repositories: { it: { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' } },
    sources: {
      inventory: { repository: 'it', path: 'inventory' },
      setup: { repository: 'it', path: 'setup' },
      documentation: [
        { id: 'overview', title: 'Overview', repository: 'it', path: 'README.md' },
        { id: 'setup', title: 'Setup', repository: 'it', path: 'setup' }
      ]
    },
    agent: { windows: { repository: 'it', releaseTagPrefix: 'agent-windows-v' } },
    features: { agentStatus: true },
    ...overrides
  });

export const publicBootstrap = {
  schemaVersion: 1 as const,
  bootstrap: { provider: 'github' as const, owner: 'fariesen', repository: 'company-of-1-it', ref: 'main', path: 'config/it-hub.json' },
  auth: { methods: ['fine-grained-token' as const] }
};
