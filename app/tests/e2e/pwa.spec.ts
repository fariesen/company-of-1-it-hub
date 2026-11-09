/**
 * End-to-end tests in a real Chromium-based browser against the production build, served under the
 * GitHub Pages project path. GitHub's API is replaced by a route handler: these tests prove the
 * app's behaviour, not that real GitHub sign-in works.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

// The landing page shows the app version from package.json; read it instead of hard-coding it.
const APP_VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TOKEN = 'github_pat_E2E_0123456789abcdefghijklmnopqrstu';
const enc = (s: string) => Buffer.from(s).toString('utf8');

const files: Record<string, string> = {
  'config/it-hub.json': JSON.stringify({
    schemaVersion: 1,
    application: { name: 'E2E Hub', configVersion: 'e2e-1' },
    repositories: { it: { owner: 'fariesen', name: 'company-of-1-it', ref: 'main' } },
    sources: {
      inventory: { repository: 'it', path: 'inventory' },
      infrastructure: { repository: 'it', path: 'infrastructure' },
      setup: { repository: 'it', path: 'setup' },
      documentation: [
        { id: 'overview', title: 'Overview', repository: 'it', path: 'README.md' },
        { id: 'setup', title: 'Setup', repository: 'it', path: 'setup' }
      ]
    }
  }),
  'README.md': '# IT Department\n\nSee the [setup guide](setup/README.md).\n\n<script>window.__xss=1</script><img src=x onerror="window.__xss=2">',
  'setup/README.md': '# Setup\n\n## Phase 1 - Base installation\n\n| Step | Test |\n|---|---|\n| Install | Boots |\n\n```powershell\nGet-ComputerInfo\n```',
  'infrastructure/README.md': '# Infrastructure\n\nNo secrets here.',
  'inventory/ai-computers/AIC-001/device.json': JSON.stringify({ schemaVersion: 1, id: 'AIC-001', aliases: ['PC1'], category: 'ai-computer', name: 'E2E workstation', lifecycle: 'active', hardware: { manufacturer: 'unknown' }, updated: '2026-11-06' })
};
const sha = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(5);
};

async function mockGitHub(page: Page, opts: { access?: boolean } = {}) {
  const seenAuth: string[] = [];
  await page.route('https://api.github.com/**', async (route: Route) => {
    const req = route.request();
    const auth = req.headers()['authorization'] ?? '';
    seenAuth.push(auth);
    const url = new URL(req.url());
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, X-RateLimit-Remaining, X-RateLimit-Limit, X-RateLimit-Reset' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'Authorization, If-None-Match, X-GitHub-Api-Version' } });
    if (auth !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers: cors, json: { message: 'Bad credentials' } });
    const p = url.pathname;
    if (p === '/user') return route.fulfill({ headers: cors, json: { login: 'fariesen', name: 'E2E Owner', avatar_url: 'data:,' } });
    if (opts.access === false) return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
    if (p === '/repos/fariesen/company-of-1-it') return route.fulfill({ headers: cors, json: { full_name: 'fariesen/company-of-1-it', private: true, default_branch: 'main', permissions: { pull: true } } });
    if (p.endsWith('/git/trees/main')) return route.fulfill({ headers: { ...cors, ETag: '"t1"' }, json: { sha: 'x', truncated: false, tree: Object.entries(files).map(([path, c]) => ({ path, type: 'blob', sha: sha(c), size: c.length })) } });
    if (p.includes('/git/blobs/')) {
      const hit = Object.values(files).find((c) => sha(c) === p.split('/').pop());
      return route.fulfill({ headers: cors, body: enc(hit ?? '') });
    }
    if (p.includes('/contents/')) {
      const path = decodeURIComponent(p.split('/contents/')[1]!);
      return files[path] ? route.fulfill({ headers: cors, body: files[path] }) : route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
    }
    if (p.endsWith('/commits') || p.endsWith('/releases')) return route.fulfill({ headers: cors, json: [] });
    return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
  });
  return seenAuth;
}

async function signIn(page: Page) {
  await page.goto('./#/hub');
  await page.getByLabel(/fine-grained personal access token/i).fill(TOKEN);
  await page.getByRole('button', { name: /sign in with token/i }).click();
  await expect(page.getByRole('heading', { name: /Hello, E2E/ })).toBeVisible();
}

test('landing page renders under the GitHub Pages sub-path with install instructions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /every device, guide and setup step/i })).toBeVisible();
  await page.getByRole('tab', { name: /iPhone/ }).click();
  await expect(page.getByText(/Add to Home Screen/).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`Version ${escapeRegExp(APP_VERSION)}`))).toBeVisible();
  expect(errors).toEqual([]);
});

test('manifest is valid and every icon resolves', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).href;
  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest).toMatchObject({ name: 'The Company of 1 IT Hub', short_name: 'IT Hub', display: 'standalone', scope: './', start_url: './#/hub' });
  expect(manifest.icons.some((i: { sizes: string; purpose: string }) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, manifestUrl).href)).status()).toBe(200);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain('connect-src');
});

test('Chromium reports no installability errors', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const cdp = await page.context().newCDPSession(page);
  await page.waitForTimeout(500);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
  // Playwright browser contexts are always incognito, which Chromium reports as 'in-incognito'.
  // Any other entry would be a real manifest/service-worker/icon problem.
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);
});

test('service worker serves the app shell offline', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /every device, guide and setup step/i })).toBeVisible();
  await context.setOffline(false);
});

test('signs in, renders inventory and sanitised docs; private API data never enters Cache Storage', async ({ page }) => {
  const seenAuth = await mockGitHub(page);
  await signIn(page);
  await page.goto('./#/hub/devices/PC1');
  await expect(page.getByRole('heading', { level: 1, name: 'AIC-001 · E2E workstation' })).toBeVisible();
  await page.goto('./#/hub/docs/it/README.md');
  await page.getByRole('link', { name: 'setup guide' }).click();
  await expect(page.getByRole('heading', { name: 'Phase 1 - Base installation' })).toBeVisible();
  await expect(page.locator('.prose table')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
    return out;
  });
  expect(cached.filter((u) => !u.startsWith(new URL(page.url()).origin))).toEqual([]);
  expect(cached.some((u) => u.includes('api.github.com'))).toBe(false);
  expect(seenAuth.every((a) => a === `Bearer ${TOKEN}`)).toBe(true);
  // The token is never put in the URL.
  expect(page.url()).not.toContain(TOKEN);
});

test('account without repository access sees an explicit authorization error', async ({ page }) => {
  await mockGitHub(page, { access: false });
  await page.goto('./#/hub');
  await page.getByLabel(/fine-grained personal access token/i).fill(TOKEN);
  await page.getByRole('button', { name: /sign in with token/i }).click();
  await expect(page.getByText('No access to the IT repository')).toBeVisible();
  await expect(page.getByText('AIC-001')).toHaveCount(0);
});

test('logout removes the session from storage', async ({ page }) => {
  await mockGitHub(page);
  await signIn(page);
  await page.goto('./#/hub/settings');
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByText(/prototype sign-in/i)).toBeVisible();
  const stored = await page.evaluate(() => [sessionStorage.getItem('it-hub.session.v1'), localStorage.getItem('it-hub.session.v1')]);
  expect(stored).toEqual([null, null]);
});

test('a new deployment is detected and offered as an update', async ({ page, request }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await request.get('http://localhost:4173/__bump-sw');
  await page.goto('./#/hub');
  await mockGitHub(page);
  await page.getByLabel(/fine-grained personal access token/i).fill(TOKEN);
  await page.getByRole('button', { name: /sign in with token/i }).click();
  await expect(page.getByRole('heading', { name: /Hello, E2E/ })).toBeVisible();
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await expect(page.getByText('A new version of the IT Hub is available.')).toBeVisible({ timeout: 10_000 });
});

test('dark theme and mobile layout render without horizontal overflow', async ({ page }) => {
  await mockGitHub(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page);
  for (const path of ['./#/hub', './#/hub/devices', './#/hub/docs', './#/hub/settings', './#/hub/setup']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 20, 22)');
  await page.screenshot({ path: `test-results/screens/dashboard-${test.info().project.name}-dark.png`, fullPage: false });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./#/hub');
  await page.screenshot({ path: `test-results/screens/dashboard-${test.info().project.name}-light.png`, fullPage: false });
});
