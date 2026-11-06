import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeChallenge } from '../../src/lib/auth/pkce';
import { clearSession, loadSession, saveSession, type Session } from '../../src/lib/auth/session';
import { validateTokenFormat } from '../../src/lib/auth/token';
import { completeGitHubAppLogin, startGitHubAppLogin, takeCallbackParams } from '../../src/lib/auth/githubApp';

const appCfg = { clientId: 'Iv23liABCDEFGHIJ1234', brokerUrl: 'https://broker.example/', redirectUri: 'https://fariesen.github.io/company-of-1-it-hub/' };

describe('PKCE', () => {
  it('matches the RFC 7636 test vector', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('token prototype', () => {
  it('accepts fine-grained tokens', () => {
    expect(validateTokenFormat('  github_pat_11AAAAAAA0abcdefghijklmnopqrstuv  ')).toBe('github_pat_11AAAAAAA0abcdefghijklmnopqrstuv');
  });
  it.each(['ghp' + '_' + 'x'.repeat(36), 'gho' + '_' + 'x'.repeat(36)])('refuses broad classic/OAuth tokens: %s', (t) => {
    expect(() => validateTokenFormat(t)).toThrow(/fine-grained/);
  });
  it('refuses empty and malformed input', () => {
    expect(() => validateTokenFormat('')).toThrow();
    expect(() => validateTokenFormat('password123')).toThrow();
  });
});

describe('session storage', () => {
  const s = (o: Partial<Session> = {}): Session => ({ method: 'fine-grained-token', accessToken: 't', login: 'u', persist: false, createdAt: Date.now(), ...o });
  afterEach(() => {
    clearSession();
  });

  it('keeps non-persistent sessions in sessionStorage only', () => {
    saveSession(s());
    expect(sessionStorage.getItem('it-hub.session.v1')).not.toBeNull();
    expect(localStorage.getItem('it-hub.session.v1')).toBeNull();
  });

  it('keeps "remember me" sessions in localStorage only', () => {
    saveSession(s({ persist: true }));
    expect(localStorage.getItem('it-hub.session.v1')).not.toBeNull();
    expect(sessionStorage.getItem('it-hub.session.v1')).toBeNull();
  });

  it('drops expired sessions without a usable refresh token', () => {
    saveSession(s({ expiresAt: Date.now() - 1000 }));
    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem('it-hub.session.v1')).toBeNull();
  });

  it('drops corrupted session data', () => {
    sessionStorage.setItem('it-hub.session.v1', '{"method":"evil"}');
    expect(loadSession()).toBeNull();
  });

  it('logout clears both stores', () => {
    saveSession(s({ persist: true }));
    clearSession();
    expect(loadSession()).toBeNull();
  });
});

describe('GitHub App web flow (broker mocked - does not prove real GitHub OAuth)', () => {
  let assigned = '';
  beforeEach(() => {
    localStorage.clear();
    assigned = '';
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign: (u: string) => (assigned = u) } as Location);
  });
  afterEach(() => vi.restoreAllMocks());

  it('redirects to GitHub with state and an S256 code challenge, without any secret', async () => {
    await startGitHubAppLogin(appCfg, false);
    const url = new URL(assigned);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(url.searchParams.get('redirect_uri')).toBe(appCfg.redirectUri);
    expect(url.search).not.toMatch(/secret|scope/i);
  });

  it('treats a cancelled authorization as auth-cancelled', async () => {
    await expect(completeGitHubAppLogin(appCfg, { error: 'access_denied' }, async () => 'u')).rejects.toMatchObject({ kind: 'auth-cancelled' });
  });

  it('rejects a callback whose state does not match (CSRF / login injection)', async () => {
    await startGitHubAppLogin(appCfg, false);
    await expect(completeGitHubAppLogin(appCfg, { code: 'c', state: 'forged' }, async () => 'u')).rejects.toMatchObject({ kind: 'auth-cancelled' });
  });

  it('exchanges the code via the broker with the PKCE verifier and keeps no refresh token by default', async () => {
    await startGitHubAppLogin(appCfg, false);
    const state = new URL(assigned).searchParams.get('state')!;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_y', refresh_token_expires_in: 15897600 }), { status: 200 })
    );
    const session = await completeGitHubAppLogin(appCfg, { code: 'code123', state }, async () => 'fariesen');
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://broker.example/token');
    const body = JSON.parse(String(init!.body));
    expect(body.code).toBe('code123');
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(session.login).toBe('fariesen');
    expect(session.refreshToken).toBeUndefined();
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(localStorage.getItem('it-hub.pending-login.v1')).toBeNull();
  });

  it('a pending login can only be used once', async () => {
    await startGitHubAppLogin(appCfg, false);
    const state = new URL(assigned).searchParams.get('state')!;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'ghu_x' }), { status: 200 }));
    await completeGitHubAppLogin(appCfg, { code: 'c', state }, async () => 'u');
    await expect(completeGitHubAppLogin(appCfg, { code: 'c', state }, async () => 'u')).rejects.toMatchObject({ kind: 'auth-cancelled' });
  });
});

describe('callback URL handling', () => {
  it('removes the one-time code from the address bar', () => {
    window.history.replaceState(null, '', '/?code=abc&state=xyz#/hub');
    const p = takeCallbackParams();
    expect(p).toEqual({ code: 'abc', state: 'xyz', error: undefined });
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/hub');
  });
});
