/**
 * Inventory model: human-maintained device.json records plus agent-maintained snapshots.
 * Parsing is defensive - a malformed record becomes a content problem, never a crash, and
 * missing values are shown as "unknown" rather than guessed.
 */
import { SUPPORTED_DEVICE_SCHEMAS, SUPPORTED_SNAPSHOT_SCHEMAS } from './policy';
import { isSafeRepoPath } from './paths';

export const UNKNOWN = 'unknown';
export type Unknownable<T> = T | typeof UNKNOWN;

export const LIFECYCLES = ['planned', 'ordered', 'active', 'maintenance', 'retired', 'disposed', 'unknown'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];
export const CATEGORIES = ['ai-computer', 'user-computer'] as const;
export type Category = (typeof CATEGORIES)[number];

export const categoryLabels: Record<Category, string> = { 'ai-computer': 'AI computer', 'user-computer': 'User computer' };

export interface DeclaredHardware {
  manufacturer: string;
  model: string;
  cpu: string;
  ramGB: Unknownable<number>;
  storage: string;
  gpu: string;
  os: string;
}

export interface DeviceRecord {
  id: string;
  aliases: string[];
  category: Category;
  name: string;
  hostname: string;
  role?: string;
  lifecycle: Lifecycle;
  assignedTo?: string;
  location?: string;
  setupProfile?: string;
  friendlyName?: string;
  displayLabel?: string;
  deviceClass?: string;
  /** Recommendation tags (suggestions only). */
  tags: string[];
  hardware: DeclaredHardware;
  agentEnabled: boolean;
  identityHash?: string;
  docs: string[];
  notes?: string;
  sources: { statement: string; source: string; date: string }[];
  updated: string;
}

export interface Snapshot {
  deviceId: string;
  collectedAt: string;
  agentVersion: string;
  hostname: string;
  manufacturer: string;
  model: string;
  os: { caption: string; version: string; build: string; displayVersion?: string; architecture?: string };
  cpu: { name: string; cores?: Unknownable<number>; logicalProcessors?: Unknownable<number> }[];
  memoryGB: Unknownable<number>;
  storage: { model: string; sizeGB?: Unknownable<number>; mediaType?: string; busType?: string }[];
  gpu: { name: string; driverVersion?: string; virtual?: boolean }[];
  network: { name: string; description?: string; mediaType?: string; linkSpeed?: string; status?: string }[];
  software: { name: string; version?: string; publisher?: string }[];
  diagnostics: { section: string; status: string; message?: string }[];
}

export interface Device extends DeviceRecord {
  repository: string;
  folder: string;
  recordPath: string;
  snapshot?: Snapshot;
  snapshotPath?: string;
  snapshotCount: number;
}

