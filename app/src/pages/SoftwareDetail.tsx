import { AlertTriangle, ArrowLeft, BookOpen, Boxes, ExternalLink, History, Lightbulb, ListChecks, MonitorDown, Package, Play, ShieldCheck, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DocView } from '../components/DocView';
import { Badge, Callout, CodeBlock, Empty, formatDate, PageHead, Value } from '../components/ui';
import { installUrl, runRecipeCommand, type RunMode } from '../lib/agentLinks';
import { checkVersion, matchCatalogPackage, type CatalogPackage, type VersionCheck } from '../lib/catalog';
import type { HubData } from '../lib/content';
import { LEARNING_TYPES, type Learning } from '../lib/guides';
import type { Recipe, RecipeState } from '../lib/recipes';
import { useHubData } from '../state';

const stateTone: Record<RecipeState, string> = { approved: 'ok', 'locally-verified': 'info', draft: 'warn', 'needs-revision': 'bad', unknown: '' };
const checkTone: Record<VersionCheck, string> = { ok: 'ok', differs: 'warn', unknown: '', unmanaged: '' };
const checkLabel: Record<VersionCheck, string> = { ok: 'matches policy', differs: 'differs from policy', unknown: 'version unknown', unmanaged: 'not version-managed' };

export interface InstalledOn {
  deviceId: string;
  deviceName: string;
  name: string;
  version?: string;
  check: VersionCheck;
}

/** Where a catalog package is installed, from the newest snapshot of each captured device. */
export function installedOn(data: Pick<HubData, 'devices' | 'catalog'>, pkg: CatalogPackage): { installed: InstalledOn[]; missing: string[] } {
  const installed: InstalledOn[] = [];
  const missing: string[] = [];
  for (const d of data.devices) {
    if (!d.snapshot) continue;
    const hits = d.snapshot.software.filter((s) => matchCatalogPackage(s.name, data.catalog)?.id === pkg.id);
    if (hits.length === 0) missing.push(d.id);
    for (const s of hits) installed.push({ deviceId: d.id, deviceName: d.name, name: s.name, version: s.version, check: checkVersion(s.version, pkg) });
  }
  return { installed, missing };
}

function PackageLinks({ ids, data }: { ids: string[]; data: HubData }) {
  if (ids.length === 0) return <span className="unknown">none</span>;
  return (
    <span className="row" style={{ gap: 4 }}>
      {ids.map((id) => {
        const p = data.catalog.find((x) => x.id === id);
        return p ? (
          <Link key={id} className="chip" to={`/hub/software/${encodeURIComponent(id)}`}>
            {p.name}
          </Link>
        ) : (
          <span key={id} className="chip">
            {id}
          </span>
        );
      })}
    </span>
  );
}

function AgentTrigger({ recipe, pkgId }: { recipe: Recipe; pkgId: string }) {
  const approved = recipe.state === 'approved';
  let links: Record<RunMode, string>;
  try {
    links = { step: installUrl(pkgId, recipe.id, recipe.version, 'step'), auto: installUrl(pkgId, recipe.id, recipe.version, 'auto') };
  } catch {
    return <Callout tone="warn">This recipe cannot be handed to the agent: its id or version is not valid.</Callout>;
  }
  const modes: { mode: RunMode; label: string; enabled: boolean }[] = [
    { mode: 'step', label: 'Step by step', enabled: true },
    { mode: 'auto', label: 'Automatic', enabled: approved }
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        <Play size={15} aria-hidden="true" /> Install with the local agent
      </h3>
      <p className="subtle" style={{ marginTop: 0 }}>
        The link only opens the Windows agent on this computer (if its optional <span className="mono">ithub://</span> handler was registered with{' '}
        <span className="mono">Install-ItHubAgent.ps1 -RegisterProtocol</span>). The agent loads this recipe itself from its verified approved-recipe cache, shows every command and asks you
        locally before anything runs. Nothing runs from this page. Recipe execution is currently disabled in the agent, so it only shows and simulates the steps.
      </p>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        {modes.map((m) =>
          m.enabled ? (
            <a key={m.mode} className="btn btn-sm" href={links[m.mode]}>
              <MonitorDown size={14} aria-hidden="true" /> {m.label} (open agent)
            </a>
          ) : (
            <span key={m.mode} className="btn btn-sm" aria-disabled="true" title="Automatic mode needs an approved recipe">
              {m.label}: needs an approved recipe
            </span>
          )
        )}
      </div>
      <p className="subtle" style={{ margin: '4px 0' }}>
        Or copy the command into Windows PowerShell:
      </p>
      <CodeBlock code={runRecipeCommand(recipe.id, recipe.version, 'step')} />
      {approved && <CodeBlock code={runRecipeCommand(recipe.id, recipe.version, 'auto')} />}
    </div>
  );
}

