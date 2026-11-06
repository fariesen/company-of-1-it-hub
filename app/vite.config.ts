import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Optional origin of the approved token-exchange broker (GitHub App sign-in). Added to the CSP
 * connect-src only when set. Leave unset for the token-only prototype.
 */
const brokerOrigin = process.env.IT_HUB_BROKER_ORIGIN ?? '';
if (brokerOrigin && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(brokerOrigin)) {
  throw new Error('IT_HUB_BROKER_ORIGIN must be a bare https origin');
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Content Security Policy for production builds (dev mode needs inline scripts for HMR). */
function contentSecurityPolicy(): Plugin {
  const connect = ["'self'", 'https://api.github.com', brokerOrigin].filter(Boolean).join(' ');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  return {
    name: 'it-hub-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    }
  };
}

/**
 * Writes the precache list and a content-derived cache version into dist/sw.js.
 * Only public build output is precached; the service worker never touches api.github.com.
 */
function serviceWorkerManifest(): Plugin {
  return {
    name: 'it-hub-sw-manifest',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const files = listFiles(dist)
        .map((f) => relative(dist, f).replaceAll('\\', '/'))
        .filter((f) => f !== 'sw.js' && f !== 'version.json' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
      const build = `${pkg.version}-${hash.digest('hex').slice(0, 12)}`;
      const swPath = join(dist, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("'__PRECACHE_FILES__'", JSON.stringify(['./', ...files]))
        .replace('__CACHE_VERSION__', build);
      writeFileSync(swPath, sw);
      writeFileSync(join(dist, 'version.json'), JSON.stringify({ version: pkg.version, build }) + '\n');
    }
  };
}

export default defineConfig({
  // Relative base: the same build works at https://<user>.github.io/<repo>/ and locally.
  base: './',
  plugins: [react(), contentSecurityPolicy(), serviceWorkerManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: { sourcemap: false, target: 'es2022' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}']
  }
});
