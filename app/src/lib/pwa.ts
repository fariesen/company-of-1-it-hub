/** Service worker registration, update detection, install prompt and platform detection. */

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other';
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let installed = false;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribePwa(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function pwaState() {
  return { canPrompt: deferredPrompt !== null, updateReady: waitingWorker !== null, installed: installed || isStandalone() };
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function detectPlatform(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints ?? 0): { platform: Platform; browser: Browser } {
  let platform: Platform = 'other';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) platform = 'ios';
  else if (/Android/.test(ua)) platform = 'android';
  else if (/Windows/.test(ua)) platform = 'windows';
  else if (/Macintosh|Mac OS X/.test(ua)) platform = 'macos';
  else if (/Linux|X11|CrOS/.test(ua)) platform = 'linux';

  let browser: Browser = 'other';
  if (/Edg\//.test(ua)) browser = 'edge';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
  else if (/Chrome|CriOS|Chromium/.test(ua)) browser = 'chrome';
  else if (/Safari/.test(ua)) browser = 'safari';
  return { platform, browser };
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const p = deferredPrompt;
  deferredPrompt = null;
  emit();
  await p.prompt();
  return (await p.userChoice).outcome;
}

let updateAccepted = false;

export function applyUpdate(): void {
  if (!waitingWorker) return;
  updateAccepted = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when the user accepted an update. The first activation (clients.claim() on a
    // fresh install) also fires controllerchange and must not reload the page under the user.
    if (reloading || !updateAccepted) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = w;
            emit();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting;
        emit();
      }
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for a new version when the app regains focus (at most every 30 minutes).
      let last = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - last > 30 * 60_000) {
          last = Date.now();
          reg.update().catch(() => undefined);
        }
      });
    })
    .catch((e: unknown) => console.warn('Service worker registration failed', e instanceof Error ? e.message : e));
}

/** Removes every Cache Storage entry owned by this app (application shell only). */
export async function clearAppCaches(): Promise<number> {
  if (!('caches' in window)) return 0;
  const keys = (await caches.keys()).filter((k) => k.startsWith('it-hub-'));
  await Promise.all(keys.map((k) => caches.delete(k)));
  return keys.length;
}

export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;
