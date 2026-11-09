/**
 * The human-maintained software catalog (software/catalog.json in the private repository) and the
 * rule that links installed software to a catalog package. Parsing is defensive: malformed entries
 * are skipped, extra keys are tolerated. Nothing here is per-device state.
 */
import { isSafeRepoPath } from './paths';

export const PACKAGE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface CatalogPackage {
  id: string;
  name: string;
  publisher?: string;
  kind?: string;
  parent?: string;
  category?: string;
  status?: string;
  tags: string[];
  baseline: boolean;
  preferred: boolean;
  alternatives: string[];
  related: string[];
  dependencies: string[];
  recipes: string[];
  sources: string[];
  documentation: string[];
  downloadUrl?: string;
  targetVersion?: string;
  versionPolicy?: { mode: string; version?: string; reason?: string };
  install?: { method?: string; packageId?: string; scope?: string; notes?: string };
  notes?: string;
  /** Name patterns from match.names (case-insensitive regular expressions, as the agent uses them). */
  matchNames: RegExp[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const strList = (v: unknown, max = 40, len = 120): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= len).slice(0, max) : []);
const idList = (v: unknown): string[] => strList(v).filter((x) => PACKAGE_ID.test(x));
const httpsUrl = (v: unknown): string | undefined => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(v) ? v : undefined);

function compilePattern(p: string): RegExp | null {
  if (p.length > 200) return null;
  try {
    return new RegExp(p, 'i');
  } catch {
    return null;
  }
}

export function parseCatalogPackages(json: unknown): CatalogPackage[] {
  if (!isObj(json) || !Array.isArray(json.packages)) return [];
  const out: CatalogPackage[] = [];
  const seen = new Set<string>();
  for (const p of json.packages as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string' || !PACKAGE_ID.test(p.id) || typeof p.name !== 'string' || seen.has(p.id)) continue;
    seen.add(p.id);
    const vp = isObj(p.versionPolicy) && typeof p.versionPolicy.mode === 'string' ? { mode: p.versionPolicy.mode.slice(0, 20), version: str(p.versionPolicy.version, 40), reason: str(p.versionPolicy.reason, 300) } : undefined;
    const inst = isObj(p.install) ? { method: str(p.install.method, 40), packageId: str(p.install.packageId, 100), scope: str(p.install.scope, 20), notes: str(p.install.notes, 500) } : undefined;
    const match = isObj(p.match) ? p.match : {};
    out.push({
      id: p.id,
      name: p.name.slice(0, 120),
      publisher: str(p.publisher, 120),
      kind: str(p.kind, 40),
      parent: typeof p.parent === 'string' && PACKAGE_ID.test(p.parent) ? p.parent : undefined,
      category: str(p.category, 60),
      status: str(p.status, 20),
      tags: strList(p.tags),
      baseline: p.baseline === true,
      preferred: p.preferred === true,
      alternatives: idList(p.alternatives),
      related: idList(p.related),
      dependencies: idList(p.dependencies),
      recipes: idList(p.recipes),
      sources: strList(p.sources),
      documentation: (Array.isArray(p.documentation) ? p.documentation : []).map(httpsUrl).filter((u): u is string => !!u).slice(0, 20),
      downloadUrl: httpsUrl(p.downloadUrl),
      targetVersion: str(p.targetVersion, 40) ?? (vp && ['pinned', 'minimum'].includes(vp.mode) ? vp.version : undefined),
      versionPolicy: vp,
      install: inst,
      notes: str(p.notes, 1000),
      matchNames: strList(match.names, 20, 200)
        .map(compilePattern)
        .filter((r): r is RegExp => r !== null)
    });
  }
  return out;
}

/** The catalog package an installed program belongs to: exact name first, then the package's name patterns. */
export function matchCatalogPackage(name: string, catalog: CatalogPackage[]): CatalogPackage | undefined {
  const n = name.trim().toLowerCase();
  return catalog.find((p) => p.name.toLowerCase() === n) ?? catalog.find((p) => p.matchNames.some((r) => r.test(name)));
}

export function compareVersionStrings(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type VersionCheck = 'ok' | 'differs' | 'unknown' | 'unmanaged';

/** Installed version against the catalog policy. Unknown versions are never reported as ok. */
export function checkVersion(installed: string | undefined, pkg: CatalogPackage): VersionCheck {
  const mode = pkg.versionPolicy?.mode;
  const target = pkg.targetVersion;
  if (!target || mode === 'latest' || mode === 'unmanaged' || !mode) return 'unmanaged';
  if (!installed || installed === 'unknown' || !/\d/.test(installed)) return 'unknown';
  if (mode === 'minimum') return compareVersionStrings(installed, target) >= 0 ? 'ok' : 'differs';
  // pinned: equal on the segments the target names (2.55 matches 2.55.0.1).
  const want = target.split('.');
  const have = installed.split(/[.+-]/);
  return want.every((seg, i) => (Number.parseInt(have[i] ?? '', 10) || 0) === (Number.parseInt(seg, 10) || 0)) ? 'ok' : 'differs';
}

export const guidePath = (root: string, id: string) => `${root}/guides/${id}`;
export const isGuideFile = (path: string, root: string) => isSafeRepoPath(path) && new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/guides/[a-z0-9][a-z0-9-]{0,63}/(guide\\.json|README\\.md)$`).test(path);
