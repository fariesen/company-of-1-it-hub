/**
 * Central knowledge of one catalog package: software/guides/<id>/guide.json (schema
 * schemas/software-guide.schema.json in the private repository) plus the readable guide README.md.
 * Learnings arrive through reviewed pull requests from the Windows agent; the IT Hub only shows them.
 * Parsing is defensive: invalid items are dropped and reported, extra keys are tolerated.
 */
import { ParseError } from './inventory';
import { PACKAGE_ID } from './catalog';

export const LEARNING_TYPES = ['error', 'resolution', 'note', 'manual-step', 'correction', 'execution-error', 'execution-result'] as const;
export type LearningType = (typeof LEARNING_TYPES)[number];
export type ReviewStatus = 'proposed' | 'accepted' | 'rejected';

export interface Learning {
  id: string;
  type: LearningType;
  title: string;
  text?: string;
  outcome?: string;
  resolves?: string;
  corrects?: string;
  session: string;
  event: string;
  recipe?: string;
  device?: string;
  recordedAt?: string;
  agentVersion?: string;
  observedBy: 'user-reported' | 'agent-observed';
  status: ReviewStatus;
}

export interface KnownIssue {
  id: string;
  symptom: string;
  cause?: string;
  resolution?: string;
  status: 'open' | 'workaround' | 'resolved';
  learnings: string[];
  firstSeen?: string;
  devices: string[];
  reviewStatus?: ReviewStatus;
}

export interface Guide {
  package: string;
  updated: string;
  prerequisites: { text: string; package?: string; source?: string }[];
  knownIssues: KnownIssue[];
  learnings: Learning[];
  history: { date: string; change: string; source?: string }[];
  /** Items dropped because they did not match the schema. */
  skipped: number;
  path: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LR = /^lr-[0-9a-f]{12}$/;
const KI = /^ki-[0-9a-f]{12}$/;
const SESSION = /^(ls|run)-[0-9]{8}T[0-9]{6}Z-[a-z0-9]{4}$/;
const DEVICE = /^(AIC|UC)-\d{3}$|^unregistered$/;
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | undefined => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : undefined);

export function parseGuide(json: unknown, path: string, expectedPackage: string): Guide {
  if (!isObj(json) || json.schemaVersion !== 1) throw new ParseError(`${path}: guide needs schemaVersion 1`);
  if (json.package !== expectedPackage || !PACKAGE_ID.test(expectedPackage)) throw new ParseError(`${path}: "package" must be "${expectedPackage}" (the folder name)`);
  let skipped = 0;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);

  const prerequisites: Guide['prerequisites'] = [];
  for (const p of list(json.prerequisites, 50)) {
    const text = isObj(p) ? str(p.text, 500) : undefined;
    if (!text) {
      skipped++;
      continue;
    }
    prerequisites.push({ text, package: isObj(p) && typeof p.package === 'string' && PACKAGE_ID.test(p.package) ? p.package : undefined, source: isObj(p) ? str(p.source, 200) : undefined });
  }

  const learnings: Learning[] = [];
  const ids = new Set<string>();
  for (const l of list(json.learnings, 5000)) {
    if (!isObj(l)) {
      skipped++;
      continue;
    }
    const type = oneOf(l.type, LEARNING_TYPES);
    const title = str(l.title, 200);
    const observedBy = oneOf(l.observedBy, ['user-reported', 'agent-observed'] as const);
    const status = oneOf(l.status, ['proposed', 'accepted', 'rejected'] as const);
    if (typeof l.id !== 'string' || !LR.test(l.id) || ids.has(l.id) || !type || !title || typeof l.session !== 'string' || !SESSION.test(l.session) || typeof l.event !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(l.event) || !observedBy || !status) {
      skipped++;
      continue;
    }
    ids.add(l.id);
    learnings.push({
      id: l.id,
      type,
      title,
      text: str(l.text, 2000),
      outcome: oneOf(l.outcome, ['succeeded', 'failed', 'unknown'] as const),
      resolves: typeof l.resolves === 'string' && LR.test(l.resolves) ? l.resolves : undefined,
      corrects: typeof l.corrects === 'string' && LR.test(l.corrects) ? l.corrects : undefined,
      session: l.session,
      event: l.event,
      recipe: typeof l.recipe === 'string' && PACKAGE_ID.test(l.recipe) ? l.recipe : undefined,
      device: typeof l.device === 'string' && DEVICE.test(l.device) ? l.device : undefined,
      recordedAt: str(l.recordedAt, 25),
      agentVersion: typeof l.agentVersion === 'string' && /^\d+\.\d+\.\d+$/.test(l.agentVersion) ? l.agentVersion : undefined,
      observedBy,
      status
    });
  }

  const knownIssues: KnownIssue[] = [];
  for (const k of list(json.knownIssues, 500)) {
    const status = isObj(k) ? oneOf(k.status, ['open', 'workaround', 'resolved'] as const) : undefined;
    const symptom = isObj(k) ? str(k.symptom, 1000) : undefined;
    if (!isObj(k) || typeof k.id !== 'string' || !KI.test(k.id) || !symptom || !status) {
      skipped++;
      continue;
    }
    knownIssues.push({
      id: k.id,
      symptom,
      cause: str(k.cause, 1000),
      resolution: str(k.resolution, 2000),
      status,
      learnings: (Array.isArray(k.learnings) ? k.learnings : []).filter((x): x is string => typeof x === 'string' && LR.test(x)).slice(0, 50),
      firstSeen: typeof k.firstSeen === 'string' && DATE.test(k.firstSeen) ? k.firstSeen : undefined,
      devices: (Array.isArray(k.devices) ? k.devices : []).filter((x): x is string => typeof x === 'string' && DEVICE.test(x)).slice(0, 100),
      reviewStatus: oneOf(k.reviewStatus, ['proposed', 'accepted', 'rejected'] as const)
    });
  }

  const history: Guide['history'] = [];
  for (const h of list(json.history, 1000)) {
    const change = isObj(h) ? str(h.change, 300) : undefined;
    if (!isObj(h) || typeof h.date !== 'string' || !DATE.test(h.date) || !change) {
      skipped++;
      continue;
    }
    history.push({ date: h.date, change, source: str(h.source, 200) });
  }
  history.sort((a, z) => z.date.localeCompare(a.date));

  return {
    package: expectedPackage,
    updated: typeof json.updated === 'string' && DATE.test(json.updated) ? json.updated : 'unknown',
    prerequisites,
    knownIssues,
    learnings,
    history,
    skipped,
    path
  };
}
