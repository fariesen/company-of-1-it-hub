import { ArrowLeft, BookOpen, Boxes, Cpu, ExternalLink, FileText, HardDrive, Info, Network, Search as SearchIcon, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge, Callout, Empty, formatDate, LifecycleBadge, PageHead, timeAgo, Value } from '../components/ui';
import { categoryLabels, displayHardware, snapshotAgeDays, UNKNOWN } from '../lib/inventory';
import { docRoute, normalise } from '../lib/search';
import { useHubData } from '../state';

function HardwareRow({ label, v }: { label: string; v: { declared: string; observed?: string } }) {
  const differs = v.observed && v.observed !== UNKNOWN && v.declared !== UNKNOWN && normalise(v.observed) !== normalise(v.declared);
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {v.observed && v.observed !== UNKNOWN ? (
          <>
            {v.observed}
            <span className="observed">
              Declared: <Value v={v.declared} />
              {differs && (
                <>
                  {' '}
                  <Badge tone="warn" plain>
                    differs
                  </Badge>
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <Value v={v.declared} />
            <span className="observed">Not yet captured by the agent</span>
          </>
        )}
      </dd>
    </>
  );
}

export function DeviceDetail() {
  const { id = '' } = useParams();
  const data = useHubData();
  const [swQuery, setSwQuery] = useState('');
  const key = id.toLowerCase();
  const device = data.devices.find((d) => d.id.toLowerCase() === key);
  const byAlias = device ? undefined : data.devices.find((d) => d.aliases.some((a) => a.toLowerCase() === key));

  const software = useMemo(() => {
    const list = device?.snapshot?.software ?? [];
    const q = normalise(swQuery);
    return q ? list.filter((s) => normalise(`${s.name} ${s.publisher ?? ''}`).includes(q)) : list;
  }, [device, swQuery]);

  if (byAlias) return <Navigate to={`/hub/devices/${encodeURIComponent(byAlias.id)}`} replace />;
  if (!device) {
    return (
      <div className="card">
        <Empty icon={Cpu} title={`Device ${id} not found`}>
          <p>No device with this ID or alias is registered.</p>
          <Link className="btn" to="/hub/devices">
            All devices
          </Link>
        </Empty>
      </div>
    );
  }

  const hw = displayHardware(device);
  const s = device.snapshot;
  const age = snapshotAgeDays(device);
  const repo = data.repositories[device.repository]!;
  const githubUrl = `https://github.com/${repo.ref.owner}/${repo.ref.name}/tree/${encodeURIComponent(repo.ref.ref)}/${device.folder.split('/').map(encodeURIComponent).join('/')}`;
  const related = data.docs.filter((d) => d.repository === device.repository && (device.docs.includes(d.path) || d.path.startsWith(device.folder + '/')));

  return (
    <>
      <Link to="/hub/devices" className="subtle row" style={{ gap: 4, marginBottom: 12 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Devices
      </Link>
      <PageHead
        title={`${device.id} · ${device.name}`}
        description={
          <span className="row" style={{ gap: 8 }}>
            <LifecycleBadge lifecycle={device.lifecycle} />
            <Badge plain>{categoryLabels[device.category]}</Badge>
            {device.aliases.map((a) => (
              <span className="chip" key={a} title="Legacy alias">
                {a}
              </span>
            ))}
          </span>
        }
        actions={
          <a className="btn btn-sm" href={githubUrl} target="_blank" rel="noopener noreferrer">
            View in GitHub <ExternalLink size={14} aria-hidden="true" />
          </a>
        }
      />

      {!s && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="info">
            <strong>Not captured yet.</strong> Values below are declared by hand; anything not verified is shown as unknown. Run the Windows inventory agent on this device to capture
            hardware and software automatically.
          </Callout>
        </div>
      )}
      {s && age !== undefined && age > 30 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warn">The latest snapshot is {age} days old. Run the agent again to refresh it.</Callout>
        </div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>
            <Info size={17} aria-hidden="true" /> Overview
          </h2>
          <dl className="kv">
            <dt>Device ID</dt>
            <dd className="mono">{device.id}</dd>
            <dt>Hostname</dt>
            <dd>
              <Value v={s && s.hostname !== UNKNOWN ? s.hostname : device.hostname} />
            </dd>
            <dt>Role</dt>
            <dd>
              <Value v={device.role} />
            </dd>
            <dt>Assigned to</dt>
            <dd>{device.assignedTo ? <Value v={device.assignedTo} /> : <span className="subtle">Unassigned</span>}</dd>
            {device.location && (
              <>
                <dt>Location</dt>
                <dd>{device.location}</dd>
              </>
            )}
            <dt>Labels</dt>
            <dd>
              {device.friendlyName || device.displayLabel ? [device.friendlyName, device.displayLabel].filter(Boolean).join(' · ') : <span className="unknown">none</span>}
            </dd>
            <dt>Tags</dt>
            <dd>
              {device.tags.length ? (
                <span className="row" style={{ gap: 4 }}>
                  {device.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="unknown">none (suggestions use the baseline only)</span>
              )}
            </dd>
            <dt>Setup profile</dt>
            <dd>
              <Value v={device.setupProfile} />
            </dd>
            <dt>Record updated</dt>
            <dd>{formatDate(device.updated)}</dd>
            <dt>Last capture</dt>
            <dd>{s ? `${formatDate(s.collectedAt)} (${timeAgo(s.collectedAt)}) · agent v${s.agentVersion}` : <span className="unknown">never</span>}</dd>
          </dl>
          {device.notes && <p style={{ marginTop: 12 }}>{device.notes}</p>}
        </section>

        <section className="card">
          <h2>
            <Cpu size={17} aria-hidden="true" /> Hardware
          </h2>
          <dl className="kv">
            <HardwareRow label="Manufacturer" v={hw.manufacturer} />
            <HardwareRow label="Model" v={hw.model} />
            <HardwareRow label="Operating system" v={hw.os} />
            <HardwareRow label="CPU" v={hw.cpu} />
            <HardwareRow label="RAM" v={hw.ram} />
            <HardwareRow label="Storage" v={hw.storage} />
            <HardwareRow label="GPU" v={hw.gpu} />
          </dl>
        </section>

        {s && (
          <section className="card">
            <h2>
              <HardDrive size={17} aria-hidden="true" /> Storage & network
            </h2>
            <ul className="list">
              {s.storage.map((d, i) => (
                <li key={`s${i}`} className="list-item">
                  <HardDrive size={16} aria-hidden="true" />
                  <div className="grow">
                    <div className="t">{d.model}</div>
                    <div className="s">{[typeof d.sizeGB === 'number' ? `${d.sizeGB} GB` : undefined, d.mediaType, d.busType].filter(Boolean).join(' · ')}</div>
                  </div>
                </li>
              ))}
              {s.network.map((n, i) => (
                <li key={`n${i}`} className="list-item">
                  <Network size={16} aria-hidden="true" />
                  <div className="grow">
                    <div className="t">{n.description ?? n.name}</div>
                    <div className="s">{[n.name !== n.description ? n.name : undefined, n.mediaType, n.linkSpeed, n.status].filter(Boolean).join(' · ')}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="subtle" style={{ marginTop: 10, marginBottom: 0 }}>
              MAC and IP addresses are intentionally not collected.
            </p>
          </section>
        )}

        <section className="card">
          <h2>
            <BookOpen size={17} aria-hidden="true" /> Related documentation
          </h2>
          {related.length === 0 ? (
            <p className="subtle">No related documents.</p>
          ) : (
            <ul className="list">
              {related.map((d) => (
                <li key={d.key}>
                  <a className="list-item" href={docRoute(d)}>
                    <FileText size={16} aria-hidden="true" />
                    <div className="grow">
                      <div className="t">{d.title}</div>
                      <div className="s">{d.path}</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {device.sources.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Sources</h3>
              <ul className="list">
                {device.sources.map((src, i) => (
                  <li key={i} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div>{src.statement}</div>
                      <div className="s">
                        {src.source} · {formatDate(src.date)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {s && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-head">
              <h2>
                <Boxes size={17} aria-hidden="true" /> Installed software ({s.software.length})
              </h2>
            </div>
            <div className="search-wrap" style={{ marginBottom: 12 }}>
              <SearchIcon size={17} aria-hidden="true" />
              <input className="input input-search" type="search" placeholder="Filter software" value={swQuery} onChange={(e) => setSwQuery(e.target.value)} aria-label="Filter software" />
            </div>
            {software.length === 0 ? (
              <p className="subtle">No matching software.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Version</th>
                      <th>Publisher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {software.map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td>{p.name}</td>
                        <td className="mono">
                          <Value v={p.version} />
                        </td>
                        <td>
                          <Value v={p.publisher} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="subtle" style={{ marginTop: 10, marginBottom: 0 }}>
              Machine-wide programs only (per-user and Store apps are not collected).
            </p>
          </section>
        )}

        {s && s.diagnostics.some((d) => d.status !== 'ok') && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>
              <Stethoscope size={17} aria-hidden="true" /> Capture diagnostics
            </h2>
            <ul className="list">
              {s.diagnostics
                .filter((d) => d.status !== 'ok')
                .map((d, i) => (
                  <li key={i} className="list-item">
                    <Badge tone={d.status === 'failed' ? 'bad' : 'warn'}>{d.status}</Badge>
                    <div className="grow">
                      <div className="t">{d.section}</div>
                      {d.message && <div className="s">{d.message}</div>}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
