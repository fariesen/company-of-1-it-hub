/**
 * Hand-offs from the IT Hub to the local Windows agent. The PWA never executes anything:
 * - ithub:// links open the locally installed agent (only if its optional protocol handler was
 *   registered by the installer). They carry ids only, never commands; the agent loads the recipe from
 *   its verified approved-recipe cache, shows every command and asks for local confirmation.
 * - Copy commands do the same from a PowerShell window.
 * - The bootstrap script downloads and verifies the agent without git, GitHub CLI or Claude Code.
 *   The token is read locally with Read-Host -AsSecureString and never appears in the page or script.
 */
import { PACKAGE_ID } from './catalog';
import { RECIPE_ID, VERSION } from './recipes';

export type RunMode = 'step' | 'auto';

export const AGENT_LAUNCHER = '& "$env:LOCALAPPDATA\\ItHubAgent\\ithub-agent.cmd"';
const TAG = /^[A-Za-z0-9._-]{1,80}$/;
const OWNER_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$|^[A-Za-z0-9._-]{1,100}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class LinkError extends Error {}

function need(ok: boolean, what: string): void {
  if (!ok) throw new LinkError(`Refused to build an agent link: invalid ${what}.`);
}

export function installUrl(pkg: string, recipe: string, version: string, mode: RunMode): string {
  need(PACKAGE_ID.test(pkg), 'package id');
  need(RECIPE_ID.test(recipe), 'recipe id');
  need(VERSION.test(version), 'version');
  need(mode === 'step' || mode === 'auto', 'mode');
  return `ithub://install?package=${pkg}&recipe=${recipe}&version=${version}&mode=${mode}`;
}

export const SYNC_URL = 'ithub://sync';
export const LEARNINGS_URL = 'ithub://learnings';

export function runRecipeCommand(recipe: string, version: string, mode: RunMode): string {
  need(RECIPE_ID.test(recipe), 'recipe id');
  need(VERSION.test(version), 'version');
  return `${AGENT_LAUNCHER} -RunRecipe ${recipe} -RecipeVersion ${version} -Mode ${mode === 'auto' ? 'Auto' : 'Step'}`;
}

export const SYNC_COMMAND = `${AGENT_LAUNCHER} -Sync`;
export const LEARNINGS_COMMAND = `${AGENT_LAUNCHER} -CollectLearnings`;

export function registerCommand(category: 'ai-computer' | 'user-computer', friendlyName?: string): string {
  const name = friendlyName && /^[A-Za-z0-9 ._-]{1,60}$/.test(friendlyName) ? ` -FriendlyName '${friendlyName}'` : ' -FriendlyName <name>';
  return `${AGENT_LAUNCHER} -Sync -Category ${category}${name}`;
}

export const agentZipName = (version: string) => `it-hub-windows-agent-${version}.zip`;

/** Navigation link (not fetch): works when the browser is signed in to github.com with access. */
export function releaseDownloadUrl(owner: string, repo: string, tag: string, version: string): string {
  need(OWNER_REPO.test(owner) && OWNER_REPO.test(repo), 'repository');
  need(TAG.test(tag), 'tag');
  need(VERSION.test(version), 'version');
  return `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${agentZipName(version)}`;
}

export function verifyCommand(version: string): string {
  need(VERSION.test(version), 'version');
  return `(Get-FileHash .\\${agentZipName(version)} -Algorithm SHA256).Hash.ToLowerInvariant()`;
}

/**
 * Windows PowerShell 5.1 bootstrap: downloads the approved agent release with a token typed locally,
 * verifies its SHA-256 against the approved value and runs the agent installer. ASCII only.
 */
export function bootstrapScript(o: { owner: string; repo: string; tag: string; version: string; sha256: string }): string {
  need(OWNER_REPO.test(o.owner) && OWNER_REPO.test(o.repo), 'repository');
  need(TAG.test(o.tag), 'tag');
  need(VERSION.test(o.version), 'version');
  need(SHA256.test(o.sha256), 'SHA-256');
  const zip = agentZipName(o.version);
  return [
    '# IT Hub agent bootstrap - needs no git, no GitHub CLI and no Claude Code.',
    `# Downloads ${zip} (release ${o.tag}) from ${o.owner}/${o.repo}, checks the approved SHA-256 and runs the installer.`,
    '# The token is asked for here, kept in memory only and never written to disk.',
    "$ErrorActionPreference = 'Stop'",
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    `$owner = '${o.owner}'; $repo = '${o.repo}'; $tag = '${o.tag}'`,
    `$expected = '${o.sha256}'`,
    "$secure = Read-Host 'Fine-grained GitHub token (Contents: read-only for this repository)' -AsSecureString",
    '$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
    'try {',
    '    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)',
    "    $headers = @{ Authorization = \"Bearer $plain\"; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'it-hub-bootstrap' }",
    "    $release = Invoke-RestMethod -Uri \"https://api.github.com/repos/$owner/$repo/releases/tags/$tag\" -Headers ($headers + @{ Accept = 'application/vnd.github+json' })",
    `    $asset = @($release.assets | Where-Object { $_.name -eq '${zip}' }) | Select-Object -First 1`,
    `    if (-not $asset) { throw 'Release $tag has no asset ${zip}.' }`,
    "    $dir = Join-Path $env:TEMP ('it-hub-agent-' + [guid]::NewGuid().ToString('N'))",
    '    New-Item -ItemType Directory -Path $dir | Out-Null',
    `    $zip = Join-Path $dir '${zip}'`,
    "    Invoke-WebRequest -UseBasicParsing -Uri \"https://api.github.com/repos/$owner/$repo/releases/assets/$($asset.id)\" -Headers ($headers + @{ Accept = 'application/octet-stream' }) -OutFile $zip",
    '} finally {',
    '    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)',
    '    $plain = $null; $headers = $null; $secure = $null',
    '}',
    '$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()',
    "if ($actual -ne $expected) { Remove-Item -LiteralPath $zip -Force; throw \"SHA-256 mismatch: expected $expected, got $actual. Nothing was installed.\" }",
    "Write-Host \"SHA-256 verified: $actual\"",
    '# The installer verifies the package again against this checksum file before extracting it.',
    `Set-Content -LiteralPath "$zip.sha256" -Value "$expected  ${zip}" -Encoding ASCII`,
    "$files = Join-Path $dir 'package'",
    'Expand-Archive -LiteralPath $zip -DestinationPath $files',
    "powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $files 'Install-ItHubAgent.ps1') -ZipPath $zip",
    ''
  ].join('\r\n');
}
