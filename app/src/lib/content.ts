/**
 * Loads everything the hub shows from GitHub, using the signed-in user's credentials.
 *
 * Cost per refresh with a warm in-memory cache: 1 profile + 1 access check + 1 config + 1 tree per
 * repository (usually 304 Not Modified) + 1 commit list + 1 release list. Files are fetched as
 * blobs by SHA, so unchanged files are never downloaded twice in a session.
 */
import { AppError, isAppError } from './errors';
import { parsePrivateConfig, type PrivateConfig, type PublicBootstrap, type RepositoryRef } from './bootstrap';
import type { CommitSummary, GitHubClient, GitHubUser, RateLimitInfo, Release, RepoInfo, Tree, TreeEntry } from './github';
import { parseDeviceRecord, parseSnapshot, ParseError, type ContentProblem, type Device } from './inventory';
import { basename, dirname, isUnder } from './paths';
import { LIMITS } from './policy';
import { matchCatalogPackage, parseCatalogPackages, type CatalogPackage } from './catalog';
import { parseGuide, type Guide } from './guides';
import { parseRecipe, type Recipe } from './recipes';

export interface DocEntry {
  /** Stable key: "<repoKey>:<path>" */
  key: string;
  repository: string;
  path: string;
  title: string;
  section: string;
  sha: string;
  content: string;
}

export interface SoftwareRecord {
  name: string;
  publisher?: string;
  versions: { version: string; deviceId: string }[];
  deviceIds: string[];
  /** Catalog entry (general software facts; never per-device state). */
  standard?: { id?: string; targetVersion?: string; category?: string; notes?: string; tags?: string[]; preferred?: boolean; baseline?: boolean; alternatives?: string[]; status?: string };
}

/** Central knowledge of one catalog package (software/guides/<id>/). Both parts are optional. */
export interface GuideEntry {
  guide?: Guide;
  readme?: DocEntry;
}

export interface CatalogTag {
  id: string;
  label: string;
  description?: string;
}

/** Read-only summary of a setup recipe in the private repository. The PWA never runs recipes. */
export interface RecipeSummary {
  id: string;
  version: string;
  title: string;
  status: string;
  package: string;
  privileges: string;
  steps: number;
  manualSteps: number;
  path: string;
}

/** Approved-release manifest state: a GitHub release counts only when it is listed there. */
export interface AgentApproval {
  manifest: 'found' | 'missing' | 'invalid';
  listed: number;
  path: string;
}

export interface AgentRelease {
  version: string;
  tag: string;
  publishedAt: string | null;
  url: string;
  approvedOn?: string;
  /** SHA-256 of the package, from the approved-release manifest. */
  sha256: string;
}

export const APPROVED_RELEASES_PATH = 'agent/windows/approved-releases.json';

export interface HubData {
  user: GitHubUser;
  config: PrivateConfig;
  configPath: string;
  repositories: Record<string, RepoInfo & { ref: RepositoryRef }>;
  devices: Device[];
  docs: DocEntry[];
  software: SoftwareRecord[];
  recentChanges: CommitSummary[];
  agentRelease?: AgentRelease;
  agentApproval?: AgentApproval;
  catalogTags: CatalogTag[];
  /** Catalog packages with all display fields (software detail pages). */
  catalog: CatalogPackage[];
  /** Central knowledge per catalog package id. */
  guides: Record<string, GuideEntry>;
  recipes: RecipeSummary[];
  /** Full recipes for display (steps and commands are shown, never run). */
  recipeDetails: Recipe[];
  problems: ContentProblem[];
  loadedAt: number;
  requestCount: number;
  rateLimit: RateLimitInfo;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function titleFromMarkdown(content: string, path: string): string {
  const m = /^#\s+(.+)$/m.exec(content);
  if (m) return m[1]!.trim().slice(0, 120);
  const file = basename(path).replace(/\.md$/i, '');
  return file === 'README' ? dirname(path) || 'Overview' : file.replace(/[-_]/g, ' ');
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ParseError(`${path} is not valid JSON`);
  }
}

