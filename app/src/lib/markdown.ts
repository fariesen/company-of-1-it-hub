/**
 * Safe Markdown rendering.
 *
 * marked converts Markdown to HTML; DOMPurify then removes scripts, event handlers, inline styles,
 * forms, frames and dangerous URLs. Afterwards links are rewritten:
 * - relative links to other loaded documents become in-app routes,
 * - in-page anchors are handled by the viewer (hash routing),
 * - external links open in a new tab without referrer,
 * - images are replaced by links/text, because private repository images need credentials and
 *   remote images are blocked by the Content Security Policy.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { resolveRelative } from './paths';

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface RenderedDoc {
  html: string;
  headings: Heading[];
}

export interface LinkContext {
  repository: string;
  path: string;
  /** Returns the in-app route for a repository path, or null if that file is not available. */
  routeFor: (repository: string, path: string) => string | null;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'section'
  );
}

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'svg', 'math'],
  FORBID_ATTR: ['style', 'class', 'id', 'srcset', 'formaction'],
  ALLOW_DATA_ATTR: false
};

export function renderMarkdown(source: string, ctx: LinkContext): RenderedDoc {
  const raw = marked.parse(source, { async: false, gfm: true, breaks: false }) as string;
  const clean = DOMPurify.sanitize(raw, { ...PURIFY_CONFIG, RETURN_DOM_FRAGMENT: true }) as DocumentFragment;

  const headings: Heading[] = [];
  const used = new Map<string, number>();
  clean.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const text = h.textContent ?? '';
    let id = 'h-' + slugify(text);
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n > 0) id += `-${n}`;
    h.setAttribute('id', id);
    headings.push({ depth: Number(h.tagName.slice(1)), text, id });
  });

  clean.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      a.setAttribute('data-anchor', 'h-' + slugify(decodeURIComponentSafe(href.slice(1))));
      a.setAttribute('href', '#');
      return;
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      return;
    }
    const target = resolveRelative(ctx.path, href);
    const anchor = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
    const route = target ? ctx.routeFor(ctx.repository, target) : null;
    if (route) {
      a.setAttribute('href', route);
      if (anchor) a.setAttribute('data-anchor', 'h-' + slugify(decodeURIComponentSafe(anchor)));
    } else {
      const span = a.ownerDocument.createElement('span');
      span.textContent = a.textContent;
      span.setAttribute('title', target ? `${target} is not available in the IT Hub` : 'Link not available');
      span.setAttribute('data-unresolved', '');
      a.replaceWith(span);
    }
  });

  clean.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt') || 'image';
    const span = img.ownerDocument.createElement('span');
    span.textContent = `[${alt}]`;
    span.setAttribute('data-image', '');
    img.replaceWith(span);
  });

  clean.querySelectorAll('table').forEach((t) => {
    const wrap = t.ownerDocument.createElement('div');
    wrap.setAttribute('data-table-wrap', '');
    t.replaceWith(wrap);
    wrap.appendChild(t);
  });

  const container = clean.ownerDocument.createElement('div');
  container.appendChild(clean);
  return { html: container.innerHTML, headings };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Plain text for search indexing. */
export function markdownToText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