export interface ContentProblem {
  path: string;
  message: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const textOrUnknown = (v: unknown, max = 300): string => text(v, max) ?? UNKNOWN;
const numOrUnknown = (v: unknown): Unknownable<number> => (typeof v === 'number' && Number.isFinite(v) ? v : UNKNOWN);

export class ParseError extends Error {}

export function parseDeviceRecord(json: unknown, supported: readonly number[] = SUPPORTED_DEVICE_SCHEMAS): DeviceRecord {
  if (!isObj(json)) throw new ParseError('device.json must contain a JSON object');
  if (!supported.includes(json.schemaVersion as number)) throw new ParseError(`unsupported device schemaVersion ${String(json.schemaVersion)}`);
  const id = json.id;
  if (typeof id !== 'string' || !/^(AIC|UC)-\d{3}$/.test(id)) throw new ParseError('id must look like AIC-001 or UC-001');
  if (!CATEGORIES.includes(json.category as Category)) throw new ParseError(`unknown category "${String(json.category)}"`);
  if (!LIFECYCLES.includes(json.lifecycle as Lifecycle)) throw new ParseError(`unknown lifecycle "${String(json.lifecycle)}"`);
  const name = text(json.name, 120);
  if (!name) throw new ParseError('name is required');
  const hw = isObj(json.hardware) ? json.hardware : {};
  const agent = isObj(json.agent) ? json.agent : {};
  const sources = Array.isArray(json.sources)
    ? json.sources.filter(isObj).map((s) => ({ statement: textOrUnknown(s.statement), source: textOrUnknown(s.source), date: textOrUnknown(s.date, 10) }))
    : [];
  return {
    id,
    aliases: Array.isArray(json.aliases) ? json.aliases.filter((a): a is string => typeof a === 'string' && a.length > 0).slice(0, 20) : [],
    category: json.category as Category,
    name,
    hostname: textOrUnknown(json.hostname, 63),
    role: text(json.role),
    lifecycle: json.lifecycle as Lifecycle,
    assignedTo: text(json.assignedTo, 120),
    location: text(json.location, 120),
    setupProfile: text(json.setupProfile, 80),
    friendlyName: text(json.friendlyName, 60),
    displayLabel: text(json.displayLabel, 80),
    deviceClass: text(json.deviceClass, 41),
    tags: Array.isArray(json.tags) ? json.tags.filter((t): t is string => typeof t === 'string' && /^[a-z0-9][a-z0-9-]{0,30}$/.test(t)).slice(0, 20) : [],
    hardware: {
      manufacturer: textOrUnknown(hw.manufacturer),
      model: textOrUnknown(hw.model),
      cpu: textOrUnknown(hw.cpu),
      ramGB: numOrUnknown(hw.ramGB),
      storage: textOrUnknown(hw.storage),
      gpu: textOrUnknown(hw.gpu),
      os: textOrUnknown(hw.os)
    },
    agentEnabled: agent.enabled === true,
    identityHash: typeof agent.identityHash === 'string' ? agent.identityHash : undefined,
    docs: Array.isArray(json.docs) ? json.docs.filter(isSafeRepoPath) : [],
    notes: text(json.notes, 2000),
    sources,
    updated: textOrUnknown(json.updated, 10)
  };
}

export function parseSnapshot(json: unknown, supported: readonly number[] = SUPPORTED_SNAPSHOT_SCHEMAS): Snapshot {
  if (!isObj(json)) throw new ParseError('snapshot must contain a JSON object');
  if (!supported.includes(json.schemaVersion as number)) throw new ParseError(`unsupported snapshot schemaVersion ${String(json.schemaVersion)}`);
  const collectedAt = text(json.collectedAt, 40);
  if (!collectedAt || Number.isNaN(Date.parse(collectedAt))) throw new ParseError('collectedAt must be a timestamp');
  const agent = isObj(json.agent) ? json.agent : {};
  const identity = isObj(json.identity) ? json.identity : {};
  const os = isObj(json.os) ? json.os : {};
  const memory = isObj(json.memory) ? json.memory : {};
  const list = (v: unknown, max = 2000): Obj[] => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : []);
  return {
    deviceId: textOrUnknown(json.deviceId, 20),
    collectedAt,
    agentVersion: textOrUnknown(agent.version, 20),
    hostname: textOrUnknown(identity.hostname),
    manufacturer: textOrUnknown(identity.manufacturer),
    model: textOrUnknown(identity.model),
    os: { caption: textOrUnknown(os.caption), version: textOrUnknown(os.version), build: textOrUnknown(os.build), displayVersion: text(os.displayVersion), architecture: text(os.architecture) },
    cpu: list(json.cpu, 16).map((c) => ({ name: textOrUnknown(c.name), cores: numOrUnknown(c.cores), logicalProcessors: numOrUnknown(c.logicalProcessors) })),
    memoryGB: numOrUnknown(memory.totalGB),
    storage: list(json.storage, 32).map((s) => ({ model: textOrUnknown(s.model), sizeGB: numOrUnknown(s.sizeGB), mediaType: text(s.mediaType), busType: text(s.busType) })),
    gpu: list(json.gpu, 16).map((g) => ({ name: textOrUnknown(g.name), driverVersion: text(g.driverVersion), virtual: g.virtual === true })),
    network: list(json.network, 32).map((n) => ({ name: textOrUnknown(n.name), description: text(n.description), mediaType: text(n.mediaType), linkSpeed: text(n.linkSpeed), status: text(n.status) })),
    software: list(json.software).map((s) => ({ name: textOrUnknown(s.name), version: text(s.version), publisher: text(s.publisher) })),
    diagnostics: list(json.diagnostics, 50).map((d) => ({ section: textOrUnknown(d.section), status: textOrUnknown(d.status, 20), message: text(d.message) }))
  };
}

/** Values to show for a device: declared values, with the latest agent observation alongside. */
export function displayHardware(d: Device) {
  const s = d.snapshot;
  const physicalGpus = s?.gpu.filter((g) => !g.virtual).map((g) => g.name) ?? [];
  const totalStorage = s?.storage.reduce((sum, x) => sum + (typeof x.sizeGB === 'number' ? x.sizeGB : 0), 0) ?? 0;
  return {
    manufacturer: { declared: d.hardware.manufacturer, observed: s?.manufacturer },
    model: { declared: d.hardware.model, observed: s?.model },
    os: { declared: d.hardware.os, observed: s ? [s.os.caption, s.os.displayVersion, s.os.build !== UNKNOWN ? `build ${s.os.build}` : undefined].filter(Boolean).join(' ') : undefined },
    cpu: { declared: d.hardware.cpu, observed: s?.cpu.map((c) => c.name).join(', ') || undefined },
    ram: { declared: d.hardware.ramGB === UNKNOWN ? UNKNOWN : `${d.hardware.ramGB} GB`, observed: s ? (s.memoryGB === UNKNOWN ? UNKNOWN : `${s.memoryGB} GB`) : undefined },
    storage: { declared: d.hardware.storage, observed: s && s.storage.length ? s.storage.map((x) => `${x.model}${typeof x.sizeGB === 'number' ? ` (${x.sizeGB} GB)` : ''}`).join(', ') + (s.storage.length > 1 ? ` - ${Math.round(totalStorage)} GB total` : '') : undefined },
    gpu: { declared: d.hardware.gpu, observed: physicalGpus.length ? physicalGpus.join(', ') : undefined }
  };
}

/** Best-known value: verified observation if present, else the declared value. */
export function best(v: { declared: string; observed?: string }): string {
  return v.observed && v.observed !== UNKNOWN ? v.observed : v.declared;
}

export function lastInventoryUpdate(d: Device): string | undefined {
  return d.snapshot?.collectedAt ?? (d.updated !== UNKNOWN ? d.updated : undefined);
}

export function snapshotAgeDays(d: Device, now = Date.now()): number | undefined {
  if (!d.snapshot) return undefined;
  return Math.floor((now - Date.parse(d.snapshot.collectedAt)) / 86_400_000);
}
