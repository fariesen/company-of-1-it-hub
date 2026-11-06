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
  standard?: { targetVersion?: string; category?: string; notes?: string };
}

export interface AgentRelease {
  version: string;
  tag: string;
  publishedAt: string | null;
  url: string;
}

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
  const sw = config.sources.software;
  if (sw?.catalog) {
    const entry = trees[sw.repository]!.tree.find((e) => e.type === 'blob' && e.path === sw.catalog);
    if (entry) {
      try {
        mergeCatalog(software, parseJson(await client.getBlobText(config.repositories[sw.repository]!, entry.sha, entry.path), entry.path), problems, entry.path);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        problems.push({ path: entry.path, message: e.message });
      }
    }
  }

  // Recent inventory changes (Git history is the change log). Failure here is not fatal.
  let recentChanges: CommitSummary[] = previousCommits ?? [];
  try {
    recentChanges = await client.getRecentCommits(invRepo, inv.path);
  } catch (e) {
    if (isAppError(e) && (e.kind === 'auth-expired' || e.kind === 'no-access')) throw e;
  }

  // Latest approved agent release: published, not draft, not prerelease, tag with configured prefix.
  let agentRelease: AgentRelease | undefined;
  const aw = config.agent?.windows;
  if (aw && config.features.agentStatus !== false) {
    try {
      const releases: Release[] = await client.getReleases(config.repositories[aw.repository]!);
      const approved = releases.filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(aw.releaseTagPrefix));
      const top = approved.sort((a, z) => compareVersions(z.tag_name.slice(aw.releaseTagPrefix.length), a.tag_name.slice(aw.releaseTagPrefix.length)))[0];
      if (top) agentRelease = { version: top.tag_name.slice(aw.releaseTagPrefix.length), tag: top.tag_name, publishedAt: top.published_at, url: top.html_url };
    } catch (e) {
      if (isAppError(e) && (e.kind === 'auth-expired')) throw e;
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

function mergeCatalog(software: SoftwareRecord[], json: unknown, problems: ContentProblem[], path: string): void {
  const root = json as { schemaVersion?: unknown; packages?: unknown };
  if (typeof root !== 'object' || root === null || root.schemaVersion !== 1 || !Array.isArray(root.packages)) {
    problems.push({ path, message: 'Software catalog must have schemaVersion 1 and a "packages" list.' });
    return;
  }
  for (const p of root.packages as Record<string, unknown>[]) {
    if (typeof p?.name !== 'string') continue;
    const standard = {
      targetVersion: typeof p.targetVersion === 'string' ? p.targetVersion : undefined,
      category: typeof p.category === 'string' ? p.category : undefined,
      notes: typeof p.notes === 'string' ? p.notes : undefined
    };
    const hit = software.find((s) => s.name.toLowerCase() === (p.name as string).toLowerCase());
    if (hit) hit.standard = standard;
    else software.push({ name: p.name, publisher: typeof p.publisher === 'string' ? p.publisher : undefined, versions: [], deviceIds: [], standard });
  }
  software.sort((a, z) => a.name.localeCompare(z.name));
}
