import { BookOpen, Boxes, Cpu, Ellipsis, LayoutDashboard, LogOut, MonitorDown, Network, RefreshCw, Search as SearchIcon, Settings as SettingsIcon, Wrench } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { applyUpdate, pwaState, subscribePwa } from '../lib/pwa';
import { useHub } from '../state';
import { SignIn } from '../pages/SignIn';
import { ErrorPanel, Loading, Logo } from './ui';

const NAV = [
  { to: '/hub', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/hub/devices', label: 'Devices', icon: Cpu },
  { to: '/hub/software', label: 'Software', icon: Boxes },
  { to: '/hub/infrastructure', label: 'Infrastructure', icon: Network },
  { to: '/hub/docs', label: 'Documentation', icon: BookOpen },
  { to: '/hub/setup', label: 'Setup', icon: Wrench },
  { to: '/hub/setup-pc', label: 'Set up a PC', icon: MonitorDown }
];

const TABS = [
  { to: '/hub', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/hub/devices', label: 'Devices', icon: Cpu },
  { to: '/hub/docs', label: 'Docs', icon: BookOpen },
  { to: '/hub/search', label: 'Search', icon: SearchIcon },
  { to: '/hub/more', label: 'More', icon: Ellipsis }
];

const TITLES: [RegExp, string][] = [
  [/^\/hub\/?$/, 'Dashboard'],
  [/^\/hub\/devices\/.+/, 'Device'],
  [/^\/hub\/devices/, 'Devices'],
  [/^\/hub\/software/, 'Software'],
  [/^\/hub\/infrastructure/, 'Infrastructure'],
  [/^\/hub\/docs/, 'Documentation'],
  [/^\/hub\/setup/, 'Setup'],
  [/^\/hub\/search/, 'Search'],
  [/^\/hub\/settings/, 'Settings'],
  [/^\/hub\/more/, 'More']
];

export function usePwa() {
  return useSyncExternalStore(subscribePwa, () => JSON.stringify(pwaState()), () => '{}');
}

function UpdateToast() {
  const state = JSON.parse(usePwa()) as ReturnType<typeof pwaState>;
  if (!state.updateReady) return null;
  return (
    <div className="toast" role="status">
      A new version of the IT Hub is available.
      <button className="btn btn-primary btn-sm" type="button" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  );
}

export function HubLayout() {
  const { session, status, data, error, refresh, refreshing, logout, bootstrapError } = useHub();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const title = TITLES.find(([re]) => re.test(location.pathname))?.[1];
    document.title = title ? `${title} - IT Hub` : 'IT Hub';
  }, [location.pathname]);

  if (bootstrapError) {
    return (
      <div className="signin">
        <div className="card signin-card">
          <ErrorPanel error={bootstrapError} onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }
  if (!session) return <SignIn />;
  if (!data) {
    if (status === 'error' && error) {
      return (
        <div className="signin">
          <div className="card signin-card stack">
            <Logo />
            <ErrorPanel error={error} onRetry={() => void refresh(true)}>
              {error.kind === 'no-access' && (
                <p className="subtle">
                  Signed in as <strong>{session.login}</strong>. Being signed in to GitHub is not enough: the repository owner must grant your account read access.
                </p>
              )}
            </ErrorPanel>
            <button className="btn" type="button" onClick={() => void logout()}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      );
    }
    return <Loading label="Loading IT inventory from GitHub..." />;
  }

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'IT Hub';
  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link className="brand" to="/hub">
          <Logo />
          <span>
            IT Hub
            <small>The Company of 1</small>
          </span>
        </Link>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={18} aria-hidden="true" /> {n.label}
            </NavLink>
          ))}
          <div className="nav-label">Account</div>
          <NavLink to="/hub/settings">
            <SettingsIcon size={18} aria-hidden="true" /> Settings
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <img className="avatar" src={data.user.avatar_url} alt="" referrerPolicy="no-referrer" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.user.login}</span>
          <button className="btn btn-ghost btn-icon" type="button" onClick={() => void logout()} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Link to="/hub" className="brand-mobile" aria-label="IT Hub home">
            <Logo className="logo" />
          </Link>
          <div className="title">{title}</div>
          <button className="btn btn-ghost btn-icon" type="button" aria-label="Search" title="Search" onClick={() => navigate('/hub/search')}>
            <SearchIcon size={18} />
          </button>
          <button className="btn btn-ghost btn-icon" type="button" aria-label="Refresh from GitHub" title="Refresh from GitHub" onClick={() => void refresh(true)} disabled={refreshing}>
            <RefreshCw size={18} className={refreshing ? 'spin' : undefined} style={refreshing ? { animation: 'spin 0.9s linear infinite' } : undefined} />
          </button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {error && (
            <div style={{ marginBottom: 16 }}>
              <ErrorPanel error={error} onRetry={() => void refresh(true)}>
                <p className="subtle">Showing the content loaded {new Date(data.loadedAt).toLocaleTimeString()}.</p>
              </ErrorPanel>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <nav className="tabbar" aria-label="Main navigation">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <t.icon size={21} aria-hidden="true" />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <UpdateToast />
    </div>
  );
}
