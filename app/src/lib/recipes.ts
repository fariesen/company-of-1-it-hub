/**
 * Full setup recipes (setup/recipes/<id>.json in the private repository) for display only.
 * The IT Hub never runs a recipe: commands are shown for review and copying, and an installation is
 * only ever started by the local Windows agent after local confirmation.
 */
import { ParseError } from './inventory';
import { PACKAGE_ID } from './catalog';

export const STEP_TYPES = ['check-command', 'check-software', 'winget-install', 'config-file', 'git-config', 'vscode-extension', 'mcp-config', 'env-var', 'powershell', 'manual', 'verify-command', 'verify-software'] as const;
export type StepType = (typeof STEP_TYPES)[number];
export type RecipeState = 'draft' | 'locally-verified' | 'approved' | 'needs-revision' | 'unknown';

export interface RecipeStep {
  id: string;
  type: StepType;
  description: string;
  privileges?: 'user' | 'admin';
  skipIf?: string;
  requiresSignIn?: boolean;
  destructive?: boolean;
  source?: string;
  /** What the step does, as a command or instruction text (display only). */
  command: string;
  /** 'command' = PowerShell/console text; 'instruction' = manual text; 'content' = file content. */
  commandKind: 'command' | 'instruction' | 'content';
}

export interface Recipe {
  id: string;
  version: string;
  package: string;
  title: string;
  description?: string;
  /** Status as written in the file. */
  declaredStatus: string;
  /** Effective state: "approved" without an approval record is shown as needs-revision. */
  state: RecipeState;
  approval?: { approvedOn?: string; approvedBy?: string; contentSha256?: string };
  privileges: 'user' | 'admin';
  supportedVersions?: string;
  idempotency?: string;
  rollback?: string;
  limitations: string[];
  notes?: string;
  externalDependencies: string[];
  dependencies: string[];
  troubleshooting: { symptom: string; cause?: string; fix?: string; failedCommand?: string; observedBy?: string; source?: string }[];
  history: { version: string; date?: string; change: string }[];
  steps: RecipeStep[];
  /** Earlier versions archived under setup/recipes/history/<id>/. */
  archivedVersions: string[];
  path: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const strList = (v: unknown, max = 40, len = 300): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.slice(0, len)).slice(0, max) : []);
const STATES: RecipeState[] = ['draft', 'locally-verified', 'approved', 'needs-revision'];
export const RECIPE_ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
export const VERSION = /^\d+\.\d+\.\d+$/;

/** Quotes a value for display in a PowerShell command line when it needs it. */
function q(v: string): string {
  return /^[A-Za-z0-9._:/@+=-]+$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`;
}

/** The command (or instruction) a step stands for, derived from its type. Display only. */
export function stepCommand(s: Obj): { command: string; commandKind: RecipeStep['commandKind'] } {
  const t = s.type as StepType;
  const args = strList(s.args, 20, 100).map(q).join(' ');
  const cmd = typeof s.command === 'string' ? s.command : '';
  switch (t) {
    case 'check-command':
    case 'verify-command':
      return { command: [cmd, args].filter(Boolean).join(' ') + (t === 'check-command' && s.minVersion ? `   # needs ${s.minVersion} or newer` : '') + (typeof s.expect === 'string' ? `   # expect: ${s.expect}` : ''), commandKind: 'command' };
    case 'winget-install':
      return {
        command: `winget install --id ${q(String(s.packageId ?? ''))} --exact${typeof s.version === 'string' ? ` --version ${q(s.version)}` : ''}${s.scope === 'machine' || s.scope === 'user' ? ` --scope ${s.scope}` : ''} --silent --accept-package-agreements --accept-source-agreements`,
        commandKind: 'command'
      };
    case 'git-config':
      return { command: `git config --global ${q(String(s.key ?? ''))} ${q(String(s.value ?? ''))}`, commandKind: 'command' };
    case 'vscode-extension':
      return { command: `code --install-extension ${q(String(s.extensionId ?? ''))}`, commandKind: 'command' };
    case 'env-var':
      return { command: `[Environment]::SetEnvironmentVariable(${q(String(s.name ?? ''))}, ${q(String(s.value ?? ''))}, 'User')`, commandKind: 'command' };
    case 'powershell':
      return { command: typeof s.script === 'string' ? s.script : '', commandKind: 'command' };
    case 'manual':
      return { command: typeof s.instructions === 'string' ? s.instructions : String(s.description ?? ''), commandKind: 'instruction' };
    case 'check-software':
    case 'verify-software':
      return { command: `Installed software matches ${typeof s.match === 'string' ? s.match : typeof s.packageId === 'string' ? s.packageId : '(unspecified)'}${typeof s.minVersion === 'string' ? `, version ${s.minVersion} or newer` : ''}   # checked by the agent's inventory`, commandKind: 'instruction' };
    case 'config-file':
    case 'mcp-config': {
      const where = t === 'mcp-config' ? `MCP server ${String(s.server ?? '?')} for ${String(s.client ?? '?')}` : `File ${String(s.path ?? s.template ?? '?')}`;
      return { command: `${where}\n${typeof s.content === 'string' ? s.content : '(content from template ' + String(s.template ?? '?') + ')'}`, commandKind: 'content' };
    }
    default:
      return { command: JSON.stringify(s), commandKind: 'content' };
  }
}

