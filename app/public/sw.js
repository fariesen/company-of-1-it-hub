/*
 * IT Hub service worker.
 *
 * Security model:
 * - Only same-origin, public build assets are cached (the application shell).
 * - Requests to any other origin (api.github.com, the token broker, avatars) are never intercepted,
 *   so private GitHub content and credentials never enter Cache Storage.
 * - config/bootstrap.json and version.json are fetched network-first so configuration and update
 *   detection stay current; the cached copy is used only when offline.
 */
'use strict';

const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = 'it-hub-shell-' + CACHE_VERSION;
const PRECACHE = '__PRECACHE_FILES__';
const NETWORK_FIRST = ['config/bootstrap.json', 'version.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(Array.isArray(PRECACHE) ? PRECACHE : ['./']))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('it-hub-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function scopePath(url) {
  const scope = new URL(self.registration.scope);
  return url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : null;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch GitHub API or broker traffic
  const path = scopePath(url);
  if (path === null) return;

  // OAuth callback URLs carry a one-time code in the query string: always go to the network
  // and never store them.
  if (url.search) {
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => caches.match('./', { ignoreSearch: true })));
    }
    return;
  }

  if (NETWORK_FIRST.includes(path)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || Response.error()))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./').then((r) => r || Response.error())));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
