import { FileText, Network, Wrench } from 'lucide-react';
import { DocView } from '../components/DocView';
import { Callout, Empty, PageHead } from '../components/ui';
import { isUnder } from '../lib/paths';
import { docRoute } from '../lib/search';
import { useHubData } from '../state';

const META = {
  infrastructure: {
    title: 'Infrastructure',
    icon: Network,
    description: 'Network, remote access, machine roles and overall IT architecture. This content is private and only shown to authorised accounts.'
  },
  setup: {
    title: 'Setup',
    icon: Wrench,
    description: 'Setup guides, device setup profiles and installation scripts for new computers.'
  }
} as const;

export function SectionDocs({ section }: { section: 'infrastructure' | 'setup' }) {
  const data = useHubData();
  const meta = META[section];
  const src = data.config.sources[section];
  if (!src) {
    return (
      <>
        <PageHead title={meta.title} />
        <div className="card">
          <Empty icon={meta.icon} title={`No ${meta.title.toLowerCase()} source configured`}>
            Add <span className="mono">sources.{section}</span> to the private IT Hub configuration.
          </Empty>
        </div>
      </>
    );
  }
  const docs = data.docs.filter((d) => d.repository === src.repository && isUnder(d.path, src.path));
  const readme = docs.find((d) => d.path === `${src.path}/README.md`);
  const others = docs.filter((d) => d !== readme);
  const profiles = section === 'setup' ? others.filter((d) => d.path.includes('/profiles/')) : [];
  const guides = others.filter((d) => !profiles.includes(d));

  return (
    <>
      <PageHead title={meta.title} description={meta.description} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {(guides.length > 0 || profiles.length > 0) && (
          <div className="grid grid-2">
            {guides.length > 0 && (
              <section className="card">
                <h2>{section === 'setup' ? 'Guides' : 'Documents'}</h2>
                <ul className="list">
                  {guides.map((d) => (
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
              </section>
            )}
            {profiles.length > 0 && (
              <section className="card">
                <h2>Setup profiles</h2>
                <ul className="list">
                  {profiles.map((d) => (
                    <li key={d.key}>
                      <a className="list-item" href={docRoute(d)}>
                        <Wrench size={16} aria-hidden="true" />
                        <div className="grow">
                          <div className="t">{d.title}</div>
                          <div className="s">{d.path}</div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        {readme ? (
          <section className="card">
            <DocView data={data} doc={readme} />
          </section>
        ) : (
          <div className="card">
            <Empty icon={meta.icon} title={`No ${meta.title.toLowerCase()} documents yet`}>
              Add Markdown files under <span className="mono">{src.path}/</span> in the IT repository.
            </Empty>
          </div>
        )}
        {section === 'infrastructure' && (
          <Callout tone="info">Infrastructure documents must never contain passwords, keys or private connection IDs. The IT Hub shows them only after the repository access check.</Callout>
        )}
      </div>
    </>
  );
}
