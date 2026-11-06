import { Database, ExternalLink, LogOut, MonitorDown, Palette, RefreshCw, ShieldCheck, Stethoscope, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Callout, formatDate, GitHubMark, PageHead, timeAgo } from '../components/ui';
import { usePwa } from '../components/Layout';
import { APP_VERSION, BUILD_TIME, clearAppCaches, isStandalone, type pwaState } from '../lib/pwa';
import { docRoute } from '../lib/search';
import { useHub, useHubData } from '../state';
import { useTheme, type ThemeChoice } from '../theme';

function permissionLabel(p?: { admin?: boolean; maintain?: boolean; push?: boolean; pull?: boolean }): string {
  if (!p) return 'read (verified)';
  if (p.admin) return 'admin';
  if (p.maintain) return 'maintain';
  if (p.push) return 'write';
  if (p.pull) return 'read';
  return 'none';
}

export function Settings() {
  const data = useHubData();
  const { session, refresh, refreshing, logout, bootstrap } = useHub();
  const [theme, setTheme] = useTheme();
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const pwa = JSON.parse(usePwa()) as ReturnType<typeof pwaState>;

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setStorage(e.usage !== undefined ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used by this app` : null))
      .catch(() => setStorage(null));
  }, [cacheMsg]);

  const agent = data.config.agent?.windows;
  const agentRepo = agent ? data.config.repositories[agent.repository]! : undefined;
  const installDoc = agent?.installDoc ? data.docs.find((d) => d.repository === agent.repository && d.path === agent.installDoc) : undefined;
  const tokenSettingsUrl = session?.method === 'github-app' ? 'https://github.com/settings/apps/authorizations' : 'https://github.com/settings/personal-access-tokens';

  return (
    <>
      <PageHead title="Settings" />
      <div className="grid grid-2">
        <section className="card">
          <h2>
            <GitHubMark size={17} /> Account
          </h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <img className="avatar" style={{ width: 44, height: 44 }} src={data.user.avatar_url} alt="" referrerPolicy="no-referrer" />
            <div>
              <strong>{data.user.name ?? data.user.login}</strong>
              <div className="subtle">@{data.user.login}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Sign-in method</dt>
            <dd>{session?.method === 'github-app' ? 'GitHub App (read-only)' : <>Fine-grained token <Badge tone="warn">prototype</Badge></>}</dd>
            <dt>Session</dt>
            <dd>
              {session?.persist ? 'Remembered on this device' : 'Ends when the app is closed'}
              {session?.expiresAt && <div className="subtle">Access expires {timeAgo(session.expiresAt).replace('ago', 'from now')} ({new Date(session.expiresAt).toLocaleTimeString()})</div>}
            </dd>
          </dl>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-danger" type="button" onClick={() => void logout()}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
            <a className="btn" href={tokenSettingsUrl} target="_blank" rel="noopener noreferrer">
              Manage access in GitHub <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
          <p className="subtle" style={{ marginTop: 12, marginBottom: 0 }}>
            Signing out removes the session and all loaded content from this device.{' '}
            {session?.method === 'github-app' ? 'The access token is also revoked at GitHub.' : 'To revoke the token itself, delete it on the GitHub token page.'}
          </p>
        </section>

        <section className="card">
          <h2>
            <ShieldCheck size={17} aria-hidden="true" /> Authorized repositories
          </h2>
          <ul className="list">
            {Object.entries(data.repositories).map(([key, r]) => (
              <li key={key} className="list-item">
                <Database size={16} aria-hidden="true" />
                <div className="grow">
                  <div className="t">{r.full_name}</div>
                  <div className="s">
                    key <span className="mono">{key}</span> · ref <span className="mono">{r.ref.ref}</span> · {r.private ? 'private' : 'public'}
                  </div>
                </div>
                <Badge tone="ok">{permissionLabel(r.permissions)}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>
            <RefreshCw size={17} aria-hidden="true" /> Data & configuration
          </h2>
          <dl className="kv">
            <dt>Configuration</dt>
            <dd className="mono" style={{ fontSize: '0.8rem' }}>
              {data.configPath}
            </dd>
            <dt>Config version</dt>
            <dd>{data.config.application.configVersion ?? <span className="unknown">not set</span>}</dd>
            <dt>Last refresh</dt>
            <dd>
              {new Date(data.loadedAt).toLocaleString()} ({timeAgo(data.loadedAt)})
            </dd>
            <dt>Auto refresh</dt>
            <dd>{data.config.refresh.onFocus ? `When the app is reopened (at most every ${data.config.refresh.minIntervalSeconds}s)` : 'Manual only'}</dd>
          </dl>
          <button className="btn" type="button" style={{ marginTop: 14 }} onClick={() => void refresh(true)} disabled={refreshing}>
            <RefreshCw size={16} aria-hidden="true" /> {refreshing ? 'Refreshing...' : 'Refresh now'}
          </button>
        </section>

        <section className="card">
          <h2>
            <Palette size={17} aria-hidden="true" /> Appearance & app
          </h2>
          <div className="segmented" role="group" aria-label="Theme" style={{ marginBottom: 14 }}>
            {(['system', 'light', 'dark'] as ThemeChoice[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <dl className="kv">
            <dt>App version</dt>
            <dd>
              {APP_VERSION} <span className="subtle">· built {formatDate(BUILD_TIME)}</span>
            </dd>
            <dt>Installed</dt>
            <dd>{isStandalone() || pwa.installed ? 'Yes (running as app)' : 'No (browser tab)'}</dd>
            <dt>Offline storage</dt>
            <dd>
              Application shell only. Private content is never stored offline.
              {storage && <div className="subtle">{storage}</div>}
            </dd>
          </dl>
          <button
            className="btn"
            type="button"
            style={{ marginTop: 14 }}
            onClick={() =>
              void clearAppCaches().then((n) => setCacheMsg(n ? `Removed ${n} cache${n > 1 ? 's' : ''}. The app shell will be downloaded again.` : 'No caches to remove.'))
            }
          >
            <Trash2 size={16} aria-hidden="true" /> Clear app cache
          </button>
          {cacheMsg && (
            <p className="subtle" role="status" style={{ marginTop: 8 }}>
              {cacheMsg}
            </p>
          )}
        </section>

        <section className="card" id="agent">
          <h2>
            <MonitorDown size={17} aria-hidden="true" /> Windows agent
          </h2>
          {!agent || !agentRepo ? (
            <p className="subtle">The Windows agent is not configured.</p>
          ) : (
            <>
              <p className="muted">
                The inventory agent is a separate Windows tool. It reads hardware and installed software and proposes inventory updates as pull requests. It is not part of
                this app and is not installed by installing the IT Hub.
              </p>
              <dl className="kv">
                <dt>Latest approved release</dt>
                <dd>
                  {data.agentRelease ? (
                    <a href={data.agentRelease.url} target="_blank" rel="noopener noreferrer">
                      v{data.agentRelease.version}
                    </a>
                  ) : (
                    <span className="unknown">none published yet</span>
                  )}
                </dd>
              </dl>
              <p style={{ marginTop: 12, marginBottom: 6, fontWeight: 600 }}>Install (Windows PowerShell, signed in with GitHub CLI):</p>
              <pre className="prose" style={{ margin: 0 }}>
                <code>
                  {`gh auth status
gh release download ${data.agentRelease?.tag ?? `${agent.releaseTagPrefix}<version>`} -R ${agentRepo.owner}/${agentRepo.name} -p "*.zip" -p "*.sha256" -D $env:TEMP\\it-hub-agent
# then follow the install guide to verify the checksum and install`}
                </code>
              </pre>
              {installDoc && (
                <a className="btn btn-sm" style={{ marginTop: 12 }} href={docRoute(installDoc)}>
                  Open the agent install guide
                </a>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2>
            <Stethoscope size={17} aria-hidden="true" /> Diagnostics
          </h2>
          <dl className="kv">
            <dt>Public bootstrap</dt>
            <dd className="mono" style={{ fontSize: '0.8rem' }}>
              config/bootstrap.json → {bootstrap?.bootstrap.owner}/{bootstrap?.bootstrap.repository}
            </dd>
            <dt>Sign-in methods</dt>
            <dd>{bootstrap?.auth.methods.join(', ')}</dd>
            <dt>Devices / documents</dt>
            <dd>
              {data.devices.length} / {data.docs.length}
            </dd>
            <dt>API requests (last load)</dt>
            <dd>{data.requestCount}</dd>
            <dt>GitHub rate limit</dt>
            <dd>
              {data.rateLimit.remaining ?? '?'} of {data.rateLimit.limit ?? '?'} remaining
              {data.rateLimit.resetAt && <div className="subtle">resets {new Date(data.rateLimit.resetAt).toLocaleTimeString()}</div>}
            </dd>
            <dt>Content problems</dt>
            <dd>{data.problems.length === 0 ? 'None' : data.problems.length}</dd>
          </dl>
          {data.problems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Callout tone="warn">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.problems.map((p) => (
                    <li key={p.path + p.message}>
                      <span className="mono">{p.path}</span>: {p.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
