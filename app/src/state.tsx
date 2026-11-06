/**
 * Application state: public bootstrap, session lifecycle and data loading.
 *
 * A new GitHubClient (with empty in-memory caches) is created for every session, so content loaded
 * for one account can never be shown to another. Private data is kept in memory only.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadPublicBootstrap, type PublicBootstrap } from './lib/bootstrap';
import { loadHub, type HubData } from './lib/content';
import { AppError, toAppError } from './lib/errors';
import { GitHubClient } from './lib/github';
import { clearSession, loadSession, saveSession, type Session } from './lib/auth/session';
import { validateTokenFormat } from './lib/auth/token';
import { completeGitHubAppLogin, refreshGitHubAppSession, revokeGitHubAppSession, startGitHubAppLogin, takeCallbackParams } from './lib/auth/githubApp';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface HubState {
  bootstrap: PublicBootstrap | null;
  bootstrapError: AppError | null;
  session: Session | null;
  status: LoadStatus;
  data: HubData | null;
  error: AppError | null;
  refreshing: boolean;
  signInError: AppError | null;
  signInWithToken: (token: string, persist: boolean) => Promise<void>;
  signInWithGitHubApp: (persist: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
}

const HubContext = createContext<HubState | null>(null);

export function useHub(): HubState {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside HubProvider');
  return ctx;
}

/** Use inside routes that are only rendered once data is ready. */
export function useHubData(): HubData {
  const { data } = useHub();
  if (!data) throw new Error('Hub data is not loaded');
  return data;
}

