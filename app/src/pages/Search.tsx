import { BookOpen, Boxes, Cpu, Search as SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, PageHead } from '../components/ui';
import { searchAll } from '../lib/search';
import { useHubData } from '../state';

const ICONS = { device: Cpu, software: Boxes, doc: BookOpen } as const;

export function Search() {
  const data = useHubData();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchAll(data, q), [data, q]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <>
      <PageHead title="Search" description="Devices, software and documentation." />
      <div className="search-wrap" style={{ marginBottom: 16 }}>
        <SearchIcon size={17} aria-hidden="true" />
        <input
          ref={input}
          className="input input-search"
          type="search"
          placeholder="Search the IT Hub"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          aria-label="Search the IT Hub"
        />
      </div>
      <div className="card">
        {q.trim() === '' ? (
          <Empty icon={SearchIcon} title="Search everything">
            Try a device ID such as <span className="mono">AIC-001</span>, a GPU, a program or a topic.
          </Empty>
        ) : hits.length === 0 ? (
          <Empty icon={SearchIcon} title={`No results for "${q}"`} />
        ) : (
          <ul className="list" aria-live="polite">
            {hits.map((h) => {
              const Icon = ICONS[h.kind];
              return (
                <li key={h.kind + h.id}>
                  <a className="list-item" href={h.route}>
                    <div className="icon-tile">
                      <Icon size={17} aria-hidden="true" />
                    </div>
                    <div className="grow">
                      <div className="t">{h.title}</div>
                      <div className="s">{h.kind === 'doc' && h.excerpt ? h.excerpt : h.subtitle}</div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
