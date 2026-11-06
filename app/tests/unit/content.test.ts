import { describe, expect, it } from 'vitest';
import { loadHub } from '../../src/lib/content';
import { GitHubClient } from '../../src/lib/github';
import { createFakeGitHub, device, privateConfig, publicBootstrap, snapshot } from './fakeGitHub';

const TOKEN = 'tok';

function hub(files: Record<string, string>, extra: Partial<Parameters<typeof createFakeGitHub>[0]> = {}) {
  const gh = createFakeGitHub({
    repos: [{ owner: 'fariesen', name: 'company-of-1-it', ref: 'main', files }],
    tokens: { [TOKEN]: { login: 'fariesen', repos: ['fariesen/company-of-1-it'] }, outsider: { login: 'outsider', repos: [] } },
    commits: [{ sha: 'a'.repeat(40), message: 'Register AIC-001', date: '2026-11-06T10:00:00Z' }],
    releases: [
      { tag_name: 'agent-windows-v0.2.0', draft: true, prerelease: false },
      { tag_name: 'agent-windows-v0.1.1', draft: false, prerelease: false },
      { tag_name: 'agent-windows-v0.1.10', draft: false, prerelease: false },
      { tag_name: 'agent-windows-v0.3.0-rc1', draft: false, prerelease: true }
    ],
    ...extra
  });
  const client = (t = TOKEN) => new GitHubClient(async () => t, gh.fetch);
  return { gh, client };
}

const base = {
  'config/it-hub.json': privateConfig(),
  'README.md': '# IT Department\n\nSee [setup](setup/README.md).',
  'setup/README.md': '# Setup\n\nGuides.',
  'setup/profiles/ai-computer.md': '# AI computer profile',
  'inventory/ai-computers/AIC-001/device.json': device('AIC-001', { aliases: ['PC1'] }),
  'inventory/ai-computers/AIC-001/DEVICE.md': '# AIC-001',
  'inventory/ai-computers/AIC-001/snapshots/2026-11-01T100000Z.json': snapshot('AIC-001', '2026-11-01T10:00:00Z', [{ name: 'Git', version: '2.50' }]),
  'inventory/ai-computers/AIC-001/snapshots/2026-11-05T100000Z.json': snapshot('AIC-001', '2026-11-05T10:00:00Z', [{ name: 'Git', version: '2.51' }, { name: 'Node.js', version: '24' }]),
  'inventory/user-computers/UC-001/device.json': device('UC-001', { lifecycle: 'planned' })
};

describe('loadHub', () => {
  it('loads devices, newest snapshots, docs, software, history and the approved agent release', async () => {
    const { client } = hub(base);
    const data = await loadHub(client(), publicBootstrap);
    expect(data.devices.map((d) => d.id)).toEqual(['AIC-001', 'UC-001']);
    const aic = data.devices[0]!;
    expect(aic.aliases).toEqual(['PC1']);
    expect(aic.snapshot?.collectedAt).toBe('2026-11-05T10:00:00Z');
    expect(aic.snapshotCount).toBe(2);
    expect(data.devices[1]!.snapshot).toBeUndefined();
    expect(data.software.map((s) => s.name)).toEqual(['Git', 'Node.js']);
    expect(data.docs.map((d) => d.path).sort()).toEqual(['README.md', 'setup/README.md', 'setup/profiles/ai-computer.md']);
    expect(data.recentChanges).toHaveLength(1);
    expect(data.agentRelease?.version).toBe('0.1.10');
    expect(data.problems).toEqual([]);
  });

  it('refuses to load anything for an account without repository access', async () => {
    const { client, gh } = hub(base);
    await expect(loadHub(client('outsider'), publicBootstrap)).rejects.toMatchObject({ kind: 'no-access' });
    expect(gh.calls.some((c) => c.url.includes('/contents/') || c.url.includes('/git/'))).toBe(false);
  });

  it('reports a missing private configuration', async () => {
    const { client } = hub({ 'README.md': '# x' });
    await expect(loadHub(client(), publicBootstrap)).rejects.toMatchObject({ kind: 'invalid-config' });
  });

  it('reports an invalid private configuration', async () => {
    const { client } = hub({ ...base, 'config/it-hub.json': '{"schemaVersion":1}' });
    await expect(loadHub(client(), publicBootstrap)).rejects.toMatchObject({ kind: 'invalid-config' });
  });

  it('reports an unsupported private configuration version', async () => {
    const { client } = hub({ ...base, 'config/it-hub.json': privateConfig({ schemaVersion: 2 }) });
    await expect(loadHub(client(), publicBootstrap)).rejects.toMatchObject({ kind: 'unsupported-schema' });
  });

  it('fails closed when an additional configured repository is not accessible', async () => {
    const cfg = privateConfig({
      repositories: { it: { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' }, extra: { owner: 'fariesen', name: 'missing-repo', ref: 'main' } },
      sources: { inventory: { repository: 'it', path: 'inventory' }, documentation: [{ id: 'x', title: 'X', repository: 'extra', path: 'docs' }] }
    });
    const { client } = hub({ ...base, 'config/it-hub.json': cfg });
    await expect(loadHub(client(), publicBootstrap)).rejects.toMatchObject({ kind: 'no-access' });
  });

  it('turns malformed records into content problems instead of failing', async () => {
    const { client } = hub({
      ...base,
      'inventory/user-computers/UC-002/device.json': '{ broken',
      'inventory/user-computers/UC-003/device.json': device('UC-003', { schemaVersion: 9 }),
      'inventory/user-computers/UC-004/device.json': device('UC-004', { lifecycle: 'lost' }),
      'inventory/user-computers/UC-001/snapshots/2026-11-02T000000Z.json': snapshot('AIC-001', '2026-11-02T00:00:00Z')
    });
    const data = await loadHub(client(), publicBootstrap);
    expect(data.devices.map((d) => d.id)).toEqual(['AIC-001', 'UC-001']);
    expect(data.problems.map((p) => p.path).sort()).toEqual([
      'inventory/user-computers/UC-001/snapshots/2026-11-02T000000Z.json',
      'inventory/user-computers/UC-002/device.json',
      'inventory/user-computers/UC-003/device.json',
      'inventory/user-computers/UC-004/device.json'
    ]);
  });

  it('detects duplicate device IDs', async () => {
    const { client } = hub({ ...base, 'inventory/ai-computers/AIC-001-copy/device.json': device('AIC-001') });
    const data = await loadHub(client(), publicBootstrap);
    expect(data.problems.some((p) => p.message.includes('Duplicate device ID AIC-001'))).toBe(true);
  });

  it('refresh with unchanged content re-downloads no files', async () => {
    const { client, gh } = hub(base);
    const c = client();
    await loadHub(c, publicBootstrap);
    const blobsBefore = gh.calls.filter((x) => x.url.includes('/git/blobs/')).length;
    const second = await loadHub(c, publicBootstrap);
    expect(gh.calls.filter((x) => x.url.includes('/git/blobs/')).length).toBe(blobsBefore);
    expect(second.devices).toHaveLength(2);
  });
});
