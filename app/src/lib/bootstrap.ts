/**
 * Two-stage bootstrap.
 *
 * Stage 1 (public): config/bootstrap.json ships with the PWA and only *locates* the private
 * configuration. Stage 2 (private): config/it-hub.json is read from the private repository with the
 * signed-in user's own credentials and describes where inventory and documentation live.
 *
 * Neither stage grants access. Both are validated strictly: unknown keys are rejected, no field may
 * contain a URL, and every repository owner must be on the built-in allowlist.
 */
import { AppError } from './errors';
import { isSafeOwner, isSafeRef, isSafeRepoName, isSafeRepoPath } from './paths';
import { LIMITS, SUPPORTED_BOOTSTRAP_SCHEMAS, SUPPORTED_CONFIG_SCHEMAS, isAllowedOwner } from './policy';

export type AuthMethod = 'fine-grained-token' | 'github-app';

export interface PublicBootstrap {
  schemaVersion: 1;
  bootstrap: { provider: 'github'; owner: string; repository: string; ref: string; path: string };
  auth: {
    methods: AuthMethod[];
    githubApp?: { clientId: string; brokerUrl: string; redirectUri: string };
  };
}

export interface RepositoryRef {
  owner: string;
  name: string;
  ref: string;
}

export interface SourceRef {
  repository: string;
  path: string;
  catalog?: string;
}

export interface DocumentationSource {
  id: string;
  title: string;
  repository: string;
  path: string;
}

export interface PrivateConfig {
  schemaVersion: 1;
  application: { name: string; configVersion?: string };
  repositories: Record<string, RepositoryRef>;
  sources: {
    inventory: SourceRef;
    software?: SourceRef;
    infrastructure?: SourceRef;
    setup?: SourceRef;
    documentation: DocumentationSource[];
  };
  contentSchemas: { device: number[]; snapshot: number[] };
  agent?: { windows?: { repository: string; releaseTagPrefix: string; installDoc?: string } };
  features: Record<string, boolean>;
  refresh: { minIntervalSeconds: number; onFocus: boolean };
}

type Obj = Record<string, unknown>;

function fail(where: string, message: string): never {
  throw new AppError('invalid-config', `Invalid configuration: ${message}`, { detail: where });
}

function obj(value: unknown, where: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, `${where} must be an object`);
  return value as Obj;
}

function onlyKeys(o: Obj, allowed: string[], where: string): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(where, `unknown field "${where}.${k}"`);
}

function str(value: unknown, where: string, max = 200): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(where, `${where} must be a non-empty string`);
  return value;
}

function schemaVersion(value: unknown, supported: readonly number[], what: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail('schemaVersion', `${what} schemaVersion is missing`);
  if (!supported.includes(value)) {
    throw new AppError(
      'unsupported-schema',
      `${what} uses schema version ${value}, but this app supports ${supported.join(', ')}. Update the IT Hub or the configuration.`,
      { detail: 'schemaVersion' }
    );
  }
}

const KEY = /^[a-z][a-z0-9-]{0,39}$/;

export function parsePublicBootstrap(input: unknown): PublicBootstrap {
  const root = obj(input, 'bootstrap.json');
  schemaVersion(root.schemaVersion, SUPPORTED_BOOTSTRAP_SCHEMAS, 'The public bootstrap file');
  onlyKeys(root, ['$schema', 'schemaVersion', 'bootstrap', 'auth'], 'bootstrap.json');

  const b = obj(root.bootstrap, 'bootstrap');
  onlyKeys(b, ['provider', 'owner', 'repository', 'ref', 'path'], 'bootstrap');
  if (b.provider !== 'github') fail('bootstrap.provider', 'bootstrap.provider must be "github"');
  if (!isSafeOwner(b.owner)) fail('bootstrap.owner', 'bootstrap.owner is not a valid GitHub account name');
  if (!isAllowedOwner(b.owner)) fail('bootstrap.owner', `owner "${b.owner}" is not on the app's allowlist`);
  if (!isSafeRepoName(b.repository)) fail('bootstrap.repository', 'bootstrap.repository is not a valid repository name');
  if (!isSafeRef(b.ref)) fail('bootstrap.ref', 'bootstrap.ref is not a valid branch or tag name');
  if (!isSafeRepoPath(b.path) || !b.path.endsWith('.json')) fail('bootstrap.path', 'bootstrap.path must be a relative .json path');

  const a = obj(root.auth ?? { methods: ['fine-grained-token'] }, 'auth');
  onlyKeys(a, ['methods', 'githubApp'], 'auth');
  if (!Array.isArray(a.methods) || a.methods.length === 0) fail('auth.methods', 'auth.methods must list at least one method');
  const methods = a.methods.map((m, i) => {
    if (m !== 'fine-grained-token' && m !== 'github-app') fail(`auth.methods[${i}]`, `unknown auth method "${String(m)}"`);
    return m as AuthMethod;
  });

  let githubApp: PublicBootstrap['auth']['githubApp'];
  if (methods.includes('github-app')) {
    const g = obj(a.githubApp, 'auth.githubApp');
    onlyKeys(g, ['clientId', 'brokerUrl', 'redirectUri'], 'auth.githubApp');
    const clientId = str(g.clientId, 'auth.githubApp.clientId', 40);
    if (!/^(Iv[0-9a-z.]+|[A-Za-z0-9]{20})$/.test(clientId)) fail('auth.githubApp.clientId', 'clientId has an unexpected format');
    const brokerUrl = httpsUrl(g.brokerUrl, 'auth.githubApp.brokerUrl');
    const redirectUri = httpsUrl(g.redirectUri, 'auth.githubApp.redirectUri');
    githubApp = { clientId, brokerUrl, redirectUri };
  }

  return {
    schemaVersion: 1,
    bootstrap: { provider: 'github', owner: b.owner, repository: b.repository, ref: b.ref, path: b.path },
    auth: { methods, githubApp }
  };
}

