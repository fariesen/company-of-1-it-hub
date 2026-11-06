/**
 * PRODUCTION sign-in (requires an approved token broker): GitHub App user-to-server tokens.
 *
 * Why a broker: GitHub's token endpoint requires the app's client secret even with PKCE, and it does
 * not send CORS headers, so a static site cannot complete the exchange. The broker is a stateless
 * function that holds the secret, accepts only this app's origin and redirect URI, and returns the
 * token to the browser. It stores nothing.
 *
 * Least privilege: the GitHub App requests only Contents: read (+ Metadata: read) and is installed
 * only on the IT repository. GitHub limits the resulting user token to the intersection of the app's
 * permissions/installation and the user's own repository access, and expires it after 8 hours.
 */
import { AppError } from '../errors';
import type { PublicBootstrap } from '../bootstrap';
import { codeChallenge, randomString } from './pkce';
import type { Session } from './session';

type AppConfig = NonNullable<PublicBootstrap['auth']['githubApp']>;

const PENDING_KEY = 'it-hub.pending-login.v1';
const PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingLogin {
  state: string;
  verifier: string;
  createdAt: number;
  persist: boolean;
}

interface BrokerTokens {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
}

export async function startGitHubAppLogin(cfg: AppConfig, persist: boolean): Promise<void> {
  const pending: PendingLogin = { state: randomString(32), verifier: randomString(48), createdAt: Date.now(), persist };
  // localStorage (not sessionStorage) so the pending login survives the hop to github.com and back,
  // which on iOS may happen in a different browsing context. It holds no credential; the verifier is
  // useless without the one-time code, and it is deleted on return or after 10 minutes.
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', pending.state);
  url.searchParams.set('code_challenge', await codeChallenge(pending.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'false');
  window.location.assign(url.href);
}

/** Reads ?code=&state= (or ?error=) from the current URL, then removes them from the address bar. */
export function takeCallbackParams(): { code?: string; state?: string; error?: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') ?? undefined;
  const state = params.get('state') ?? undefined;
  const error = params.get('error') ?? undefined;
  if (!code && !error) return null;
  // Remove the one-time code from the URL immediately so it is not kept in history or shared.
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  return { code, state, error };
}

async function callBroker(cfg: AppConfig, endpoint: 'token' | 'refresh' | 'revoke', body: Record<string, string>): Promise<BrokerTokens | null> {
  let res: Response;
  try {
    res = await fetch(new URL(endpoint, cfg.brokerUrl.endsWith('/') ? cfg.brokerUrl : cfg.brokerUrl + '/').href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
  } catch {
    throw new AppError('network', 'Could not reach the sign-in service. Check your connection.');
  }
  if (endpoint === 'revoke') return null;
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) throw new AppError('auth-expired', 'GitHub did not accept the sign-in. Please try again.');
    throw new AppError('server', `The sign-in service returned an error (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as Partial<BrokerTokens>;
  if (typeof json.access_token !== 'string' || !json.access_token) throw new AppError('server', 'The sign-in service returned an unexpected response.');
  return json as BrokerTokens;
}

function toSession(t: BrokerTokens, login: string, persist: boolean): Session {
  const now = Date.now();
  return {
    method: 'github-app',
    accessToken: t.access_token,
    expiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined,
    // A refresh token is only kept when the user asked to stay signed in.
    refreshToken: persist ? t.refresh_token : undefined,
    refreshExpiresAt: persist && t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : undefined,
    login,
    persist,
    createdAt: now
  };
}

export async function completeGitHubAppLogin(
  cfg: AppConfig,
  params: { code?: string; state?: string; error?: string },
  resolveLogin: (accessToken: string) => Promise<string>
): Promise<Session> {
  const raw = localStorage.getItem(PENDING_KEY);
  localStorage.removeItem(PENDING_KEY);
  if (params.error) {
    throw new AppError('auth-cancelled', params.error === 'access_denied' ? 'Sign-in was cancelled on GitHub.' : 'GitHub reported a sign-in error.');
  }
  let pending: PendingLogin | null;
  try {
    pending = raw ? (JSON.parse(raw) as PendingLogin) : null;
  } catch {
    pending = null;
  }
  if (!pending || !params.state || pending.state !== params.state || Date.now() - pending.createdAt > PENDING_TTL_MS) {
    throw new AppError('auth-cancelled', 'The sign-in response did not match a sign-in started on this device. Please start again.');
  }
  if (!params.code) throw new AppError('auth-cancelled', 'GitHub did not return an authorization code.');
  const tokens = await callBroker(cfg, 'token', { code: params.code, code_verifier: pending.verifier, redirect_uri: cfg.redirectUri });
  const login = await resolveLogin(tokens!.access_token);
  return toSession(tokens!, login, pending.persist);
}

export async function refreshGitHubAppSession(cfg: AppConfig, session: Session): Promise<Session> {
  if (!session.refreshToken) throw new AppError('auth-expired', 'Your session has expired. Please sign in again.');
  const tokens = await callBroker(cfg, 'refresh', { refresh_token: session.refreshToken });
  return toSession(tokens!, session.login, session.persist);
}

export async function revokeGitHubAppSession(cfg: AppConfig, session: Session): Promise<void> {
  try {
    await callBroker(cfg, 'revoke', { access_token: session.accessToken });
  } catch {
    // Logout proceeds locally even if revocation fails; the token still expires within 8 hours.
  }
}
