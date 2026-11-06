/**
 * Repository path handling. Configuration and Markdown links may only reference relative paths
 * inside a repository; anything that could escape it or point to another host is rejected.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9._ -]+$/;

/** Returns true for a normalised, relative, in-repository path such as "setup/profiles/x.md". */
export function isSafeRepoPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return false;
  if (path.startsWith('/') || path.includes('\\') || path.includes(':') || path.includes('//')) return false;
  if (path.endsWith('/')) return false;
  return path.split('/').every((seg) => seg !== '.' && seg !== '..' && SAFE_SEGMENT.test(seg));
}

export function isSafeRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9._/-]{1,100}$/.test(ref) && !ref.includes('..') && !ref.startsWith('/') && !ref.endsWith('/');
}

export function isSafeOwner(owner: unknown): owner is string {
  return typeof owner === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner);
}

export function isSafeRepoName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..';
}

/** Encodes each path segment for use in a GitHub API URL. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** True when `path` equals `root` or lies below it. An empty root matches everything. */
export function isUnder(path: string, root: string): boolean {
  return root === '' || path === root || path.startsWith(root + '/');
}

/**
 * Resolves a relative link found in a document at `fromFile` to a repository path.
 * Returns null when the link leaves the repository or is not a plain relative path.
 */
export function resolveRelative(fromFile: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null;
  const clean = href.split('#')[0]!.split('?')[0]!;
  if (clean === '') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    return null;
  }
  const parts = decoded.startsWith('/') ? [] : dirname(fromFile).split('/').filter(Boolean);
  for (const seg of decoded.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  const result = parts.join('/');
  return isSafeRepoPath(result) ? result : null;
}
