# Installing the IT Hub (PWA)

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED · installability TESTED in Edge (Chromium) · iOS/Android NOT TESTED on real devices

URL (after deployment): **https://fariesen.github.io/company-of-1-it-hub/**

The landing page has **Open IT Hub** and **Install IT Hub** buttons, plus platform tabs with these
same instructions. The install button triggers the browser's own prompt where one exists, and shows the
manual steps otherwise.

| Platform | Browser | How | Automatic prompt? |
|---|---|---|---|
| iPhone / iPad | Safari (iOS/iPadOS 16.4+ recommended) | Share → **Add to Home Screen** → "Open as Web App" on → Add | No |
| Android | Chrome, Edge, Samsung Internet | **Install IT Hub** button, or menu → *Install app* | Yes (Chrome/Edge) |
| Windows | Edge, Chrome | **Install IT Hub** button or the install icon in the address bar; appears in Start menu | Yes |
| macOS | Safari 17+ (Sonoma) | File → **Add to Dock…** | No |
| macOS | Chrome, Edge | Install icon in the address bar | Yes |
| Linux | Chromium, Chrome, Edge, Brave | Install icon / menu → *Install IT Hub…* | Yes |
| any | Firefox (desktop) | Not supported; use a normal tab | No |

## After installing

- The app opens in its own window (`display: standalone`) at the dashboard (`start_url: ./#/hub`).
- Sign in once inside the app. On iOS, installed apps have storage separate from Safari.
- **Updates:** when a new version is deployed, the app shows *"A new version of the IT Hub is
  available"* with a **Reload** button. It checks when the app regains focus (at most every 30
  minutes) and on every launch. Content updates (inventory and docs) never need an app update. Use
  refresh instead.
- **Offline:** the app shell opens offline. Private inventory content is **not** available offline.

## PWA vs. Windows agent

| | IT Hub PWA | Windows inventory agent |
|---|---|---|
| Purpose | View inventory and documentation | Collect hardware/software, propose updates |
| Platforms | iOS, Android, Windows, macOS, Linux | Windows only |
| Installed from | Public website | Private repository release (GitHub CLI) |
| Writes to GitHub | Never | Only pull requests you confirm |

Installing one never installs the other. See [windows-agent.md](windows-agent.md).

## Uninstall

- iOS/Android: long-press the icon → remove.
- Windows/macOS/Linux (Chromium): open the app → *⋯ → Uninstall IT Hub*. macOS Safari: remove it from
  the Dock / Applications.
- Optionally clear site data for `fariesen.github.io` in the browser.

## Verified

Chromium reported no installability errors other than "in-incognito" (inherent to automated test
browsers). The manifest, icons, service worker registration, offline shell and update toast were tested in Edge with
desktop and Pixel 7 emulation. **Not verified:** real iOS Safari, real Android devices, macOS Safari.
