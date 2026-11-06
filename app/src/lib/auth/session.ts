/**
 * Session persistence.
 *
 * Default: sessionStorage - the credential lives only as long as the tab / app window. On iOS an
 * installed web app loses it when the app is closed from the app switcher, which means signing in
 * again. Users may opt in to "Keep me signed in on this device" (localStorage), which persists the
 * credential until logout or expiry. Either way it is readable by scripts on this origin, which is
 * why the app ships a strict CSP and renders no unsanitised HTML.
 *
 * The service worker never sees or stores credentials.
 */
import type { AuthMethod } from '../bootstrap';

export interface Session {
  method: AuthMethod;
  accessToken: string;
  /** Epoch ms. Undefined for tokens without a known expiry. */
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
  login: string;
  persist: boolean;
  createdAt: number;
}

const KEY = 'it-hub.session.v1';

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function isSession(v: unknown): v is Session {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (s.method === 'fine-grained-token' || s.method === 'github-app') && typeof s.accessToken === 'string' && typeof s.login === 'string';
}

export function loadSession(): Session | null {
  for (const kind of ['session', 'local'] as const) {
    const store = safeStorage(kind);
    const raw = store?.getItem(KEY);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isSession(parsed)) {
        store?.removeItem(KEY);
        continue;
      }
      const refreshUsable = parsed.refreshToken && (!parsed.refreshExpiresAt || parsed.refreshExpiresAt > Date.now());
      if (parsed.expiresAt && parsed.expiresAt < Date.now() && !refreshUsable) {
        store?.removeItem(KEY);
        continue;
      }
      return parsed;
    } catch {
      store?.removeItem(KEY);
    }
  }
  return null;
}

export function saveSession(session: Session): void {
  clearSession();
  const store = safeStorage(session.persist ? 'local' : 'session');
  store?.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  safeStorage('session')?.removeItem(KEY);
  safeStorage('local')?.removeItem(KEY);
}