function httpsUrl(value: unknown, where: string): string {
  const s = str(value, where, 300);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    fail(where, `${where} is not a valid URL`);
  }
  if (u.protocol !== 'https:' || u.username || u.password) fail(where, `${where} must be a plain https URL`);
  return u.href;
}

function source(value: unknown, where: string, repos: Record<string, RepositoryRef>, withCatalog = false): SourceRef {
  const s = obj(value, where);
  onlyKeys(s, withCatalog ? ['repository', 'path', 'catalog'] : ['repository', 'path'], where);
  const repository = str(s.repository, `${where}.repository`, 40);
  if (!repos[repository]) fail(`${where}.repository`, `${where} refers to unknown repository key "${repository}"`);
  if (!isSafeRepoPath(s.path)) fail(`${where}.path`, `${where}.path must be a relative path inside the repository`);
  const out: SourceRef = { repository, path: s.path };
  if (s.catalog !== undefined) {
    if (!isSafeRepoPath(s.catalog)) fail(`${where}.catalog`, `${where}.catalog must be a relative path`);
    out.catalog = s.catalog;
  }
  return out;
}

export function parsePrivateConfig(input: unknown): PrivateConfig {
  const root = obj(input, 'it-hub.json');
  schemaVersion(root.schemaVersion, SUPPORTED_CONFIG_SCHEMAS, 'The private IT Hub configuration');
  onlyKeys(root, ['$schema', 'schemaVersion', 'application', 'repositories', 'sources', 'contentSchemas', 'agent', 'features', 'refresh'], 'it-hub.json');

  const app = obj(root.application, 'application');
  onlyKeys(app, ['name', 'configVersion'], 'application');
  const application = { name: str(app.name, 'application.name', 80), configVersion: app.configVersion === undefined ? undefined : str(app.configVersion, 'application.configVersion', 40) };

  const reposIn = obj(root.repositories, 'repositories');
  const keys = Object.keys(reposIn);
  if (keys.length === 0) fail('repositories', 'at least one repository is required');
  if (keys.length > LIMITS.maxRepositories) fail('repositories', `at most ${LIMITS.maxRepositories} repositories are supported`);
  const repositories: Record<string, RepositoryRef> = {};
  for (const key of keys) {
    if (!KEY.test(key)) fail(`repositories.${key}`, `repository key "${key}" must be lowercase-kebab`);
    const r = obj(reposIn[key], `repositories.${key}`);
    onlyKeys(r, ['owner', 'name', 'ref'], `repositories.${key}`);
    if (!isSafeOwner(r.owner)) fail(`repositories.${key}.owner`, `repositories.${key}.owner is invalid`);
    if (!isAllowedOwner(r.owner)) fail(`repositories.${key}.owner`, `owner "${r.owner}" is not on the app's allowlist`);
    if (!isSafeRepoName(r.name)) fail(`repositories.${key}.name`, `repositories.${key}.name is invalid`);
    if (!isSafeRef(r.ref)) fail(`repositories.${key}.ref`, `repositories.${key}.ref is invalid`);
    repositories[key] = { owner: r.owner, name: r.name, ref: r.ref };
  }

  const s = obj(root.sources, 'sources');
  onlyKeys(s, ['inventory', 'software', 'infrastructure', 'setup', 'documentation'], 'sources');
  if (!Array.isArray(s.documentation)) fail('sources.documentation', 'sources.documentation must be a list');
  if (s.documentation.length > 30) fail('sources.documentation', 'too many documentation sections');
  const seen = new Set<string>();
  const documentation = s.documentation.map((d, i): DocumentationSource => {
    const where = `sources.documentation[${i}]`;
    const o = obj(d, where);
    onlyKeys(o, ['id', 'title', 'repository', 'path'], where);
    const id = str(o.id, `${where}.id`, 40);
    if (!KEY.test(id)) fail(`${where}.id`, `${where}.id must be lowercase-kebab`);
    if (seen.has(id)) fail(`${where}.id`, `duplicate documentation id "${id}"`);
    seen.add(id);
    const src = source({ repository: o.repository, path: o.path }, where, repositories);
    return { id, title: str(o.title, `${where}.title`, 60), ...src };
  });

  const sources: PrivateConfig['sources'] = {
    inventory: source(s.inventory, 'sources.inventory', repositories),
    documentation
  };
  if (s.software !== undefined) sources.software = source(s.software, 'sources.software', repositories, true);
  if (s.infrastructure !== undefined) sources.infrastructure = source(s.infrastructure, 'sources.infrastructure', repositories);
  if (s.setup !== undefined) sources.setup = source(s.setup, 'sources.setup', repositories);

  const cs = root.contentSchemas === undefined ? {} : obj(root.contentSchemas, 'contentSchemas');
  onlyKeys(cs, ['device', 'snapshot'], 'contentSchemas');
  const intList = (v: unknown, where: string): number[] => {
    if (v === undefined) return [1];
    if (!Array.isArray(v) || !v.every((n) => Number.isInteger(n))) fail(where, `${where} must be a list of integers`);
    return v as number[];
  };

  let agent: PrivateConfig['agent'];
  if (root.agent !== undefined) {
    const ag = obj(root.agent, 'agent');
    onlyKeys(ag, ['windows'], 'agent');
    if (ag.windows !== undefined) {
      const w = obj(ag.windows, 'agent.windows');
      onlyKeys(w, ['repository', 'releaseTagPrefix', 'installDoc'], 'agent.windows');
      const repository = str(w.repository, 'agent.windows.repository', 40);
      if (!repositories[repository]) fail('agent.windows.repository', `agent.windows refers to unknown repository key "${repository}"`);
      const prefix = str(w.releaseTagPrefix, 'agent.windows.releaseTagPrefix', 40);
      if (!/^[a-z0-9-]+$/.test(prefix)) fail('agent.windows.releaseTagPrefix', 'releaseTagPrefix must be lowercase-kebab');
      if (w.installDoc !== undefined && !isSafeRepoPath(w.installDoc)) fail('agent.windows.installDoc', 'installDoc must be a relative path');
      agent = { windows: { repository, releaseTagPrefix: prefix, installDoc: w.installDoc as string | undefined } };
    }
  }

  const features: Record<string, boolean> = {};
  if (root.features !== undefined) {
    const f = obj(root.features, 'features');
    for (const [k, v] of Object.entries(f)) {
      if (typeof v !== 'boolean') fail(`features.${k}`, `features.${k} must be true or false`);
      features[k] = v;
    }
  }

  const r = root.refresh === undefined ? {} : obj(root.refresh, 'refresh');
  onlyKeys(r, ['minIntervalSeconds', 'onFocus'], 'refresh');
  const minIntervalSeconds = r.minIntervalSeconds === undefined ? 60 : Number(r.minIntervalSeconds);
  if (!Number.isInteger(minIntervalSeconds) || minIntervalSeconds < 15 || minIntervalSeconds > 86400) fail('refresh.minIntervalSeconds', 'refresh.minIntervalSeconds must be 15-86400');
  if (r.onFocus !== undefined && typeof r.onFocus !== 'boolean') fail('refresh.onFocus', 'refresh.onFocus must be true or false');

  return {
    schemaVersion: 1,
    application,
    repositories,
    sources,
    contentSchemas: { device: intList(cs.device, 'contentSchemas.device'), snapshot: intList(cs.snapshot, 'contentSchemas.snapshot') },
    agent,
    features,
    refresh: { minIntervalSeconds, onFocus: r.onFocus !== false }
  };
}

/** Loads the public locator that ships with the app (same origin, no credentials). */
export async function loadPublicBootstrap(fetchImpl: typeof fetch = fetch): Promise<PublicBootstrap> {
  let res: Response;
  try {
    res = await fetchImpl('./config/bootstrap.json', { cache: 'no-cache', credentials: 'omit' });
  } catch {
    throw new AppError('network', 'Could not load the app configuration. Check your connection.');
  }
  if (!res.ok) throw new AppError('invalid-config', `The public bootstrap file could not be loaded (HTTP ${res.status}).`, { detail: 'config/bootstrap.json' });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AppError('invalid-config', 'The public bootstrap file is not valid JSON.', { detail: 'config/bootstrap.json' });
  }
  return parsePublicBootstrap(json);
}
