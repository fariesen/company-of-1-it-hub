import { Cpu, Search as SearchIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, LifecycleBadge, PageHead, timeAgo, Value } from '../components/ui';
import { best, categoryLabels, CATEGORIES, displayHardware, lastInventoryUpdate, LIFECYCLES } from '../lib/inventory';
import { filterDevices } from '../lib/search';
import { useHubData } from '../state';

export function Devices() {
  const { devices, config } = useHubData();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const lifecycle = params.get('lifecycle') ?? '';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const shown = useMemo(
    () => filterDevices(devices, q).filter((d) => (!category || d.category === category) && (!lifecycle || d.lifecycle === lifecycle)),
    [devices, q, category, lifecycle]
  );

  return (
    <>
      <PageHead title="Devices" description={`${devices.length} registered device${devices.length === 1 ? '' : 's'}. Declared values come from device.json; captured values from the latest agent snapshot.`} />
      <div className="toolbar">
        <div className="search-wrap">
          <SearchIcon size={17} aria-hidden="true" />
          <input className="input input-search" type="search" placeholder="Search ID, name, alias, model, CPU, GPU..." value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search devices" />
        </div>
        <select className="input" value={category} onChange={(e) => set('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
        <select className="input" value={lifecycle} onChange={(e) => set('lifecycle', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {LIFECYCLES.map((l) => (
            <option key={l} value={l}>
              {l[0]!.toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {devices.length === 0 ? (
        <div className="card">
          <Empty icon={Cpu} title="No devices registered yet">
            Devices appear here once a <span className="mono">device.json</span> exists under <span className="mono">{config.sources.inventory.path}/</span>.
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon={SearchIcon} title="No matching devices">
            Try a different search or clear the filters.
          </Empty>
        </div>
      ) : (
        <>
          <div className="table-wrap only-desktop">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Manufacturer / model</th>
                  <th>OS</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>GPU</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const hw = displayHardware(d);
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/hub/devices/${encodeURIComponent(d.id)}`}>{d.id}</Link>
                        {d.aliases.length > 0 && <div className="subtle">aka {d.aliases.join(', ')}</div>}
                      </td>
                      <td>{d.name}</td>
                      <td>{categoryLabels[d.category]}</td>
                      <td>
                        <Value v={best(hw.manufacturer)} /> <span className="subtle">·</span> <Value v={best(hw.model)} />
                      </td>
                      <td>
                        <Value v={best(hw.os)} />
                      </td>
                      <td>
                        <Value v={best(hw.cpu)} />
                      </td>
                      <td>
                        <Value v={best(hw.ram)} />
                      </td>
                      <td>
                        <Value v={best(hw.gpu)} />
                      </td>
                      <td>
                        <LifecycleBadge lifecycle={d.lifecycle} />
                      </td>
                      <td className="subtle">{timeAgo(lastInventoryUpdate(d))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="device-cards only-mobile">
            {shown.map((d) => {
              const hw = displayHardware(d);
              return (
                <Link key={d.id} to={`/hub/devices/${encodeURIComponent(d.id)}`} className="card device-card">
                  <div className="row">
                    <div className="icon-tile">
                      <Cpu size={18} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{d.id}</strong>
                      <div className="subtle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </div>
                    </div>
                    <LifecycleBadge lifecycle={d.lifecycle} />
                  </div>
                  <div className="meta">
                    <span>
                      Model: <Value v={best(hw.model)} />
                    </span>
                    <span>
                      RAM: <Value v={best(hw.ram)} />
                    </span>
                    <span>
                      GPU: <Value v={best(hw.gpu)} />
                    </span>
                    <span>Updated {timeAgo(lastInventoryUpdate(d))}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
