import { Boxes, Search as SearchIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Empty, PageHead, Value } from '../components/ui';
import { filterSoftware } from '../lib/search';
import { docRoute } from '../lib/search';
import { useHubData } from '../state';

export function Software() {
  const { software, devices, docs, config } = useHubData();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const view = params.get('view') ?? 'all';
  const shown = useMemo(() => filterSoftware(software, q).filter((s) => view === 'all' || (view === 'standard' ? s.standard : !s.standard)), [software, q, view]);
  const captured = devices.filter((d) => d.snapshot).length;
  const swDocs = config.sources.software ? docs.filter((d) => d.path.startsWith(config.sources.software!.path + '/')) : [];
  const hasCatalog = software.some((s) => s.standard);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title="Software" description={`Installed software from ${captured} captured device${captured === 1 ? '' : 's'}${hasCatalog ? ', matched against the standard catalog' : ''}.`} />
      {swDocs.length > 0 && (
        <div className="row" style={{ marginBottom: 14 }}>
          {swDocs.map((d) => (
            <a key={d.key} className="btn btn-sm" href={docRoute(d)}>
              {d.title}
            </a>
          ))}
        </div>
      )}
      <div className="toolbar">
        <div className="search-wrap">
          <SearchIcon size={17} aria-hidden="true" />
          <input className="input input-search" type="search" placeholder="Search software, publisher, version or device" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search software" />
        </div>
        {hasCatalog && (
          <div className="segmented" role="group" aria-label="Filter">
            {[
              ['all', 'All'],
              ['standard', 'Standard'],
              ['other', 'Other']
            ].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => set('view', v === 'all' ? '' : v!)}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      {software.length === 0 ? (
        <div className="card">
          <Empty icon={Boxes} title="No software records yet">
            Software appears here once the Windows inventory agent has captured a device
            {config.sources.software?.catalog ? (
              <>
                {' '}
                or a standard catalog exists at <span className="mono">{config.sources.software.catalog}</span>
              </>
            ) : null}
            .
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon={SearchIcon} title="No matching software" />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Publisher</th>
                <th>Versions</th>
                <th>Devices</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 500).map((s) => {
                const versions = [...new Set(s.versions.map((v) => v.version))];
                return (
                  <tr key={s.name}>
                    <td>
                      {s.name}
                      {s.standard && (
                        <div>
                          <Badge tone="accent">Standard{s.standard.targetVersion ? ` · target ${s.standard.targetVersion}` : ''}</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      <Value v={s.publisher} />
                    </td>
                    <td className="mono">{versions.length ? versions.slice(0, 4).join(', ') + (versions.length > 4 ? ` +${versions.length - 4}` : '') : <span className="unknown">not installed</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {s.deviceIds.map((id) => (
                          <Link key={id} to={`/hub/devices/${encodeURIComponent(id)}`} className="chip">
                            {id}
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > 500 && <p className="subtle">Showing the first 500 results. Refine the search to see more.</p>}
    </>
  );
}