function RecipeCard({ recipe, data, pkgId }: { recipe: Recipe; data: HubData; pkgId: string }) {
  return (
    <section className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-head">
        <h2>
          <ListChecks size={17} aria-hidden="true" /> Recipe {recipe.title}
        </h2>
        <span className="row" style={{ gap: 6 }}>
          <Badge plain>v{recipe.version}</Badge>
          <Badge tone={stateTone[recipe.state]}>{recipe.state}</Badge>
          {recipe.privileges === 'admin' && <Badge tone="warn">admin</Badge>}
        </span>
      </div>
      {recipe.declaredStatus === 'approved' && recipe.state === 'needs-revision' && <Callout tone="warn">Marked approved, but has no approval record: shown as needs-revision.</Callout>}
      {recipe.description && <p>{recipe.description}</p>}
      <dl className="kv">
        <dt>Recipe ID</dt>
        <dd className="mono">{recipe.id}</dd>
        {recipe.supportedVersions && (
          <>
            <dt>Supported versions</dt>
            <dd>{recipe.supportedVersions}</dd>
          </>
        )}
        <dt>Idempotency</dt>
        <dd>
          <Value v={recipe.idempotency} />
        </dd>
        <dt>Rollback</dt>
        <dd>
          <Value v={recipe.rollback} />
        </dd>
        {recipe.dependencies.length > 0 && (
          <>
            <dt>Depends on</dt>
            <dd>
              <PackageLinks ids={recipe.dependencies} data={data} />
            </dd>
          </>
        )}
        {recipe.externalDependencies.length > 0 && (
          <>
            <dt>External</dt>
            <dd>{recipe.externalDependencies.join('; ')}</dd>
          </>
        )}
        {recipe.approval && (
          <>
            <dt>Approval</dt>
            <dd>
              {recipe.approval.approvedBy ?? 'unknown'} · {formatDate(recipe.approval.approvedOn)}
            </dd>
          </>
        )}
        <dt>File</dt>
        <dd className="mono">{recipe.path}</dd>
      </dl>
      {recipe.limitations.length > 0 && (
        <>
          <h3>Limitations</h3>
          <ul>
            {recipe.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}
      <h3>
        Steps ({recipe.steps.length}) <span className="subtle" style={{ fontWeight: 400 }}>- displayed for review; the IT Hub never runs commands</span>
      </h3>
      <ol className="step-list">
        {recipe.steps.map((s, i) => (
          <li key={s.id}>
            <div className="step-head">
              <strong>
                {i + 1}. {s.description}
              </strong>
              <Badge plain>{s.type}</Badge>
              {s.privileges === 'admin' && <Badge tone="warn">admin</Badge>}
              {s.skipIf && <span className="subtle">skipped if {s.skipIf}</span>}
              {s.requiresSignIn && <Badge tone="info">sign-in</Badge>}
              {s.destructive && <Badge tone="bad">destructive</Badge>}
            </div>
            {s.commandKind === 'instruction' ? <p style={{ margin: '4px 0' }}>{s.command}</p> : <CodeBlock code={s.command} />}
            {s.source && <div className="subtle">Source: {s.source}</div>}
          </li>
        ))}
      </ol>
      {recipe.troubleshooting.length > 0 && (
        <>
          <h3>
            <Wrench size={15} aria-hidden="true" /> Troubleshooting in this recipe
          </h3>
          <ul className="list">
            {recipe.troubleshooting.map((t, i) => (
              <li key={i} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="t">{t.symptom}</div>
                  {t.cause && <div className="s">Cause: {t.cause}</div>}
                  {t.fix && <div>Fix: {t.fix}</div>}
                  {t.failedCommand && <div className="s mono">Failed: {t.failedCommand}</div>}
                  {(t.observedBy || t.source) && <div className="s">{[t.observedBy, t.source].filter(Boolean).join(' · ')}</div>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {(recipe.history.length > 0 || recipe.archivedVersions.length > 0) && (
        <>
          <h3>
            <History size={15} aria-hidden="true" /> Recipe history
          </h3>
          <ul>
            {recipe.history.map((h, i) => (
              <li key={i}>
                <span className="mono">{h.version}</span>
                {h.date ? ` (${h.date})` : ''}: {h.change}
              </li>
            ))}
          </ul>
          {recipe.archivedVersions.length > 0 && <p className="subtle">Archived versions: {recipe.archivedVersions.join(', ')}</p>}
        </>
      )}
      <AgentTrigger recipe={recipe} pkgId={pkgId} />
    </section>
  );
}

function LearningItem({ l, byId }: { l: Learning; byId: Map<string, Learning> }) {
  return (
    <li className="list-item" style={{ alignItems: 'flex-start' }}>
      <Badge tone={l.type === 'error' || l.type === 'execution-error' ? 'bad' : l.type === 'resolution' ? 'ok' : ''}>{l.type}</Badge>
      <div className="grow">
        <div className="t">
          {l.title} <Badge tone={l.status === 'accepted' ? 'ok' : l.status === 'rejected' ? '' : 'warn'} plain>{l.status}</Badge>
        </div>
        {l.text && <div>{l.text}</div>}
        {l.resolves && byId.get(l.resolves) && <div className="s">Resolves: {byId.get(l.resolves)!.title}</div>}
        <div className="s">
          {[l.observedBy, l.device, l.recordedAt ? formatDate(l.recordedAt) : undefined, `session ${l.session} ${l.event}`, l.recipe ? `recipe ${l.recipe}` : undefined, l.agentVersion ? `agent ${l.agentVersion}` : undefined]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </li>
  );
}

export function SoftwareDetail() {
  const { id = '' } = useParams();
  const data = useHubData();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const pkg = data.catalog.find((p) => p.id === id);
  const usage = useMemo(() => (pkg ? installedOn(data, pkg) : { installed: [], missing: [] }), [data, pkg]);

  if (!pkg) {
    return (
      <div className="card">
        <Empty icon={Package} title={`Software ${id} not found`}>
          <p>No catalog package with this ID.</p>
          <Link className="btn" to="/hub/software">
            All software
          </Link>
        </Empty>
      </div>
    );
  }

  const entry = data.guides[pkg.id];
  const guide = entry?.guide;
  const recipes = data.recipeDetails.filter((r) => r.package === pkg.id || pkg.recipes.includes(r.id));
  const learnings = guide?.learnings ?? [];
  const byId = new Map(learnings.map((l) => [l.id, l]));
  const shownLearnings = learnings.filter((l) => (!type || l.type === type) && (!status || l.status === status));
  const parent = pkg.parent ? data.catalog.find((p) => p.id === pkg.parent) : undefined;
  const children = data.catalog.filter((p) => p.parent === pkg.id);
  const vp = pkg.versionPolicy;

  return (
    <>
      <Link to="/hub/software" className="subtle row" style={{ gap: 4, marginBottom: 12 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Software
      </Link>
      <PageHead
        title={pkg.name}
        description={
          <span className="row" style={{ gap: 6 }}>
            <Badge plain>{pkg.id}</Badge>
            {pkg.kind && <Badge plain>{pkg.kind}</Badge>}
            {pkg.category && <Badge plain>{pkg.category}</Badge>}
            {pkg.status && <Badge tone={pkg.status === 'approved' ? 'ok' : 'warn'}>{pkg.status}</Badge>}
            {pkg.baseline && <Badge tone="ok">Baseline</Badge>}
            {pkg.preferred && <Badge tone="ok">Preferred</Badge>}
            {pkg.tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </span>
        }
      />

      <div className="grid grid-2">
        <section className="card">
          <h2>
            <Package size={17} aria-hidden="true" /> Catalog
          </h2>
          <dl className="kv">
            <dt>Publisher</dt>
            <dd>
              <Value v={pkg.publisher} />
            </dd>
            <dt>Version policy</dt>
            <dd>
              {vp ? `${vp.mode}${vp.version ? ' ' + vp.version : ''}` : <span className="unknown">unknown</span>}
              {vp?.reason && <span className="observed">{vp.reason}</span>}
            </dd>
            <dt>Install method</dt>
            <dd>
              {pkg.install?.method ? (
                <>
                  {pkg.install.method}
                  {pkg.install.packageId && <span className="mono"> {pkg.install.packageId}</span>}
                  {pkg.install.notes && <span className="observed">{pkg.install.notes}</span>}
                </>
              ) : (
                <span className="unknown">unknown</span>
              )}
            </dd>
            {parent && (
              <>
                <dt>Part of</dt>
                <dd>
                  <PackageLinks ids={[parent.id]} data={data} />
                </dd>
              </>
            )}
            {children.length > 0 && (
              <>
                <dt>Add-ons</dt>
                <dd>
                  <PackageLinks ids={children.map((c) => c.id)} data={data} />
                </dd>
              </>
            )}
            <dt>Depends on</dt>
            <dd>
              <PackageLinks ids={pkg.dependencies} data={data} />
            </dd>
            <dt>Alternatives</dt>
            <dd>
              <PackageLinks ids={pkg.alternatives} data={data} />
            </dd>
            <dt>Related</dt>
            <dd>
              <PackageLinks ids={pkg.related} data={data} />
            </dd>
            <dt>Sources</dt>
            <dd>{pkg.sources.length ? <span className="mono">{pkg.sources.join(', ')}</span> : <span className="unknown">none</span>}</dd>
          </dl>
          {pkg.notes && <p style={{ marginTop: 12 }}>{pkg.notes}</p>}
          {(pkg.documentation.length > 0 || pkg.downloadUrl) && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              {pkg.documentation.map((u) => (
                <a key={u} className="btn btn-sm" href={u} target="_blank" rel="noopener noreferrer">
                  Documentation <ExternalLink size={13} aria-hidden="true" />
                </a>
              ))}
              {pkg.downloadUrl && (
                <a className="btn btn-sm" href={pkg.downloadUrl} target="_blank" rel="noopener noreferrer">
                  Vendor download <ExternalLink size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>
            <Boxes size={17} aria-hidden="true" /> Devices
          </h2>
          {usage.installed.length === 0 ? (
            <p className="subtle">Not found on any captured device.</p>
          ) : (
            <ul className="list">
              {usage.installed.map((u, i) => (
                <li key={`${u.deviceId}-${i}`}>
                  <Link className="list-item" to={`/hub/devices/${encodeURIComponent(u.deviceId)}`}>
                    <div className="grow">
                      <div className="t">
                        {u.deviceId} · {u.deviceName}
                      </div>
                      <div className="s">
                        {u.name} <span className="mono">{u.version ?? 'unknown'}</span>
                      </div>
                    </div>
                    <Badge tone={checkTone[u.check]} plain>
                      {checkLabel[u.check]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {usage.missing.length > 0 && (
            <p className="subtle" style={{ marginTop: 10 }}>
              Not installed on: {usage.missing.join(', ')}
            </p>
          )}
          {pkg.targetVersion && <p className="subtle">Target version: {pkg.targetVersion}</p>}
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>
            <BookOpen size={17} aria-hidden="true" /> Prerequisites and installation guide
          </h2>
          {!entry ? (
            <Empty icon={Lightbulb} title="No central knowledge yet">
              Knowledge for this package lives in <span className="mono">software/guides/{pkg.id}/</span> (README.md and guide.json). Learnings arrive there through reviewed pull
              requests from the Windows agent.
            </Empty>
          ) : (
            <>
              {guide && guide.prerequisites.length > 0 && (
                <>
                  <h3 style={{ marginTop: 0 }}>Prerequisites</h3>
                  <ul>
                    {guide.prerequisites.map((p, i) => (
                      <li key={i}>
                        {p.text}
                        {p.package && (
                          <>
                            {' '}
                            <PackageLinks ids={[p.package]} data={data} />
                          </>
                        )}
                        {p.source && <span className="subtle"> ({p.source})</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {entry.readme ? <DocView data={data} doc={entry.readme} /> : <p className="subtle">No readable guide (README.md) yet.</p>}
            </>
          )}
        </section>

        {guide && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>
              <AlertTriangle size={17} aria-hidden="true" /> Known issues and solutions ({guide.knownIssues.length})
            </h2>
            {guide.knownIssues.length === 0 ? (
              <p className="subtle">No known issues recorded.</p>
            ) : (
              <ul className="list">
                {guide.knownIssues.map((k) => (
                  <li key={k.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <Badge tone={k.status === 'resolved' ? 'ok' : k.status === 'workaround' ? 'info' : 'warn'}>{k.status}</Badge>
                    <div className="grow">
                      <div className="t">{k.symptom}</div>
                      {k.cause && <div className="s">Cause: {k.cause}</div>}
                      {k.resolution && (
                        <div>
                          <ShieldCheck size={13} aria-hidden="true" /> {k.resolution}
                        </div>
                      )}
                      <div className="s">
                        {[k.reviewStatus, k.firstSeen ? `first seen ${k.firstSeen}` : undefined, k.devices.length ? k.devices.join(', ') : undefined].filter(Boolean).join(' · ')}
                      </div>
                      {k.learnings.length > 0 && <div className="s">From learnings: {k.learnings.map((lid) => byId.get(lid)?.title ?? lid).join('; ')}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {guide && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>
              <Lightbulb size={17} aria-hidden="true" /> Learnings ({learnings.length})
            </h2>
            <p className="subtle" style={{ marginTop: 0 }}>
              Collected from learning sessions and agent runs. <strong>proposed</strong> items are not reviewed yet.
            </p>
            <div className="row" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="Filter learnings by type">
              {['', ...LEARNING_TYPES.filter((t) => learnings.some((l) => l.type === t))].map((t) => (
                <button key={t || 'all'} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
                  {t || 'All types'}
                </button>
              ))}
              {['', 'proposed', 'accepted', 'rejected'].map((s) => (
                <button key={`s-${s || 'all'}`} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s || 'Any status'}
                </button>
              ))}
            </div>
            {shownLearnings.length === 0 ? (
              <p className="subtle">No matching learnings.</p>
            ) : (
              <ul className="list">
                {shownLearnings.map((l) => (
                  <LearningItem key={l.id} l={l} byId={byId} />
                ))}
              </ul>
            )}
          </section>
        )}

        {guide && guide.history.length > 0 && (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>
              <History size={17} aria-hidden="true" /> Change history
            </h2>
            <ul>
              {guide.history.map((h, i) => (
                <li key={i}>
                  {h.date}: {h.change}
                  {h.source && <span className="subtle"> ({h.source})</span>}
                </li>
              ))}
            </ul>
            <p className="subtle">Updated {guide.updated}. Git history of software/guides/{pkg.id}/ is the full change log.</p>
          </section>
        )}

        {recipes.length === 0 ? (
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>
              <ListChecks size={17} aria-hidden="true" /> Installation recipes
            </h2>
            <p className="subtle">No setup recipe for this package yet. A learning session with the Windows agent can create the first draft.</p>
          </section>
        ) : (
          recipes.map((r) => <RecipeCard key={r.id} recipe={r} data={data} pkgId={pkg.id} />)
        )}
      </div>
    </>
  );
}