export async function loadHub(client: GitHubClient, bootstrap: PublicBootstrap, previousCommits?: CommitSummary[]): Promise<HubData> {
  const startCount = client.requestCount;
  const problems: ContentProblem[] = [];
  const user = await client.getUser();

  // Stage 2 bootstrap: explicit authorization check, then the private configuration.
  const b = bootstrap.bootstrap;
  const bootRepo: RepositoryRef = { owner: b.owner, name: b.repository, ref: b.ref };
  await client.verifyRepositoryAccess(bootRepo);
  let configText: string;
  try {
    configText = await client.getFileText(bootRepo, b.path);
  } catch (e) {
    if (isAppError(e) && e.kind === 'not-found') {
      throw new AppError('invalid-config', `The private configuration ${b.path} was not found in ${b.owner}/${b.repository} (${b.ref}).`, { detail: b.path });
    }
    throw e;
  }
  let configJson: unknown;
  try {
    configJson = JSON.parse(configText);
  } catch {
    throw new AppError('invalid-config', `The private configuration ${b.path} is not valid JSON.`, { detail: b.path });
  }
  const config = parsePrivateConfig(configJson);

  // Every repository the configuration references must pass its own access check.
  const usedKeys = new Set<string>([
    config.sources.inventory.repository,
    ...config.sources.documentation.map((d) => d.repository),
    ...[config.sources.software, config.sources.infrastructure, config.sources.setup].flatMap((s) => (s ? [s.repository] : [])),
    ...(config.agent?.windows ? [config.agent.windows.repository] : [])
  ]);
  const repositories: HubData['repositories'] = {};
  const trees: Record<string, Tree> = {};
  await Promise.all(
    [...usedKeys].map(async (key) => {
      const ref = config.repositories[key]!;
      const info = await client.verifyRepositoryAccess(ref);
      repositories[key] = { ...info, ref };
      trees[key] = await client.getTree(ref);
      if (trees[key].truncated) problems.push({ path: `${ref.owner}/${ref.name}`, message: 'Repository tree is too large and was truncated; some content may be missing.' });
    })
  );

  const blobs = (key: string, pred: (e: TreeEntry) => boolean) => trees[key]!.tree.filter((e) => e.type === 'blob' && pred(e));

  // Devices: every device.json under the inventory root, plus the newest snapshot in its folder.
  const inv = config.sources.inventory;
  const invRepo = config.repositories[inv.repository]!;
  const records = blobs(inv.repository, (e) => isUnder(e.path, inv.path) && basename(e.path) === 'device.json').slice(0, LIMITS.maxDevices);
  const snapshotsByFolder = new Map<string, TreeEntry[]>();
  for (const e of blobs(inv.repository, (x) => isUnder(x.path, inv.path) && /\/snapshots\/[^/]+\.json$/.test(x.path))) {
    const folder = dirname(dirname(e.path));
    const list = snapshotsByFolder.get(folder) ?? [];
    list.push(e);
    snapshotsByFolder.set(folder, list);
  }

  const loaded = await mapLimit(records, LIMITS.concurrency, async (entry): Promise<Device | null> => {
    const folder = dirname(entry.path);
    try {
      if ((entry.size ?? 0) > LIMITS.maxFileBytes) throw new ParseError('file is too large');
      const record = parseDeviceRecord(parseJson(await client.getBlobText(invRepo, entry.sha, entry.path), entry.path), config.contentSchemas.device);
      const snaps = (snapshotsByFolder.get(folder) ?? []).sort((a, z) => basename(z.path).localeCompare(basename(a.path)));
      const device: Device = { ...record, repository: inv.repository, folder, recordPath: entry.path, snapshotCount: snaps.length };
      const latest = snaps[0];
      if (latest) {
        try {
          const snap = parseSnapshot(parseJson(await client.getBlobText(invRepo, latest.sha, latest.path), latest.path), config.contentSchemas.snapshot);
          if (snap.deviceId !== record.id) problems.push({ path: latest.path, message: `Snapshot belongs to ${snap.deviceId}, not ${record.id}; ignored.` });
          else {
            device.snapshot = snap;
            device.snapshotPath = latest.path;
          }
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
          problems.push({ path: latest.path, message: e.message });
        }
      }
      return device;
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      problems.push({ path: entry.path, message: e.message });
      return null;
    }
  });
  const devices = loaded.filter((d): d is Device => d !== null).sort((a, z) => a.id.localeCompare(z.id));
  const ids = new Map<string, string>();
  for (const d of devices) {
    if (ids.has(d.id)) problems.push({ path: d.recordPath, message: `Duplicate device ID ${d.id} (also in ${ids.get(d.id)})` });
    ids.set(d.id, d.recordPath);
  }

  // Documentation: Markdown files in each configured section (a section may be a single file).
  const docEntries: { repository: string; section: string; entry: TreeEntry }[] = [];
  const seenDocs = new Set<string>();
  for (const section of config.sources.documentation) {
    const matches = blobs(section.repository, (e) => /\.md$/i.test(e.path) && (e.path === section.path || isUnder(e.path, section.path)));
    if (matches.length === 0) problems.push({ path: section.path, message: `Documentation section "${section.title}" has no Markdown files.` });
    for (const entry of matches) {
      const key = `${section.repository}:${entry.path}`;
      if (seenDocs.has(key)) continue;
      seenDocs.add(key);
      docEntries.push({ repository: section.repository, section: section.id, entry });
    }
  }
  if (docEntries.length > LIMITS.maxDocuments) problems.push({ path: 'documentation', message: `Only the first ${LIMITS.maxDocuments} documents are loaded.` });
  const docs = await mapLimit(docEntries.slice(0, LIMITS.maxDocuments), LIMITS.concurrency, async ({ repository, section, entry }): Promise<DocEntry> => {
    const content = (entry.size ?? 0) > LIMITS.maxFileBytes ? '_This document is too large to display in the IT Hub._' : await client.getBlobText(config.repositories[repository]!, entry.sha, entry.path);
    return { key: `${repository}:${entry.path}`, repository, path: entry.path, title: titleFromMarkdown(content, entry.path), section, sha: entry.sha, content };
  });

  // Software: aggregated from agent snapshots, enriched by an optional human-maintained catalog.
  const software = aggregateSoftware(devices);
  let catalogTags: CatalogTag[] = [];
  let catalog: CatalogPackage[] = [];
  const sw = config.sources.software;
  if (sw?.catalog) {
    const entry = trees[sw.repository]!.tree.find((e) => e.type === 'blob' && e.path === sw.catalog);
    if (entry) {
      try {
        const json = parseJson(await client.getBlobText(config.repositories[sw.repository]!, entry.sha, entry.path), entry.path);
        catalogTags = mergeCatalog(software, json, problems, entry.path);
        catalog = parseCatalogPackages(json);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        problems.push({ path: entry.path, message: e.message });
      }
    }
  }

  // Central knowledge per package: software/guides/<id>/guide.json and README.md (both optional).
  const guides: Record<string, GuideEntry> = {};
  if (sw) {
    const dir = `${sw.path}/guides/`;
    const known = new Set(catalog.map((p) => p.id));
    const docByKey = new Map(docs.map((d) => [d.key, d]));
    const guideFiles = blobs(sw.repository, (e) => e.path.startsWith(dir) && /^[a-z0-9][a-z0-9-]{0,63}\/(guide\.json|README\.md)$/.test(e.path.slice(dir.length))).slice(0, LIMITS.maxDocuments);
    await mapLimit(guideFiles, LIMITS.concurrency, async (entry) => {
      const [id, file] = entry.path.slice(dir.length).split('/') as [string, string];
      if (!known.has(id)) {
        problems.push({ path: entry.path, message: `Guide folder "${id}" does not match a catalog package; ignored.` });
        return;
      }
      const slot = (guides[id] ??= {});
      try {
        if ((entry.size ?? 0) > LIMITS.maxFileBytes) throw new ParseError(`${entry.path} is too large`);
        if (file === 'README.md') {
          const key = `${sw.repository}:${entry.path}`;
          const content = docByKey.get(key)?.content ?? (await client.getBlobText(config.repositories[sw.repository]!, entry.sha, entry.path));
          slot.readme = docByKey.get(key) ?? { key, repository: sw.repository, path: entry.path, title: titleFromMarkdown(content, entry.path), section: 'software', sha: entry.sha, content };
        } else {
          const g = parseGuide(parseJson(await client.getBlobText(config.repositories[sw.repository]!, entry.sha, entry.path), entry.path), entry.path, id);
          if (g.skipped > 0) problems.push({ path: entry.path, message: `${g.skipped} guide item(s) do not match the guide schema and are not shown.` });
          slot.guide = g;
        }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        problems.push({ path: entry.path, message: e.message });
      }
    });
  }

  // Setup recipes (read-only summaries; history versions are not listed).
  let recipes: RecipeSummary[] = [];
  let recipeDetails: Recipe[] = [];
  const setup = config.sources.setup;
  if (setup) {
    const dir = `${setup.path}/recipes/`;
    const entries = blobs(setup.repository, (e) => e.path.startsWith(dir) && /^[a-z0-9][a-z0-9-]*\.json$/.test(e.path.slice(dir.length))).slice(0, LIMITS.maxDocuments);
    // Archived versions (history/<id>/<version>.json) are listed from the tree only; they are not downloaded.
    const archived = new Map<string, string[]>();
    for (const e of blobs(setup.repository, (x) => x.path.startsWith(`${dir}history/`))) {
      const m = /^history\/([a-z0-9][a-z0-9-]*)\/(\d+\.\d+\.\d+)\.json$/.exec(e.path.slice(dir.length));
      if (m) archived.set(m[1]!, [...(archived.get(m[1]!) ?? []), m[2]!]);
    }
    const parsed = await mapLimit(entries, LIMITS.concurrency, async (entry): Promise<[RecipeSummary, Recipe] | null> => {
      try {
        if ((entry.size ?? 0) > LIMITS.maxFileBytes) throw new ParseError(`${entry.path} is too large`);
        const json = parseJson(await client.getBlobText(config.repositories[setup.repository]!, entry.sha, entry.path), entry.path);
        const summary = parseRecipeSummary(json, entry.path);
        return [summary, parseRecipe(json, entry.path, archived.get(summary.id) ?? [])];
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        problems.push({ path: entry.path, message: e.message });
        return null;
      }
    });
    const ok = parsed.filter((r): r is [RecipeSummary, Recipe] => r !== null).sort((a, z) => a[0].id.localeCompare(z[0].id));
    recipes = ok.map((r) => r[0]);
    recipeDetails = ok.map((r) => r[1]);
  }

  // Recent inventory changes (Git history is the change log). Failure here is not fatal.
  let recentChanges: CommitSummary[] = previousCommits ?? [];
  try {
    recentChanges = await client.getRecentCommits(invRepo, inv.path);
  } catch (e) {
    if (isAppError(e) && (e.kind === 'auth-expired' || e.kind === 'no-access')) throw e;
  }

  // Latest approved agent release, with the same rule as the agent: published, not draft, not
  // prerelease, tag with the configured prefix AND listed in agent/windows/approved-releases.json.
  let agentRelease: AgentRelease | undefined;
  let agentApproval: AgentApproval | undefined;
  const aw = config.agent?.windows;
  if (aw && config.features.agentStatus !== false) {
    const manifestEntry = trees[aw.repository]!.tree.find((e) => e.type === 'blob' && e.path === APPROVED_RELEASES_PATH);
    let listed = new Map<string, ApprovedReleaseEntry>();
    agentApproval = { manifest: 'missing', listed: 0, path: APPROVED_RELEASES_PATH };
    if (manifestEntry) {
      try {
        listed = parseApprovedReleases(parseJson(await client.getBlobText(config.repositories[aw.repository]!, manifestEntry.sha, manifestEntry.path), manifestEntry.path), aw.releaseTagPrefix);
        agentApproval = { manifest: 'found', listed: listed.size, path: APPROVED_RELEASES_PATH };
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        agentApproval = { manifest: 'invalid', listed: 0, path: APPROVED_RELEASES_PATH };
        problems.push({ path: APPROVED_RELEASES_PATH, message: e.message });
      }
    }
    if (listed.size > 0) {
      try {
        const releases: Release[] = await client.getReleases(config.repositories[aw.repository]!);
        const approved = releases.filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(aw.releaseTagPrefix) && listed.has(r.tag_name));
        const top = approved.sort((a, z) => compareVersions(z.tag_name.slice(aw.releaseTagPrefix.length), a.tag_name.slice(aw.releaseTagPrefix.length)))[0];
        const entry = top ? listed.get(top.tag_name) : undefined;
        if (top && entry) agentRelease = { version: top.tag_name.slice(aw.releaseTagPrefix.length), tag: top.tag_name, publishedAt: top.published_at, url: top.html_url, approvedOn: entry.approvedOn, sha256: entry.sha256 };
      } catch (e) {
        if (isAppError(e) && e.kind === 'auth-expired') throw e;
      }
    }
  }

  return {
    user,
    config,
    configPath: `${b.owner}/${b.repository}/${b.path}@${b.ref}`,
    repositories,
    devices,
    docs: docs.sort((a, z) => a.path.localeCompare(z.path)),
    software,
    recentChanges,
    agentRelease,
    agentApproval,
    catalogTags,
    catalog,
    guides,
    recipes,
    recipeDetails,
    problems,
    loadedAt: Date.now(),
    requestCount: client.requestCount - startCount,
    rateLimit: { ...client.rateLimit }
  };
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function aggregateSoftware(devices: Device[]): SoftwareRecord[] {
  const byName = new Map<string, SoftwareRecord>();
  for (const d of devices) {
    for (const s of d.snapshot?.software ?? []) {
      const key = s.name.toLowerCase();
      const rec = byName.get(key) ?? { name: s.name, publisher: s.publisher, versions: [], deviceIds: [] };
      if (!rec.deviceIds.includes(d.id)) rec.deviceIds.push(d.id);
      rec.versions.push({ version: s.version ?? 'unknown', deviceId: d.id });
      byName.set(key, rec);
    }
  }
  return [...byName.values()].sort((a, z) => a.name.localeCompare(z.name));
}

