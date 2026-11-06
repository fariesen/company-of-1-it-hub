/**
 * Loads the real, local IT repository working tree (../../IT) through loadHub via the fake GitHub
 * API. This verifies that the actual private configuration, device records and documentation parse
 * correctly before they are pushed. Skipped when the IT repository is not checked out next to the hub.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHub } from '../../src/lib/content';
import { GitHubClient } from '../../src/lib/github';
import { createFakeGitHub, publicBootstrap } from './fakeGitHub';

const root = join(process.cwd(), '..', '..', 'IT');

function readTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, readTree(full));
    else if (/\.(md|json)$/.test(name)) out[relative(root, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
  }
  return out;
}

describe.skipIf(!existsSync(join(root, 'config', 'it-hub.json')))('local IT repository content', () => {
  it('loads with the real private configuration and no content problems', async () => {
    const gh = createFakeGitHub({
      repos: [{ owner: 'fariesen', name: 'company-of-1-it', ref: 'main', files: readTree(root) }],
      tokens: { t: { login: 'fariesen', repos: ['fariesen/company-of-1-it'] } }
    });
    const data = await loadHub(new GitHubClient(async () => 't', gh.fetch), publicBootstrap);
    const aic = data.devices.find((d) => d.id === 'AIC-001');
    expect(aic).toBeDefined();
    expect(aic!.hardware.gpu).not.toBe('');
    expect(aic!.hardware.cpu).toBe('unknown');
    expect(data.docs.some((d) => d.path === 'README.md')).toBe(true);
    expect(data.docs.some((d) => d.path === 'agent/windows/README.md')).toBe(true);
    expect(data.problems).toEqual([]);
  });
});
