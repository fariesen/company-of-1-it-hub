import { BookOpen, ChevronRight, Search as SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DocView, Toc } from '../components/DocView';
import { Empty, PageHead } from '../components/ui';
import { normalise, docRoute } from '../lib/search';
import { useHubData } from '../state';

export function Docs() {
  const data = useHubData();
  const params = useParams();
  const repo = params.repo;
  const path = params['*'];
  const [filter, setFilter] = useState('');
  const [anchor, setAnchor] = useState<string | undefined>();

  const doc = useMemo(() => {
    if (repo && path) return data.docs.find((d) => d.repository === repo && d.path === path);
    const first = data.config.sources.documentation[0];
    return first ? data.docs.find((d) => d.repository === first.repository && (d.path === first.path || d.path === `${first.path}/README.md`)) : undefined;
  }, [data, repo, path]);

  useEffect(() => {
    const a = sessionStorage.getItem('it-hub.anchor') ?? undefined;
    sessionStorage.removeItem('it-hub.anchor');
    setAnchor(a);
  }, [doc]);

  const groups = useMemo(() => {
    const f = normalise(filter);
    return data.config.sources.documentation
      .map((section) => ({
        section,
        docs: data.docs
          .filter((d) => d.section === section.id)
          .filter((d) => !f || normalise(`${d.title} ${d.path}`).includes(f))
          .sort((a, z) => (a.path.endsWith('README.md') ? -1 : z.path.endsWith('README.md') ? 1 : a.title.localeCompare(z.title)))
      }))
      .filter((g) => g.docs.length > 0);
  }, [data, filter]);

  if (data.docs.length === 0) {
    return (
      <>
        <PageHead title="Documentation" />
        <div className="card">
          <Empty icon={BookOpen} title="No documentation found">
            No Markdown files were found in the configured documentation sections.
          </Empty>
        </div>
      </>
    );
  }

  const section = doc ? data.config.sources.documentation.find((s) => s.id === doc.section) : undefined;

  return (
    <div className="docs-layout">
      <aside className="doc-tree card" aria-label="Documents" style={{ alignSelf: 'start' }}>
        <div className="search-wrap">
          <SearchIcon size={16} aria-hidden="true" />
          <input className="input input-search" type="search" placeholder="Filter documents" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter documents" />
        </div>
        {groups.map((g) => (
          <div key={g.section.id}>
            <h3>{g.section.title}</h3>
            {g.docs.map((d) => (
              <a key={d.key} href={docRoute(d)} className={doc?.key === d.key ? 'active' : undefined} title={d.path}>
                {d.title}
              </a>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="subtle">No matching documents.</p>}
      </aside>
      <div className="card" style={{ minWidth: 0 }}>
        {doc ? (
          <>
            <div className="breadcrumbs">
              <a href="#/hub/docs">Documentation</a>
              {section && (
                <>
                  <ChevronRight size={13} aria-hidden="true" /> {section.title}
                </>
              )}
              <ChevronRight size={13} aria-hidden="true" /> <span>{doc.title}</span>
            </div>
            <DocView data={data} doc={doc} anchor={anchor} />
          </>
        ) : (
          <Empty icon={BookOpen} title="Document not found">
            <span className="mono">{path}</span> is not part of the configured documentation.
          </Empty>
        )}
      </div>
      {doc && <Toc data={data} doc={doc} />}
    </div>
  );
}
