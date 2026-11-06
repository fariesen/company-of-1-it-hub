// Security gate for the public GitHub Pages artifact (dist/). Fails the build if the output could
// expose credentials or private IT content. Run after `npm run build`; CI runs it before upload.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const files = (function walk(d) {
  return readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
})(dist);

const failures = [];
const fail = (file, why) => failures.push(`${relative(dist, file).replaceAll('\\', '/')}: ${why}`);

// 1. Credentials.
const SECRET_PATTERNS = [
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'fine-grained personal access token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/client_secret["']?\s*[:=]\s*["'][^"']{8,}/i, 'OAuth client secret'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token']
];
// 2. Private inventory / documentation content that must only come from the private repository.
const PRIVATE_PATTERNS = [
  [/"identityHash"\s*:\s*"sha256:[0-9a-f]{64}"/, 'device identity hash'],
  [/"collectedAt"\s*:/, 'inventory snapshot'],
  [/"schemaVersion"\s*:\s*1\s*,\s*"id"\s*:\s*"(AIC|UC)-\d{3}"/, 'device record'],
  [/"sources"\s*:\s*\{\s*"inventory"/, 'private IT Hub configuration']
];
// 3. Only these file types may be published.
const ALLOWED_EXT = /\.(html|js|css|json|webmanifest|svg|png|ico|txt|woff2?)$/;

for (const f of files) {
  const rel = relative(dist, f).replaceAll('\\', '/');
  if (!ALLOWED_EXT.test(rel)) fail(f, 'unexpected file type in public build');
  if (/\.map$/.test(rel)) fail(f, 'source map in public build');
  if (/\.(png|ico|woff2?)$/.test(rel)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [re, why] of SECRET_PATTERNS) if (re.test(text)) fail(f, `possible ${why}`);
  for (const [re, why] of PRIVATE_PATTERNS) if (re.test(text)) fail(f, `possible private content (${why})`);
}

// 4. The public bootstrap must be a locator only.
const boot = JSON.parse(readFileSync(join(dist, 'config', 'bootstrap.json'), 'utf8'));
const allowedBootKeys = ['$schema', 'schemaVersion', 'bootstrap', 'auth'];
for (const k of Object.keys(boot)) if (!allowedBootKeys.includes(k)) fail(join(dist, 'config', 'bootstrap.json'), `unexpected key "${k}"`);
const authKeys = Object.keys(boot.auth?.githubApp ?? {});
for (const k of authKeys) if (!['clientId', 'brokerUrl', 'redirectUri'].includes(k)) fail(join(dist, 'config', 'bootstrap.json'), `unexpected auth key "${k}"`);

// 5. Required PWA files.
for (const req of ['index.html', 'manifest.webmanifest', 'sw.js', 'version.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png']) {
  try {
    statSync(join(dist, req));
  } catch {
    failures.push(`${req}: missing`);
  }
}
const index = readFileSync(join(dist, 'index.html'), 'utf8');
if (!/http-equiv="Content-Security-Policy"/.test(index)) failures.push('index.html: Content-Security-Policy missing');
if (/__PRECACHE_FILES__|__CACHE_VERSION__/.test(readFileSync(join(dist, 'sw.js'), 'utf8'))) failures.push('sw.js: placeholders not replaced');

if (failures.length) {
  console.error(`Public build check FAILED (${failures.length}):\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log(`Public build check passed: ${files.length} files, no credentials or private content found.`);
