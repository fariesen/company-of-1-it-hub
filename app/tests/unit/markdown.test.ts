import { describe, expect, it } from 'vitest';
import { markdownToText, renderMarkdown } from '../../src/lib/markdown';
import { isSafeRepoPath, resolveRelative } from '../../src/lib/paths';

const available = new Set(['setup/README.md', 'inventory/README.md', 'README.md']);
const ctx = { repository: 'it', path: 'setup/README.md', routeFor: (r: string, p: string) => (available.has(p) ? `#/hub/docs/${r}/${p}` : null) };
const html = (md: string) => renderMarkdown(md, ctx).html;

describe('renderMarkdown sanitisation', () => {
  it.each([
    ['<script>alert(1)</script>', /<script/i],
    ['<img src=x onerror="alert(1)">', /onerror/i],
    ['[x](javascript:alert(1))', /javascript:/i],
    ['<a href="data:text/html,<script>alert(1)</script>">x</a>', /data:text/i],
    ['<iframe src="https://evil.example"></iframe>', /<iframe/i],
    ['<div style="position:fixed">x</div>', /style=/i],
    ['<form action="https://evil.example"><input name=p></form>', /<form|<input/i],
    ['<svg><script>alert(1)</script></svg>', /<svg|<script/i]
  ])('removes dangerous markup: %s', (md, bad) => {
    expect(html(md)).not.toMatch(bad);
  });

  it('renders headings with ids, tables, code blocks and lists', () => {
    const r = renderMarkdown('# Title\n\n## Part one\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ps1\nGet-Item\n```\n\n- x\n- y', ctx);
    expect(r.headings.map((h) => h.id)).toEqual(['h-title', 'h-part-one']);
    expect(r.html).toContain('<table>');
    expect(r.html).toContain('data-table-wrap');
    expect(r.html).toContain('<code class="language-ps1">'.replace(' class="language-ps1"', ''));
    expect(r.html).toContain('<li>x</li>');
  });

  it('rewrites relative links to loaded documents as in-app routes', () => {
    expect(html('[inv](../inventory/README.md)')).toContain('href="#/hub/docs/it/inventory/README.md"');
    expect(html('[root](/README.md)')).toContain('href="#/hub/docs/it/README.md"');
  });

  it('keeps anchors inside the document without breaking hash routing', () => {
    const out = html('[jump](#part-one)');
    expect(out).toContain('data-anchor="h-part-one"');
    expect(out).toContain('href="#"');
  });

  it('turns links to unavailable files into plain text', () => {
    const out = html('[secret](../../outside.md) [missing](nope.md)');
    expect(out).not.toContain('href');
    expect(out).toContain('data-unresolved');
  });

  it('opens external links safely', () => {
    expect(html('[gh](https://github.com)')).toMatch(/target="_blank".*rel="noopener noreferrer"|rel="noopener noreferrer".*target="_blank"/);
  });

  it('replaces images (private images need credentials; remote images are blocked by CSP)', () => {
    const out = html('![diagram](net.png) ![t](https://tracker.example/p.gif)');
    expect(out).not.toContain('<img');
    expect(out).toContain('[diagram]');
  });

  it('extracts plain text for search', () => {
    expect(markdownToText('# A\n\n`code` [link](x.md) **bold**')).toBe('A link bold');
  });
});

describe('path safety', () => {
  it.each([
    ['setup/README.md', 'profiles/x.md', 'setup/profiles/x.md'],
    ['setup/README.md', '../README.md', 'README.md'],
    ['setup/README.md', './a/b.md#sec', 'setup/a/b.md'],
    ['README.md', '../escape.md', null],
    ['setup/README.md', 'https://x.example/a.md', null],
    ['setup/README.md', '//x.example/a.md', null],
    ['setup/README.md', '%2e%2e/%2e%2e/x.md', null]
  ])('resolveRelative(%s, %s) = %s', (from, href, expected) => {
    expect(resolveRelative(from, href)).toBe(expected);
  });

  it('accepts only normalised in-repository paths', () => {
    expect(isSafeRepoPath('inventory/ai-computers')).toBe(true);
    for (const p of ['', '/x', 'a/../b', 'a\\b', 'c:/x', 'a//b', 'a/', 'x?y']) expect(isSafeRepoPath(p)).toBe(false);
  });
});
