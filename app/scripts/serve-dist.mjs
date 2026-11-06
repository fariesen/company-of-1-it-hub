// Serves dist/ under /company-of-1-it-hub/ to mimic a GitHub Pages project site (for e2e tests).
// GET /__bump-sw makes sw.js differ, to test update detection.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = '/company-of-1-it-hub/';
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let swSuffix = '';

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__bump-sw') {
    swSuffix += `\n// bump ${Date.now()}`;
    res.end('ok');
    return;
  }
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404).end('Not found (GitHub Pages serves this site under ' + base + ')');
    return;
  }
  let rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) return void res.writeHead(400).end();
  if (rel === '' || rel === '.') rel = 'index.html';
  const file = join(root, rel);
  try {
    if (!statSync(file).isFile()) throw new Error('dir');
  } catch {
    res.writeHead(404).end('Not found');
    return;
  }
  let body = readFileSync(file);
  if (rel === 'sw.js' && swSuffix) body = Buffer.concat([body, Buffer.from(swSuffix)]);
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
}).listen(port, () => console.log(`serving dist at http://localhost:${port}${base}`));