const strList = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120).slice(0, max) : []);

export function mergeCatalog(software: SoftwareRecord[], json: unknown, problems: ContentProblem[], path: string): CatalogTag[] {
  const root = json as { schemaVersion?: unknown; packages?: unknown; tags?: unknown };
  if (typeof root !== 'object' || root === null || root.schemaVersion !== 1 || !Array.isArray(root.packages)) {
    problems.push({ path, message: 'Software catalog must have schemaVersion 1 and a "packages" list.' });
    return [];
  }
  const tags: CatalogTag[] = Array.isArray(root.tags)
    ? (root.tags as Record<string, unknown>[]).filter((t) => typeof t?.id === 'string' && typeof t?.label === 'string').map((t) => ({ id: t.id as string, label: t.label as string, description: typeof t.description === 'string' ? t.description : undefined }))
    : [];
  const names = new Map<string, string>();
  for (const p of root.packages as Record<string, unknown>[]) if (typeof p?.id === 'string' && typeof p?.name === 'string') names.set(p.id, p.name);
  const parsed = parseCatalogPackages(json);
  for (const p of root.packages as Record<string, unknown>[]) {
    if (typeof p?.name !== 'string') continue;
    const pkg = parsed.find((x) => x.id === p.id);
    const policy = (typeof p.versionPolicy === 'object' && p.versionPolicy !== null ? p.versionPolicy : {}) as Record<string, unknown>;
    const standard = {
      id: pkg?.id,
      targetVersion: typeof p.targetVersion === 'string' ? p.targetVersion : ['pinned', 'minimum'].includes(policy.mode as string) && typeof policy.version === 'string' ? policy.version : undefined,
      category: typeof p.category === 'string' ? p.category : undefined,
      notes: typeof p.notes === 'string' ? p.notes : undefined,
      tags: strList(p.tags),
      preferred: p.preferred === true,
      baseline: p.baseline === true,
      alternatives: strList(p.alternatives).map((id) => names.get(id) ?? id),
      status: typeof p.status === 'string' ? p.status : undefined
    };
    // Installed programs belong to the package by exact name or by its match.names patterns (as in the agent).
    const hits = pkg ? software.filter((s) => !s.standard && matchCatalogPackage(s.name, parsed)?.id === pkg.id) : software.filter((s) => !s.standard && s.name.toLowerCase() === (p.name as string).toLowerCase());
    if (hits.length > 0) for (const h of hits) h.standard = standard;
    else if (!software.some((s) => s.standard?.id !== undefined && s.standard.id === pkg?.id)) software.push({ name: p.name, publisher: typeof p.publisher === 'string' ? p.publisher : undefined, versions: [], deviceIds: [], standard });
  }
  software.sort((a, z) => a.name.localeCompare(z.name));
  return tags;
}