export function parseRecipe(json: unknown, path: string, archivedVersions: string[] = []): Recipe {
  if (!isObj(json) || json.schemaVersion !== 1) throw new ParseError(`${path}: unsupported recipe`);
  const { id, version } = json;
  if (typeof id !== 'string' || !RECIPE_ID.test(id) || typeof version !== 'string' || !VERSION.test(version)) throw new ParseError(`${path}: recipe needs id and version`);
  const declared = typeof json.status === 'string' ? json.status : 'unknown';
  const base: RecipeState = (STATES as string[]).includes(declared) ? (declared as RecipeState) : 'unknown';
  const approval = isObj(json.approval) ? { approvedOn: str(json.approval.approvedOn, 25), approvedBy: str(json.approval.approvedBy, 100), contentSha256: str(json.approval.contentSha256, 80) } : undefined;
  const steps: RecipeStep[] = [];
  for (const s of Array.isArray(json.steps) ? (json.steps as unknown[]).slice(0, 100) : []) {
    if (!isObj(s) || typeof s.id !== 'string' || !(STEP_TYPES as readonly string[]).includes(s.type as string)) continue;
    const { command, commandKind } = stepCommand(s);
    steps.push({
      id: s.id.slice(0, 41),
      type: s.type as StepType,
      description: str(s.description, 300) ?? s.id,
      privileges: s.privileges === 'admin' ? 'admin' : s.privileges === 'user' ? 'user' : undefined,
      skipIf: str(s.skipIf, 40),
      requiresSignIn: s.requiresSignIn === true || undefined,
      destructive: s.destructive === true || undefined,
      source: str(s.source, 100),
      command: command.slice(0, 4200),
      commandKind
    });
  }
  return {
    id,
    version,
    package: typeof json.package === 'string' && PACKAGE_ID.test(json.package) ? json.package : 'unknown',
    title: str(json.title, 120) ?? id,
    description: str(json.description, 1000),
    declaredStatus: declared,
    state: base === 'approved' && !approval ? 'needs-revision' : base,
    approval,
    privileges: json.privileges === 'admin' ? 'admin' : 'user',
    supportedVersions: str(json.supportedVersions, 200),
    idempotency: str(json.idempotency, 1000),
    rollback: str(json.rollback, 1000),
    limitations: strList(json.limitations, 20, 500),
    notes: str(json.notes, 1000),
    externalDependencies: strList(json.externalDependencies, 20, 200),
    dependencies: (Array.isArray(json.dependencies) ? json.dependencies : []).map((d) => (typeof d === 'string' ? d : isObj(d) && typeof d.package === 'string' ? d.package : '')).filter((d) => PACKAGE_ID.test(d)).slice(0, 20),
    troubleshooting: (Array.isArray(json.troubleshooting) ? json.troubleshooting : [])
      .filter(isObj)
      .filter((t) => typeof t.symptom === 'string')
      .slice(0, 100)
      .map((t) => ({ symptom: String(t.symptom).slice(0, 300), cause: str(t.cause, 300), fix: str(t.fix, 500), failedCommand: str(t.failedCommand, 500), observedBy: str(t.observedBy, 30), source: str(t.source, 120) })),
    history: (Array.isArray(json.history) ? json.history : [])
      .filter(isObj)
      .filter((h) => typeof h.change === 'string' && typeof h.version === 'string')
      .slice(0, 100)
      .map((h) => ({ version: String(h.version).slice(0, 20), date: str(h.date, 25), change: String(h.change).slice(0, 500) })),
    steps,
    archivedVersions: archivedVersions.filter((v) => VERSION.test(v)).sort(),
    path
  };
}
