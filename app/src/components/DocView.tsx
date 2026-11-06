import { ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import type { DocEntry, HubData } from '../lib/content';
import { renderMarkdown } from '../lib/markdown';
import { docRoute } from '../lib/search';

export function useDocRenderer(data: HubData, doc: DocEntry | undefined) {
  return useMemo(() => {
    if (!doc) return null;
    const keys = new Set(data.docs.map((d) => d.key));
    return renderMarkdown(doc.content, {
      repository: doc.repository,
      path: doc.path,
      routeFor: (repo, path) => (keys.has(`${repo}:${path}`) ? docRoute({ repository: repo, path }) : null)
    });
  }, [data.docs, doc]);
}

export function githubBlobUrl(data: HubData, doc: DocEntry): string {
  const r = data.repositories[doc.repository]!.ref;
  return `https://github.com/${r.owner}/${r.name}/blob/${encodeURIComponent(r.ref)}/${doc.path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Renders sanitised Markdown. In-page anchors are scrolled to without touching the hash route. */
export function DocView({ data, doc, anchor }: { data: HubData; doc: DocEntry; anchor?: string }) {
  const rendered = useDocRenderer(data, doc);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  }, [anchor, rendered]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const target = a?.getAttribute('data-anchor');
    if (a && target && a.getAttribute('href') === '#') {
      e.preventDefault();
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
    } else if (a && target) {
      sessionStorage.setItem('it-hub.anchor', target);
    }
  };

  if (!rendered) return null;
  return (
    <article>
      {/* Content is sanitised by DOMPurify in renderMarkdown before it reaches the DOM. */}
      <div ref={ref} className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: rendered.html }} />
      <p className="subtle" style={{ marginTop: 28 }}>
        <span className="mono">{doc.path}</span> ·{' '}
        <a href={githubBlobUrl(data, doc)} target="_blank" rel="noopener noreferrer">
          Edit in GitHub <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
    </article>
  );
}

export function Toc({ data, doc }: { data: HubData; doc: DocEntry }) {
  const rendered = useDocRenderer(data, doc);
  const headings = rendered?.headings.filter((h) => h.depth === 2 || h.depth === 3) ?? [];
  if (headings.length < 2) return null;
  return (
    <nav className="toc" aria-label="On this page">
      <div className="nav-label" style={{ margin: '0 0 6px' }}>
        On this page
      </div>
      {headings.map((h) => (
        <a
          key={h.id}
          className={`d${h.depth}`}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}
