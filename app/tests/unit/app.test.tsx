import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createFakeGitHub, device, privateConfig, publicBootstrap, snapshot } from './fakeGitHub';

const OWNER_TOKEN = 'github_pat_OWNER_0123456789abcdefghijklmn';
const OUTSIDER_TOKEN = 'github_pat_OUTSIDER_0123456789abcdefghijk';

let gh: ReturnType<typeof createFakeGitHub>;
let tokens: Parameters<typeof createFakeGitHub>[0]['tokens'];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  tokens = {
    [OWNER_TOKEN]: { login: 'fariesen', repos: ['fariesen/company-of-1-it'] },
    [OUTSIDER_TOKEN]: { login: 'outsider', repos: [] }
  };
  gh = createFakeGitHub({
    repos: [
      {
        owner: 'fariesen',
        name: 'company-of-1-it',
        ref: 'main',
        files: {
          'config/it-hub.json': privateConfig(),
          'README.md': '# IT Department\n\nWelcome.',
          'setup/README.md': '# Setup\n\n## Phase 1\n\nBase installation.',
          'inventory/ai-computers/AIC-001/device.json': device('AIC-001', { name: 'Example workstation', aliases: ['PC1'], hardware: { manufacturer: 'ExampleCorp', gpu: 'Example GPU X1' } }),
          'inventory/ai-computers/AIC-001/snapshots/2026-11-05T100000Z.json': snapshot('AIC-001', '2026-11-05T10:00:00Z', [{ name: 'Git', version: '2.51' }])
        }
      }
    ],
    tokens
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('config/bootstrap.json')) return new Response(JSON.stringify(publicBootstrap), { status: 200 });
    return gh.fetch(input, init);
  });
  window.location.hash = '#/hub';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function signIn(token: string) {
  render(<App />);
  const input = await screen.findByLabelText(/fine-grained personal access token/i);
  fireEvent.change(input, { target: { value: token } });
  fireEvent.click(screen.getByRole('button', { name: /sign in with token/i }));
}

describe('IT Hub app', () => {
  it('shows the prototype sign-in when no session exists, and never a password field for GitHub', async () => {
    render(<App />);
    expect(await screen.findByText(/prototype sign-in/i)).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('refuses classic tokens before contacting GitHub', async () => {
    await signIn('ghp' + '_' + 'x'.repeat(36));
    expect(await screen.findByText(/only accepts fine-grained tokens/i)).toBeTruthy();
    expect(gh.calls).toHaveLength(0);
  });

  it('signs in, verifies access, loads the inventory and renders the dashboard', async () => {
    await signIn(OWNER_TOKEN);
    expect(await screen.findByText(/Hello, fariesen/)).toBeTruthy();
    expect(screen.getAllByText(/AIC-001/).length).toBeGreaterThan(0);
    expect(gh.calls.some((c) => c.url.endsWith('/repos/fariesen/company-of-1-it'))).toBe(true);
    expect(sessionStorage.getItem('it-hub.session.v1')).toContain('fariesen');
    expect(localStorage.getItem('it-hub.session.v1')).toBeNull();
  });

  it('routes to a device by legacy alias and shows declared vs captured values', async () => {
    await signIn(OWNER_TOKEN);
    await screen.findByText(/Hello, fariesen/);
    act(() => {
      window.location.hash = '#/hub/devices/PC1';
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'AIC-001 · Example workstation' })).toBeTruthy();
    const observed = [...document.querySelectorAll('.observed')].map((e) => e.textContent);
    expect(observed).toContain('Declared: Example GPU X1 differs');
    expect(observed).toContain('Declared: unknown');
    expect(screen.getByText('Git')).toBeTruthy();
  });

  it('renders documentation safely with headings', async () => {
    await signIn(OWNER_TOKEN);
    await screen.findByText(/Hello, fariesen/);
    act(() => {
      window.location.hash = '#/hub/docs/it/setup/README.md';
    });
    expect(await screen.findByRole('heading', { name: 'Phase 1' })).toBeTruthy();
  });

  it('a signed-in account without repository access gets no private content', async () => {
    await signIn(OUTSIDER_TOKEN);
    expect(await screen.findByText(/No access to the IT repository/)).toBeTruthy();
    expect(screen.getByText(/Being signed in to GitHub is not enough/)).toBeTruthy();
    expect(screen.queryByText(/AIC-001/)).toBeNull();
    expect(gh.calls.some((c) => c.url.includes('/contents/') || c.url.includes('/git/'))).toBe(false);
  });

  it('expired or revoked credentials end the session and wipe content on refresh', async () => {
    await signIn(OWNER_TOKEN);
    await screen.findByText(/Hello, fariesen/);
    tokens[OWNER_TOKEN]!.expired = true;
    fireEvent.click(screen.getByRole('button', { name: /refresh from github/i }));
    expect(await screen.findByText(/session has expired/i)).toBeTruthy();
    expect(screen.queryByText(/Hello, fariesen/)).toBeNull();
    expect(sessionStorage.getItem('it-hub.session.v1')).toBeNull();
  });

  it('revoked collaborator access hides content on the next refresh', async () => {
    await signIn(OWNER_TOKEN);
    await screen.findByText(/Hello, fariesen/);
    tokens[OWNER_TOKEN]!.repos = [];
    fireEvent.click(screen.getByRole('button', { name: /refresh from github/i }));
    expect(await screen.findByText(/No access to the IT repository/)).toBeTruthy();
    expect(screen.queryByText(/Hello, fariesen/)).toBeNull();
  });

  it('logout clears the session; signing in again works (reauthentication)', async () => {
    await signIn(OWNER_TOKEN);
    await screen.findByText(/Hello, fariesen/);
    fireEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0]!);
    expect(await screen.findByText(/prototype sign-in/i)).toBeTruthy();
    expect(sessionStorage.getItem('it-hub.session.v1')).toBeNull();
    const input = await screen.findByLabelText(/fine-grained personal access token/i);
    fireEvent.change(input, { target: { value: OWNER_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: /sign in with token/i }));
    await waitFor(() => expect(screen.getByText(/Hello, fariesen/)).toBeTruthy());
  });

  it('shows the landing page at the root', async () => {
    window.location.hash = '#/';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /every device, guide and setup step/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /iPhone/ })).toBeTruthy();
  });
});
