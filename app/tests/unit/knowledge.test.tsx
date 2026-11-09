/**
 * IT Hub 0.4.7: central software knowledge (guides), full recipes, device/catalog matching, onboarding
 * and the hand-off to the local Windows agent. The PWA only reads and displays; nothing is executed.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { bootstrapScript, installUrl, LinkError, registerCommand, releaseDownloadUrl, runRecipeCommand } from '../../src/lib/agentLinks';
import { checkVersion, matchCatalogPackage, parseCatalogPackages } from '../../src/lib/catalog';
import { loadHub } from '../../src/lib/content';
import { GitHubClient } from '../../src/lib/github';
import { parseGuide } from '../../src/lib/guides';
import { ParseError } from '../../src/lib/inventory';
import { renderMarkdown } from '../../src/lib/markdown';
import { parseRecipe, stepCommand } from '../../src/lib/recipes';
import { createFakeGitHub, device, privateConfig, publicBootstrap, snapshot } from './fakeGitHub';

const TOKEN = 'github_pat_OWNER_0123456789abcdefghijklmn';
const HASH = 'c'.repeat(64);
const lr = (n: number) => `lr-${n.toString(16).padStart(12, '0')}`;

const catalog = JSON.stringify({
  schemaVersion: 1,
  tags: [{ id: 'development', label: 'Development' }],
  packages: [
    { id: 'git', name: 'Git', publisher: 'Git', category: 'development', status: 'draft', tags: ['development'], baseline: true, recipes: ['git'], versionPolicy: { mode: 'minimum', version: '2.40' }, match: { names: ['^Git( version [0-9.]+)?$'] }, install: { method: 'winget', packageId: 'Git.Git' }, dependencies: [], related: ['github-cli'], documentation: ['https://git-scm.com/doc'] },
    { id: 'github-cli', name: 'GitHub CLI', category: 'development', status: 'draft', versionPolicy: { mode: 'latest' }, match: { names: ['^GitHub CLI$'] } },
    { id: 'blender', name: 'Blender', category: '3d', status: 'draft', versionPolicy: { mode: 'pinned', version: '4.5' }, match: { names: ['^Blender'] } }
  ]
});

const guide = {
  $schema: '../../../schemas/software-guide.schema.json',
  schemaVersion: 1,
  package: 'git',
  updated: '2026-11-09',
  prerequisites: [{ text: 'winget source available', source: 'recipe git' }, { text: '' }],
  knownIssues: [{ id: 'ki-00000000000a', symptom: 'git lfs not found after install', resolution: 'Open a new PowerShell window so PATH is reloaded.', status: 'workaround', learnings: [lr(1), lr(2)], firstSeen: '2026-11-08', devices: ['AIC-002'], reviewStatus: 'proposed' }],
  learnings: [
    { id: lr(1), type: 'error', title: 'git-lfs: command not found', text: 'Right after winget install.', outcome: 'failed', session: 'ls-20261108T190214Z-krja', event: 'e02', device: 'AIC-002', recordedAt: '2026-11-08T19:10:00Z', agentVersion: '0.4.6', observedBy: 'user-reported', status: 'proposed', contentKey: 'sha256:' + 'd'.repeat(64) },
    { id: lr(2), type: 'resolution', title: 'New PowerShell window fixed PATH', resolves: lr(1), session: 'ls-20261108T190214Z-krja', event: 'e03', observedBy: 'user-reported', status: 'accepted', contentKey: 'sha256:' + 'e'.repeat(64) },
    { id: 'not-an-id', type: 'note', title: 'dropped', session: 'ls-20261108T190214Z-krja', event: 'e04', observedBy: 'user-reported', status: 'proposed' }
  ],
  history: [{ date: '2026-11-09', change: 'First learnings from GPU-MURMELI imported (PR).' }]
};

const recipe = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    id: 'git',
    version: '0.2.0',
    package: 'git',
    title: 'Git for Windows',
    status: 'draft',
    privileges: 'admin',
    idempotency: 'Skipped when Git 2.40+ is present.',
    rollback: 'Uninstall Git from Settings > Apps.',
    limitations: ['user.name is personal'],
    troubleshooting: [{ symptom: 'winget not found', fix: 'Install App Installer', observedBy: 'user-reported' }],
    history: [{ version: '0.2.0', date: '2026-11-08', change: 'Added git lfs install.' }],
    steps: [
      { id: 'has-git', type: 'check-command', description: 'Git is already installed', command: 'git', minVersion: '2.40' },
      { id: 'install', type: 'winget-install', description: 'Install Git for Windows', packageId: 'Git.Git', scope: 'machine', privileges: 'admin', skipIf: 'has-git' },
      { id: 'default-branch', type: 'git-config', description: 'Default branch name main', key: 'init.defaultBranch', value: 'main' },
      { id: 'lfs-install', type: 'powershell', description: 'Initialise Git LFS', script: 'git lfs install' },
      { id: 'sign-in', type: 'manual', description: 'Sign in', instructions: 'Sign in to GitHub in the browser.', requiresSignIn: true },
      { id: 'verify', type: 'verify-command', description: 'Git responds', command: 'git', args: ['--version'], expect: '^git version ' }
    ],
    ...over
  });

const softwareCfg = privateConfig({
  sources: {
    inventory: { repository: 'it', path: 'inventory' },
    software: { repository: 'it', path: 'software', catalog: 'software/catalog.json' },
    setup: { repository: 'it', path: 'setup' },
    documentation: [
      { id: 'overview', title: 'Overview', repository: 'it', path: 'README.md' },
      { id: 'software', title: 'Software', repository: 'it', path: 'software' }
    ]
  }
});

const releaseManifest = (releases: unknown[]) => JSON.stringify({ schemaVersion: 1, releases });

function files(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'config/it-hub.json': softwareCfg,
    'README.md': '# IT',
    'software/README.md': '# Software',
    'software/catalog.json': catalog,
    'software/guides/git/guide.json': JSON.stringify(guide),
    'software/guides/git/README.md': '# Git\n\n## Voraussetzungen\n\nwinget.\n\n[open](ithub://install?package=git&recipe=git&version=0.2.0&mode=step)',
    'software/guides/nope/guide.json': JSON.stringify({ ...guide, package: 'nope' }),
    'setup/recipes/git.json': recipe(),
    'setup/recipes/history/git/0.1.0.json': recipe({ version: '0.1.0' }),
    'agent/windows/approved-releases.json': releaseManifest([]),
    'inventory/ai-computers/AIC-002/device.json': device('AIC-002', { name: 'GPU workstation' }),
    'inventory/ai-computers/AIC-002/snapshots/2026-11-08T231104Z.json': snapshot('AIC-002', '2026-11-08T23:11:04Z', [
      { name: 'Git version 2.39.0', version: '2.39.0' },
      { name: 'Blender 4.5', version: '4.5.3' },
      { name: 'Some Tool', version: '1.0' }
    ]),
    'inventory/user-computers/UC-001/device.json': device('UC-001'),
    'inventory/user-computers/UC-001/snapshots/2026-11-07T100000Z.json': snapshot('UC-001', '2026-11-07T10:00:00Z', [{ name: 'Git', version: '2.51.0' }]),
    ...extra
  };
}

function fake(f: Record<string, string>, releases: { tag_name: string; draft: boolean; prerelease: boolean }[] = []) {
  return createFakeGitHub({ repos: [{ owner: 'fariesen', name: 'company-of-1-it', ref: 'main', files: f }], tokens: { [TOKEN]: { login: 'fariesen', repos: ['fariesen/company-of-1-it'] } }, releases });
}

describe('guide parser (software/guides/<id>/guide.json)', () => {
  it('keeps valid items, drops invalid ones and counts them', () => {
    const g = parseGuide(guide, 'software/guides/git/guide.json', 'git');
    expect(g.learnings.map((l) => l.id)).toEqual([lr(1), lr(2)]);
    expect(g.learnings[1]).toMatchObject({ type: 'resolution', resolves: lr(1), status: 'accepted' });
    expect(g.knownIssues[0]).toMatchObject({ status: 'workaround', devices: ['AIC-002'], learnings: [lr(1), lr(2)] });
    expect(g.prerequisites).toHaveLength(1);
    expect(g.skipped).toBe(2);
    expect(g.history[0]!.change).toMatch(/GPU-MURMELI/);
  });
  it('refuses a guide whose package does not match its folder or schema version', () => {
    expect(() => parseGuide({ ...guide, package: 'blender' }, 'p', 'git')).toThrow(ParseError);
    expect(() => parseGuide({ ...guide, schemaVersion: 2 }, 'p', 'git')).toThrow(ParseError);
  });
});

describe('recipes for display', () => {
  it('derives a display command for every step type', () => {
    const r = parseRecipe(JSON.parse(recipe()), 'setup/recipes/git.json', ['0.1.0', 'bad']);
    expect(r.steps.map((s) => s.command)).toEqual([
      'git   # needs 2.40 or newer',
      'winget install --id Git.Git --exact --scope machine --silent --accept-package-agreements --accept-source-agreements',
      'git config --global init.defaultBranch main',
      'git lfs install',
      'Sign in to GitHub in the browser.',
      "git --version   # expect: ^git version "
    ]);
    expect(r.steps[4]!.commandKind).toBe('instruction');
    expect(r.archivedVersions).toEqual(['0.1.0']);
    expect(stepCommand({ type: 'env-var', name: 'X', value: "a b'c" }).command).toBe("[Environment]::SetEnvironmentVariable(X, 'a b''c', 'User')");
    expect(stepCommand({ type: 'vscode-extension', extensionId: 'ms-python.python' }).command).toBe('code --install-extension ms-python.python');
  });
  it('shows "approved" without an approval record as needs-revision', () => {
    expect(parseRecipe(JSON.parse(recipe({ status: 'approved' })), 'p').state).toBe('needs-revision');
    expect(parseRecipe(JSON.parse(recipe({ status: 'approved', approval: { approvedOn: '2026-11-09', approvedBy: 'owner', contentSha256: HASH } })), 'p').state).toBe('approved');
  });
});

describe('catalog matching and version policy', () => {
  const pk = parseCatalogPackages(JSON.parse(catalog));
  it('matches by exact name first, then by the package name patterns', () => {
    expect(matchCatalogPackage('git', pk)?.id).toBe('git');
    expect(matchCatalogPackage('Git version 2.39.0', pk)?.id).toBe('git');
    expect(matchCatalogPackage('Blender 4.5', pk)?.id).toBe('blender');
    expect(matchCatalogPackage('Gitter', pk)).toBeUndefined();
  });
  it('checks minimum and pinned policies and never calls an unknown version ok', () => {
    const git = pk.find((p) => p.id === 'git')!;
    const blender = pk.find((p) => p.id === 'blender')!;
    expect(checkVersion('2.51.0', git)).toBe('ok');
    expect(checkVersion('2.39.0', git)).toBe('differs');
    expect(checkVersion('unknown', git)).toBe('unknown');
    expect(checkVersion('4.5.3', blender)).toBe('ok');
    expect(checkVersion('4.4.1', blender)).toBe('differs');
    expect(checkVersion('1.0', pk.find((p) => p.id === 'github-cli')!)).toBe('unmanaged');
  });
});

describe('loadHub with guides, full recipes and catalog patterns', () => {
  it('loads the guide and README, full recipes with archived versions, and reports unknown guide folders', async () => {
    const gh = fake(files());
    const data = await loadHub(new GitHubClient(async () => TOKEN, gh.fetch), publicBootstrap);
    expect(Object.keys(data.guides)).toEqual(['git']);
    expect(data.guides.git!.guide!.learnings).toHaveLength(2);
    expect(data.guides.git!.readme!.path).toBe('software/guides/git/README.md');
    expect(data.problems.map((p) => p.path)).toEqual(expect.arrayContaining(['software/guides/nope/guide.json', 'software/guides/git/guide.json']));
    expect(data.recipeDetails.map((r) => `${r.id}@${r.version}`)).toEqual(['git@0.2.0']);
    expect(data.recipeDetails[0]!.archivedVersions).toEqual(['0.1.0']);
    expect(data.catalog.map((p) => p.id)).toEqual(['git', 'github-cli', 'blender']);
    // "Git version 2.39.0" and "Git" both belong to the git package through its name pattern.
    expect(data.software.filter((s) => s.standard?.id === 'git').map((s) => s.name).sort()).toEqual(['Git', 'Git version 2.39.0']);
    expect(data.software.find((s) => s.name === 'GitHub CLI')!.versions).toEqual([]);
  });
  it('a broken guide.json is a content problem, not a crash', async () => {
    const gh = fake(files({ 'software/guides/git/guide.json': '{ not json' }));
    const data = await loadHub(new GitHubClient(async () => TOKEN, gh.fetch), publicBootstrap);
    expect(data.guides.git!.guide).toBeUndefined();
    expect(data.guides.git!.readme).toBeDefined();
    expect(data.problems.find((p) => p.path === 'software/guides/git/guide.json')!.message).toMatch(/not valid JSON/);
  });
  it('keeps the approved SHA-256 of the agent release', async () => {
    const gh = fake(files({ 'agent/windows/approved-releases.json': releaseManifest([{ version: '0.4.7', tag: 'agent-windows-v0.4.7', sha256: HASH, approvedOn: '2026-11-09' }]) }), [{ tag_name: 'agent-windows-v0.4.7', draft: false, prerelease: false }]);
    const data = await loadHub(new GitHubClient(async () => TOKEN, gh.fetch), publicBootstrap);
    expect(data.agentRelease).toMatchObject({ version: '0.4.7', sha256: HASH });
  });
});

describe('agent hand-off links and the bootstrap script', () => {
  it('builds ithub:// install links with ids only and refuses anything else', () => {
    expect(installUrl('git', 'git', '0.2.0', 'step')).toBe('ithub://install?package=git&recipe=git&version=0.2.0&mode=step');
    expect(() => installUrl('git&x=1', 'git', '0.2.0', 'step')).toThrow(LinkError);
    expect(() => installUrl('git', 'git', '0.2', 'step')).toThrow(LinkError);
    expect(() => installUrl('git', 'Git;calc', '0.2.0', 'auto')).toThrow(LinkError);
    expect(() => installUrl('git', 'git', '0.2.0', 'run' as 'step')).toThrow(LinkError);
    expect(runRecipeCommand('git', '0.2.0', 'auto')).toBe('& "$env:LOCALAPPDATA\\ItHubAgent\\ithub-agent.cmd" -RunRecipe git -RecipeVersion 0.2.0 -Mode Auto');
    expect(registerCommand('ai-computer', "x'; calc")).toContain('-FriendlyName <name>');
  });
  it('the bootstrap script embeds the approved hash, reads the token locally and contains no token', () => {
    const s = bootstrapScript({ owner: 'fariesen', repo: 'company-of-1-it', tag: 'agent-windows-v0.4.7', version: '0.4.7', sha256: HASH });
    expect(s).toContain(`$expected = '${HASH}'`);
    expect(s).toContain('Read-Host');
    expect(s).toContain('-AsSecureString');
    expect(s).toContain('ZeroFreeBSTR');
    expect(s).toContain("Accept = 'application/octet-stream'");
    expect(s).toContain('Install-ItHubAgent.ps1');
    expect(s).toMatch(/if \(\$actual -ne \$expected\)/);
    expect(s).not.toMatch(/github_pat_|ghp_|gh auth|git clone/);
    // ASCII only (Windows PowerShell 5.1 reads scripts without a BOM as ANSI).
    expect([...s].every((ch) => ch === '\t' || ch === '\n' || ch === '\r' || (ch >= ' ' && ch <= '~'))).toBe(true);
    expect(() => bootstrapScript({ owner: 'fariesen', repo: 'company-of-1-it', tag: 'agent-windows-v0.4.7', version: '0.4.7', sha256: 'nope' })).toThrow(LinkError);
    expect(releaseDownloadUrl('fariesen', 'company-of-1-it', 'agent-windows-v0.4.7', '0.4.7')).toBe('https://github.com/fariesen/company-of-1-it/releases/download/agent-windows-v0.4.7/it-hub-windows-agent-0.4.7.zip');
  });
  it('Markdown never renders an ithub: link (only the app builds them)', () => {
    const html = renderMarkdown('[run](ithub://install?package=git&recipe=git&version=0.2.0&mode=auto) <a href="ithub://sync">x</a>', { repository: 'it', path: 'software/guides/git/README.md', routeFor: () => null }).html;
    expect(html).not.toMatch(/ithub:/i);
  });
});

describe('IT Hub pages (0.4.7)', () => {
  let gh: ReturnType<typeof createFakeGitHub>;
  const start = (f: Record<string, string>, releases: { tag_name: string; draft: boolean; prerelease: boolean }[] = []) => {
    gh = fake(f, releases);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('config/bootstrap.json')) return new Response(JSON.stringify(publicBootstrap), { status: 200 });
      return gh.fetch(input, init);
    });
  };
  const signIn = async (hash: string) => {
    window.location.hash = hash;
    render(<App />);
    fireEvent.change(await screen.findByLabelText(/fine-grained personal access token/i), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: /sign in with token/i }));
  };
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('software detail: guide, known issues, learnings, devices, recipe steps and the agent hand-off', async () => {
    start(files());
    await signIn('#/hub/software/git');
    // Page title plus the README's own "# Git" heading.
    expect((await screen.findAllByRole('heading', { name: 'Git', level: 1 })).length).toBe(2);
    expect(screen.getByText('git lfs not found after install')).toBeTruthy();
    expect(screen.getByText('Open a new PowerShell window so PATH is reloaded.')).toBeTruthy();
    expect(screen.getByText('git-lfs: command not found')).toBeTruthy();
    expect(screen.getByText(/Resolves: git-lfs: command not found/)).toBeTruthy();
    expect(screen.getByText('winget source available')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Voraussetzungen' })).toBeTruthy();
    expect(screen.getByText(/differs from policy/)).toBeTruthy();
    expect(screen.getByText(/matches policy/)).toBeTruthy();
    expect(screen.getByText('winget install --id Git.Git --exact --scope machine --silent --accept-package-agreements --accept-source-agreements')).toBeTruthy();
    expect(screen.getByText(/the IT Hub never runs commands/)).toBeTruthy();
    const step = screen.getByRole('link', { name: /Step by step \(open agent\)/ });
    expect(step.getAttribute('href')).toBe('ithub://install?package=git&recipe=git&version=0.2.0&mode=step');
    expect(screen.queryByRole('link', { name: /Automatic \(open agent\)/ })).toBeNull();
    expect(screen.getByText(/Automatic: needs an approved recipe/)).toBeTruthy();
    expect(screen.getByText(runRecipeCommand('git', '0.2.0', 'step'))).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/href="ithub:\/\/install\?package=git&amp;recipe=git&amp;version=0\.2\.0&amp;mode=auto"/);
    // The README link to ithub: was stripped by the sanitizer.
    expect(document.querySelector('.prose a[href^="ithub:"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'resolution' }));
    await waitFor(() => expect(screen.queryByText('git-lfs: command not found', { selector: '.t, .t *' })).toBeNull());
  });

  it('software without central knowledge says so', async () => {
    start(files());
    await signIn('#/hub/software/blender');
    expect(await screen.findByText('No central knowledge yet')).toBeTruthy();
    expect(screen.getByText(/No setup recipe for this package yet/)).toBeTruthy();
  });

  it('device detail marks catalog software, links it and filters differing versions', async () => {
    start(files());
    await signIn('#/hub/devices/AIC-002');
    expect(await screen.findByText('Git version 2.39.0')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Git' })[0]!.getAttribute('href')).toBe('#/hub/software/git');
    expect(screen.getByText('not in catalog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Differs from policy \(1\)/ }));
    await waitFor(() => expect(screen.queryByText('Some Tool')).toBeNull());
    expect(screen.getByText('Git version 2.39.0')).toBeTruthy();
    expect(screen.queryByText('Blender 4.5')).toBeNull();
  });

  it('onboarding without an approved release offers no download and no script', async () => {
    start(files());
    await signIn('#/hub/setup-pc');
    expect(await screen.findByText(/No approved agent release yet/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Read-Host/);
    expect(screen.getByText(registerCommand('ai-computer'))).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sync \(open agent\)/ }).getAttribute('href')).toBe('ithub://sync');
    expect(screen.getByRole('link', { name: /Collect learnings \(open agent\)/ }).getAttribute('href')).toBe('ithub://learnings');
  });

  it('onboarding with an approved release offers the download link, the hash and the bootstrap script', async () => {
    start(files({ 'agent/windows/approved-releases.json': releaseManifest([{ version: '0.4.7', tag: 'agent-windows-v0.4.7', sha256: HASH }]) }), [{ tag_name: 'agent-windows-v0.4.7', draft: false, prerelease: false }]);
    await signIn('#/hub/setup-pc');
    const dl = await screen.findByRole('link', { name: /Download it-hub-windows-agent-0\.4\.7\.zip/ });
    expect(dl.getAttribute('href')).toBe('https://github.com/fariesen/company-of-1-it/releases/download/agent-windows-v0.4.7/it-hub-windows-agent-0.4.7.zip');
    expect(screen.getAllByText(HASH).length).toBeGreaterThan(0);
    const script = document.body.textContent ?? '';
    expect(script).toContain('-AsSecureString');
    expect(script).not.toContain(TOKEN);
    fireEvent.change(screen.getByLabelText(/Friendly name/), { target: { value: 'GPU-NEU' } });
    expect(screen.getByText(registerCommand('ai-computer', 'GPU-NEU'))).toBeTruthy();
  });
});
