import { Activity, AlertTriangle, BookOpen, Boxes, ChevronRight, Cpu, GitCommit, MonitorDown, Network, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Callout, Empty, LifecycleBadge, PageHead, timeAgo } from '../components/ui';
import { categoryLabels, CATEGORIES, LIFECYCLES, snapshotAgeDays, type Lifecycle } from '../lib/inventory';
import { docRoute } from '../lib/search';
import { useHubData } from '../state';

export function Dashboard() {
  const data = useHubData();
  const { devices, docs, software, recentChanges, problems, config } = data;

  const byLifecycle = LIFECYCLES.map((l) => [l, devices.filter((d) => d.lifecycle === l).length] as [Lifecycle, number]).filter(([, n]) => n > 0);
  const captured = devices.filter((d) => d.snapshot);
  const stale = captured.filter((d) => (snapshotAgeDays(d) ?? 0) > 30);
  const agentDevices = devices.filter((d) => d.agentEnabled);
  const infraDocs = config.sources.infrastructure ? docs.filter((d) => d.path.startsWith(config.sources.infrastructure!.path + '/') || d.path === config.sources.infrastructure!.path) : [];
  const shortcuts = docs.filter((d) => /(^|\/)README\.md$/i.test(d.path)).slice(0, 8);

  return (
    <>
      <PageHead title={`Hello, ${data.user.name?.split(' ')[0] ?? data.user.login}`} description={`${config.application.name} - updated ${timeAgo(data.loadedAt)}`} />

      {problems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warn" icon={AlertTriangle}>
            <strong>{problems.length} content problem{problems.length > 1 ? 's' : ''} in the repository</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {problems.slice(0, 5).map((p) => (
                <li key={p.path + p.message}>
                  <span className="mono">{p.path}</span>: {p.message}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Link to="/hub/devices" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="label">
            <Cpu size={15} aria-hidden="true" /> Devices
          </span>
          <span className="value">{devices.length}</span>
          <span className="hint">{CATEGORIES.map((c) => { const n = devices.filter((d) => d.category === c).length; return `${n} ${categoryLabels[c].replace('computer', n === 1 ? 'computer' : 'computers')}`; }).join(' · ')}</span>
        </Link>
        <div className="card stat">
          <span className="label">
            <Activity size={15} aria-hidden="true" /> Captured by agent
          </span>
          <span className="value">
            {captured.length}
            <span className="subtle" style={{ fontSize: '1rem', fontWeight: 500 }}>
              {' '}
              / {devices.length}
            </span>
          </span>
          <span className="hint">{stale.length ? `${stale.length} older than 30 days` : captured.length ? 'All snapshots current' : 'No snapshots yet'}</span>
        </div>
        <Link to="/hub/software" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="label">
            <Boxes size={15} aria-hidden="true" /> Software
          </span>
          <span className="value">{software.length}</span>
          <span className="hint">{software.length ? 'Distinct programs' : 'From agent snapshots'}</span>
        </Link>
        <Link to="/hub/docs" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="label">
            <BookOpen size={15} aria-hidden="true" /> Documents
          </span>
          <span className="value">{docs.length}</span>
          <span className="hint">{config.sources.documentation.length} sections</span>
        </Link>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h2>
              <Cpu size={17} aria-hidden="true" /> Devices
            </h2>
            <Link to="/hub/devices" className="subtle">
              All devices
            </Link>
          </div>
          {devices.length === 0 ? (
            <Empty icon={Cpu} title="No devices registered">
              Add a <span className="mono">device.json</span> under <span className="mono">{config.sources.inventory.path}/</span> to register a device.
            </Empty>
          ) : (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                {byLifecycle.map(([l, n]) => (
                  <span key={l} className="row" style={{ gap: 6 }}>
                    <LifecycleBadge lifecycle={l} /> <strong>{n}</strong>
                  </span>
                ))}
              </div>
              <ul className="list">
                {devices.slice(0, 6).map((d) => (
                  <li key={d.id}>
                    <Link className="list-item" to={`/hub/devices/${encodeURIComponent(d.id)}`}>
                      <div className="icon-tile">
                        <Cpu size={18} aria-hidden="true" />
                      </div>
                      <div className="grow">
                        <div className="t">
                          {d.id} · {d.name}
                        </div>
                        <div className="s">
                          {categoryLabels[d.category]} · {d.snapshot ? `captured ${timeAgo(d.snapshot.collectedAt)}` : 'not captured yet'}
                        </div>
                      </div>
                      <LifecycleBadge lifecycle={d.lifecycle} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <GitCommit size={17} aria-hidden="true" /> Recent inventory changes
            </h2>
          </div>
          {recentChanges.length === 0 ? (
            <Empty icon={GitCommit} title="No recent changes" />
          ) : (
            <ul className="list">
              {recentChanges.slice(0, 6).map((c) => (
                <li key={c.sha}>
                  <a className="list-item" href={c.html_url} target="_blank" rel="noopener noreferrer">
                    <span className="chip">{c.sha.slice(0, 7)}</span>
                    <div className="grow">
                      <div className="t">{c.commit.message.split('\n')[0]}</div>
                      <div className="s">
                        {c.commit.author?.name ?? 'unknown'} · {timeAgo(c.commit.author?.date)}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <MonitorDown size={17} aria-hidden="true" /> Windows agent
            </h2>
            <Link to="/hub/setup-pc" className="subtle">
              Set up a PC
            </Link>
          </div>
          <dl className="kv">
            <dt>Latest approved release</dt>
            <dd>{data.agentRelease ? <Badge tone="ok">v{data.agentRelease.version}</Badge> : <span className="unknown">{data.agentApproval?.manifest === 'found' ? 'none approved yet' : data.agentApproval?.manifest === 'invalid' ? 'approved-release list is invalid' : 'no approved-release list'}</span>}</dd>
            <dt>Devices with agent</dt>
            <dd>
              {agentDevices.length} of {devices.length}
            </dd>
            <dt>Last capture</dt>
            <dd>{captured.length ? timeAgo(captured.map((d) => d.snapshot!.collectedAt).sort().at(-1)) : <span className="unknown">never</span>}</dd>
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>
              <Network size={17} aria-hidden="true" /> Infrastructure
            </h2>
            <Link to="/hub/infrastructure" className="subtle">
              Open
            </Link>
          </div>
          {infraDocs.length === 0 ? (
            <Empty icon={Network} title="No infrastructure documents yet" />
          ) : (
            <ul className="list">
              {infraDocs.slice(0, 5).map((d) => (
                <li key={d.key}>
                  <a className="list-item" href={docRoute(d)}>
                    <Network size={16} aria-hidden="true" />
                    <span className="grow t">{d.title}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head">
            <h2>
              <BookOpen size={17} aria-hidden="true" /> Documentation shortcuts
            </h2>
            <Link to="/hub/setup" className="subtle row" style={{ gap: 4 }}>
              <Wrench size={14} aria-hidden="true" /> Setup guides
            </Link>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {shortcuts.map((d) => (
              <a key={d.key} href={docRoute(d)} className="list-item" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <BookOpen size={16} aria-hidden="true" />
                <div className="grow">
                  <div className="t">{d.title}</div>
                  <div className="s">{d.path}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
