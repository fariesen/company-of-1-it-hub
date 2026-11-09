import { Boxes, Download, KeyRound, MonitorDown, ShieldCheck, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Callout, CodeBlock, PageHead } from '../components/ui';
import { bootstrapScript, LEARNINGS_COMMAND, LEARNINGS_URL, registerCommand, releaseDownloadUrl, SYNC_COMMAND, SYNC_URL, verifyCommand, agentZipName } from '../lib/agentLinks';
import { useHubData } from '../state';

/** Setting up a new PC: sign in, download and install the agent, register, see the software. */
export function Onboarding() {
  const data = useHubData();
  const [friendlyName, setFriendlyName] = useState('');
  const aw = data.config.agent?.windows;
  const repo = aw ? data.config.repositories[aw.repository] : undefined;
  const rel = data.agentRelease;
  const name = /^[A-Za-z0-9 ._-]{1,60}$/.test(friendlyName) ? friendlyName : undefined;
  let download: { url: string; script: string } | undefined;
  if (repo && rel) {
    try {
      download = { url: releaseDownloadUrl(repo.owner, repo.name, rel.tag, rel.version), script: bootstrapScript({ owner: repo.owner, repo: repo.name, tag: rel.tag, version: rel.version, sha256: rel.sha256 }) };
    } catch {
      download = undefined;
    }
  }

  return (
    <>
      <PageHead title="Set up a new PC" description="From sign-in to the PC's installed software in the IT Hub. Git, GitHub CLI and Claude Code are not needed." />

      <ol className="step-list">
        <li className="card">
          <h2>
            <KeyRound size={17} aria-hidden="true" /> 1. Sign in
          </h2>
          <p>
            You are signed in as <strong>{data.user.login}</strong>. For now the IT Hub uses a fine-grained personal access token (read-only, limited to the IT repository). Sign-in
            through an own web service (GitHub App with a small token service) is planned and needs the owner's approval.
          </p>
        </li>

        <li className="card">
          <h2>
            <Download size={17} aria-hidden="true" /> 2. Download the Windows agent
          </h2>
          {!aw || !repo ? (
            <p className="subtle">The Windows agent is not configured.</p>
          ) : !rel || !download ? (
            <Callout tone="warn">
              <strong>No approved agent release yet.</strong> An agent can be downloaded here once a release is published and listed with its SHA-256 in{' '}
              <span className="mono">{data.agentApproval?.path ?? 'agent/windows/approved-releases.json'}</span>
              {data.agentApproval?.manifest === 'found' ? ` (${data.agentApproval.listed} listed)` : data.agentApproval?.manifest === 'invalid' ? ' (the list is invalid)' : ' (the list is missing)'}.
              No download or script is offered without an approved checksum.
            </Callout>
          ) : (
            <>
              <p>
                Approved release <Badge tone="ok">v{rel.version}</Badge> <span className="mono">{rel.tag}</span>
              </p>
              <p style={{ marginBottom: 6 }}>
                <strong>Option A - browser download.</strong> Works when this browser is signed in to github.com with access to the private repository:
              </p>
              <a className="btn btn-sm" href={download.url} rel="noopener noreferrer">
                <MonitorDown size={14} aria-hidden="true" /> Download {agentZipName(rel.version)}
              </a>
              <p style={{ marginBottom: 4 }}>Check the file before installing it. The SHA-256 must be exactly:</p>
              <CodeBlock code={rel.sha256} />
              <CodeBlock code={verifyCommand(rel.version)} />
              <p style={{ marginBottom: 6 }}>
                <strong>Option B - PowerShell bootstrap.</strong> Paste into Windows PowerShell. It asks for your token locally (hidden input, never stored), downloads the release,
                checks the SHA-256 above and starts the installer. The token is not part of this page or the script.
              </p>
              <CodeBlock code={download.script} label="Copy script" />
              <p className="subtle">
                Why no direct download button: GitHub serves release files from <span className="mono">release-assets.githubusercontent.com</span>, which sends no CORS header, so a
                browser app cannot fetch them. A normal link (option A) or the script (option B) is used instead.
              </p>
            </>
          )}
        </li>

        <li className="card">
          <h2>
            <ShieldCheck size={17} aria-hidden="true" /> 3. Install
          </h2>
          <p>
            The installer (part of option B, or <span className="mono">Install-ItHubAgent.ps1 -ZipPath &lt;zip&gt;</span> after option A) verifies the package again, installs it for the
            current user without administrator rights and creates <span className="mono">%LOCALAPPDATA%\ItHubAgent\ithub-agent.cmd</span>. Add{' '}
            <span className="mono">-RegisterProtocol</span> to let IT Hub links open the agent (optional; the agent always asks before it does anything).
          </p>
        </li>

        <li className="card">
          <h2>
            <UploadCloud size={17} aria-hidden="true" /> 4. Register this PC
          </h2>
          <p>
            The first run registers the PC with the next free ID and uploads its sanitized inventory after you confirm. The agent asks for a token locally when GitHub CLI is not
            installed. Later runs need only <span className="mono">-Sync</span>.
          </p>
          <label className="subtle" htmlFor="fn">
            Friendly name (optional, only used in the command below)
          </label>
          <input id="fn" className="input" style={{ maxWidth: 280, display: 'block', margin: '4px 0 8px' }} value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="GPU-WORKSTATION" />
          <CodeBlock code={registerCommand('ai-computer', name)} />
          <CodeBlock code={registerCommand('user-computer', name)} />
          <p style={{ marginBottom: 6 }}>Later runs, from this page or PowerShell:</p>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-sm" href={SYNC_URL}>
              <MonitorDown size={14} aria-hidden="true" /> Sync (open agent)
            </a>
            <a className="btn btn-sm" href={LEARNINGS_URL}>
              <MonitorDown size={14} aria-hidden="true" /> Collect learnings (open agent)
            </a>
          </div>
          <CodeBlock code={SYNC_COMMAND} />
          <CodeBlock code={LEARNINGS_COMMAND} />
          <p className="subtle">The links only open the local agent if its protocol handler is registered. The agent shows what it will upload and asks before anything is sent.</p>
        </li>

        <li className="card">
          <h2>
            <Boxes size={17} aria-hidden="true" /> 5. See the PC's software
          </h2>
          <p>
            After the sync is on the main branch, refresh the IT Hub. The PC appears under <Link to="/hub/devices">Devices</Link> with its installed software, matched against the{' '}
            <Link to="/hub/software">software catalog</Link>.
          </p>
        </li>
      </ol>
    </>
  );
}
