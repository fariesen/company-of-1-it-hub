import { describe, expect, it } from 'vitest';
import { loadPublicBootstrap, parsePrivateConfig, parsePublicBootstrap } from '../../src/lib/bootstrap';
import { AppError } from '../../src/lib/errors';
import { privateConfig, publicBootstrap } from './fakeGitHub';

const kind = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).kind;
  }
  return 'ok';
};

describe('public bootstrap locator', () => {
  it('accepts the shipped locator', () => {
    const b = parsePublicBootstrap(publicBootstrap);
    expect(b.bootstrap.repository).toBe('company-of-1-it');
    expect(b.auth.methods).toEqual(['fine-grained-token']);
  });

  it('accepts the real public/config/bootstrap.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'config', 'bootstrap.json'), 'utf8'));
    expect(parsePublicBootstrap(raw).bootstrap.owner).toBe('fariesen');
  });

  it('rejects unsupported schema versions with a dedicated error', () => {
    expect(kind(() => parsePublicBootstrap({ ...publicBootstrap, schemaVersion: 2 }))).toBe('unsupported-schema');
  });

  it('rejects owners outside the built-in allowlist', () => {
    expect(kind(() => parsePublicBootstrap({ ...publicBootstrap, bootstrap: { ...publicBootstrap.bootstrap, owner: 'attacker' } }))).toBe('invalid-config');
  });

  it.each([['../secrets.json'], ['/etc/passwd.json'], ['https://evil.example/x.json'], ['config\\it-hub.json'], ['config/it-hub.txt']])('rejects malformed path %s', (path) => {
    expect(kind(() => parsePublicBootstrap({ ...publicBootstrap, bootstrap: { ...publicBootstrap.bootstrap, path } }))).toBe('invalid-config');
  });

  it('rejects unknown keys (no hidden extension points)', () => {
    expect(kind(() => parsePublicBootstrap({ ...publicBootstrap, script: 'alert(1)' }))).toBe('invalid-config');
  });

  it('requires https broker and redirect URLs for GitHub App sign-in', () => {
    const base = { ...publicBootstrap, auth: { methods: ['github-app'], githubApp: { clientId: 'Iv23liABCDEFGHIJ1234', brokerUrl: 'https://broker.example/', redirectUri: 'https://fariesen.github.io/company-of-1-it-hub/' } } };
    expect(parsePublicBootstrap(base).auth.githubApp?.brokerUrl).toBe('https://broker.example/');
    expect(kind(() => parsePublicBootstrap({ ...base, auth: { ...base.auth, githubApp: { ...base.auth.githubApp, brokerUrl: 'http://broker.example/' } } }))).toBe('invalid-config');
    expect(kind(() => parsePublicBootstrap({ ...base, auth: { ...base.auth, githubApp: { ...base.auth.githubApp, brokerUrl: 'javascript:alert(1)' } } }))).toBe('invalid-config');
    expect(kind(() => parsePublicBootstrap({ ...base, auth: { ...base.auth, githubApp: { ...base.auth.githubApp, clientSecret: 'x' } } }))).toBe('invalid-config');
  });

  it('reports a missing bootstrap file', async () => {
    const f = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(loadPublicBootstrap(f)).rejects.toMatchObject({ kind: 'invalid-config' });
  });

  it('reports invalid JSON', async () => {
    const f = (async () => new Response('{not json', { status: 200 })) as unknown as typeof fetch;
    await expect(loadPublicBootstrap(f)).rejects.toMatchObject({ kind: 'invalid-config' });
  });

  it('reports network failures', async () => {
    const f = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(loadPublicBootstrap(f)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('private configuration', () => {
  const cfg = (o: Record<string, unknown> = {}) => JSON.parse(privateConfig(o));

  it('accepts a valid configuration and applies defaults', () => {
    const c = parsePrivateConfig(cfg());
    expect(c.sources.inventory).toEqual({ repository: 'it', path: 'inventory' });
    expect(c.refresh).toEqual({ minIntervalSeconds: 60, onFocus: true });
    expect(c.contentSchemas).toEqual({ device: [1], snapshot: [1] });
  });

  it('accepts the real private config shape from the IT repository', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const url = join(process.cwd(), '..', '..', 'IT', 'config', 'it-hub.json');
    if (!existsSync(url)) return; // private repo not checked out next to the hub (CI)
    const c = parsePrivateConfig(JSON.parse(readFileSync(url, 'utf8')));
    expect(c.sources.documentation.length).toBeGreaterThan(0);
  });

  it('supports additional repositories on the allowlisted owner', () => {
    const c = parsePrivateConfig(
      cfg({
        repositories: { it: { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' }, docs: { owner: 'fariesen', name: 'other-docs', ref: 'v1' } },
        sources: { inventory: { repository: 'it', path: 'inventory' }, documentation: [{ id: 'x', title: 'X', repository: 'docs', path: 'guides' }] }
      })
    );
    expect(Object.keys(c.repositories)).toEqual(['it', 'docs']);
  });

  it('rejects additional repositories of other owners', () => {
    expect(kind(() => parsePrivateConfig(cfg({ repositories: { it: { owner: 'someone-else', name: 'x', ref: 'main' } } })))).toBe('invalid-config');
  });

  it('rejects references to undeclared repositories', () => {
    expect(kind(() => parsePrivateConfig(cfg({ sources: { inventory: { repository: 'nope', path: 'inventory' }, documentation: [] } })))).toBe('invalid-config');
  });

  it('rejects path traversal and URLs in sources', () => {
    for (const path of ['../other', 'https://x.example', '/abs', 'a//b', 'a/./b']) {
      expect(kind(() => parsePrivateConfig(cfg({ sources: { inventory: { repository: 'it', path }, documentation: [] } })))).toBe('invalid-config');
    }
  });

  it('rejects unsupported config schema versions', () => {
    expect(kind(() => parsePrivateConfig(cfg({ schemaVersion: 3 })))).toBe('unsupported-schema');
  });

  it('rejects non-boolean feature flags and unknown fields', () => {
    expect(kind(() => parsePrivateConfig(cfg({ features: { agentStatus: 'yes' } })))).toBe('invalid-config');
    expect(kind(() => parsePrivateConfig(cfg({ hooks: { onLoad: 'fetch()' } })))).toBe('invalid-config');
  });

  it('rejects duplicate documentation ids', () => {
    const docs = [
      { id: 'a', title: 'A', repository: 'it', path: 'x' },
      { id: 'a', title: 'B', repository: 'it', path: 'y' }
    ];
    expect(kind(() => parsePrivateConfig(cfg({ sources: { inventory: { repository: 'it', path: 'inventory' }, documentation: docs } })))).toBe('invalid-config');
  });
});