function makeClient(sessionRef: { current: Session | null }, bootstrap: PublicBootstrap | null, onSession: (s: Session) => void): GitHubClient {
  return new GitHubClient(async () => {
    const s = sessionRef.current;
    if (!s) throw new AppError('auth-required', 'Please sign in.');
    // Refresh GitHub App tokens shortly before they expire (only possible if the user chose to stay signed in).
    if (s.method === 'github-app' && s.expiresAt && s.expiresAt - Date.now() < 5 * 60_000) {
      const cfg = bootstrap?.auth.githubApp;
      if (!cfg || !s.refreshToken) throw new AppError('auth-expired', 'Your session has expired. Please sign in again.');
      const next = await refreshGitHubAppSession(cfg, s);
      onSession(next);
      return next.accessToken;
    }
    return s.accessToken;
  });
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<PublicBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<AppError | null>(null);
  const [session, setSessionState] = useState<Session | null>(() => loadSession());
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [data, setData] = useState<HubData | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [signInError, setSignInError] = useState<AppError | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sessionRef = useRef<Session | null>(session);
  const clientRef = useRef<GitHubClient | null>(null);
  const dataRef = useRef<HubData | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const setSession = useCallback((s: Session | null) => {
    sessionRef.current = s;
    if (s) saveSession(s);
    else clearSession();
    setSessionState(s);
  }, []);

  const dropPrivateState = useCallback(() => {
    clientRef.current?.clear();
    clientRef.current = null;
    dataRef.current = null;
    setData(null);
    setStatus('idle');
    setError(null);
  }, []);

  // Stage 1: public bootstrap; also completes a GitHub App redirect if one is pending.
  useEffect(() => {
    let cancelled = false;
    const callback = takeCallbackParams();
    loadPublicBootstrap()
      .then(async (b) => {
        if (cancelled) return;
        setBootstrap(b);
        if (callback) {
          const cfg = b.auth.githubApp;
          if (!cfg) {
            setSignInError(new AppError('auth-cancelled', 'GitHub sign-in is not enabled for this IT Hub.'));
            return;
          }
          try {
            const s = await completeGitHubAppLogin(cfg, callback, async (token) => (await new GitHubClient(async () => token).getUser()).login);
            if (!cancelled) setSession(s);
          } catch (e) {
            if (!cancelled) setSignInError(toAppError(e));
          }
        }
      })
      .catch((e: unknown) => !cancelled && setBootstrapError(toAppError(e)));
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  const client = useCallback(() => {
    if (!clientRef.current) clientRef.current = makeClient(sessionRef, bootstrap, setSession);
    return clientRef.current;
  }, [bootstrap, setSession]);

  const handleFailure = useCallback(
    (e: unknown) => {
      const err = toAppError(e);
      if (err.kind === 'auth-expired' || err.kind === 'auth-required') {
        // Expired or revoked credentials: end the session and wipe private data.
        setSession(null);
        dropPrivateState();
        setSignInError(err);
        return;
      }
      if (err.kind === 'no-access') {
        // Authenticated but not authorised (for example collaborator access was removed).
        dropPrivateState();
      }
      setError(err);
      setStatus(dataRef.current ? 'ready' : 'error');
    },
    [dropPrivateState, setSession]
  );

  const load = useCallback(
    async (background: boolean) => {
      if (!bootstrap || !sessionRef.current) return;
      if (inflight.current) return inflight.current;
      const run = (async () => {
        if (background) setRefreshing(true);
        else setStatus('loading');
        try {
          const next = await loadHub(client(), bootstrap, dataRef.current?.recentChanges);
          if (sessionRef.current && next.user.login.toLowerCase() !== sessionRef.current.login.toLowerCase()) {
            throw new AppError('auth-expired', 'The signed-in GitHub account changed. Please sign in again.');
          }
          dataRef.current = next;
          setData(next);
          setError(null);
          setStatus('ready');
        } catch (e) {
          handleFailure(e);
        } finally {
          setRefreshing(false);
          inflight.current = null;
        }
      })();
      inflight.current = run;
      return run;
    },
    [bootstrap, client, handleFailure]
  );

  useEffect(() => {
    if (bootstrap && session && status === 'idle') void load(false);
  }, [bootstrap, session, status, load]);

  const refresh = useCallback(
    async (force = false) => {
      const d = dataRef.current;
      const min = (d?.config.refresh.minIntervalSeconds ?? 60) * 1000;
      if (!force && d && Date.now() - d.loadedAt < min) return;
      await load(Boolean(d));
    },
    [load]
  );

  // Pick up repository changes when the app comes back to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && dataRef.current?.config.refresh.onFocus) void refresh(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const signInWithToken = useCallback(
    async (raw: string, persist: boolean) => {
      setSignInError(null);
      try {
        const token = validateTokenFormat(raw);
        const probe = new GitHubClient(async () => token);
        const user = await probe.getUser();
        dropPrivateState();
        setSession({ method: 'fine-grained-token', accessToken: token, login: user.login, persist, createdAt: Date.now() });
      } catch (e) {
        const err = toAppError(e);
        setSignInError(err.kind === 'auth-expired' ? new AppError('auth-required', 'GitHub did not accept this token. Check that it is correct and not expired.') : err);
      }
    },
    [dropPrivateState, setSession]
  );

  const signInWithGitHubApp = useCallback(
    async (persist: boolean) => {
      setSignInError(null);
      const cfg = bootstrap?.auth.githubApp;
      if (!cfg) {
        setSignInError(new AppError('auth-required', 'GitHub sign-in is not configured for this IT Hub.'));
        return;
      }
      await startGitHubAppLogin(cfg, persist);
    },
    [bootstrap]
  );

  const logout = useCallback(async () => {
    const s = sessionRef.current;
    if (s?.method === 'github-app' && bootstrap?.auth.githubApp) await revokeGitHubAppSession(bootstrap.auth.githubApp, s);
    setSession(null);
    dropPrivateState();
    setSignInError(null);
    try {
      localStorage.removeItem('it-hub.pending-login.v1');
    } catch {
      /* storage unavailable */
    }
  }, [bootstrap, dropPrivateState, setSession]);

  const value = useMemo<HubState>(
    () => ({ bootstrap, bootstrapError, session, status, data, error, refreshing, signInError, signInWithToken, signInWithGitHubApp, logout, refresh }),
    [bootstrap, bootstrapError, session, status, data, error, refreshing, signInError, signInWithToken, signInWithGitHubApp, logout, refresh]
  );
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}