export interface ApprovedReleaseEntry {
  version: string;
  sha256: string;
  approvedOn?: string;
}

/** Tags listed in the approved-releases manifest with their SHA-256 and approval date. Throws ParseError when malformed. */
export function parseApprovedReleases(json: unknown, prefix: string): Map<string, ApprovedReleaseEntry> {
  const root = json as { schemaVersion?: unknown; releases?: unknown };
  if (typeof root !== 'object' || root === null || root.schemaVersion !== 1 || !Array.isArray(root.releases)) throw new ParseError(`${APPROVED_RELEASES_PATH} must have schemaVersion 1 and a "releases" list`);
  const out = new Map<string, ApprovedReleaseEntry>();
  for (const r of root.releases as Record<string, unknown>[]) {
    const version = r?.version, tag = r?.tag, sha = r?.sha256;
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || tag !== `${prefix}${version}` || typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) {
      throw new ParseError(`${APPROVED_RELEASES_PATH} contains an invalid release entry`);
    }
    out.set(tag, { version, sha256: sha, approvedOn: typeof r.approvedOn === 'string' ? r.approvedOn : undefined });
  }
  return out;
}

const RECIPE_STATES = ['draft', 'locally-verified', 'approved', 'needs-revision'];

export function parseRecipeSummary(json: unknown, path: string): RecipeSummary {
  const r = json as Record<string, unknown>;
  if (typeof r !== 'object' || r === null || r.schemaVersion !== 1) throw new ParseError(`${path}: unsupported recipe`);
  const id = r.id, version = r.version;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(id) || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new ParseError(`${path}: recipe needs id and version`);
  const steps = Array.isArray(r.steps) ? (r.steps as Record<string, unknown>[]) : [];
  const status = typeof r.status === 'string' && RECIPE_STATES.includes(r.status) ? r.status : 'unknown';
  return {
    id,
    version,
    title: typeof r.title === 'string' ? r.title.slice(0, 120) : id,
    // "approved" without an approval record is not shown as approved.
    status: status === 'approved' && (typeof r.approval !== 'object' || r.approval === null) ? 'needs-revision' : status,
    package: typeof r.package === 'string' ? r.package : 'unknown',
    privileges: r.privileges === 'admin' ? 'admin' : 'user',
    steps: steps.length,
    manualSteps: steps.filter((s) => s?.type === 'manual').length,
    path
  };
}
