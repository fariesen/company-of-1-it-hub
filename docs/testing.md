# Testing

Version 0.1 · 2026-11-06 · Status: TESTED locally on 2026-11-06 (results below) · CI workflows not yet run on GitHub

## Results (2026-11-06, Windows 11, Node 24)

| Suite | Command | Result |
|---|---|---|
| PWA unit + integration (vitest, jsdom) | `npm test` (in `app/`) | **105 passed**, live suite skipped without a token |
| PWA live, read-only, real private repo | `IT_HUB_LIVE_TOKEN=$(gh auth token) npx vitest run tests/unit/live.test.ts` | **8 passed** |
| PWA e2e (Playwright, Edge, desktop + Pixel 7 emulation) | `npm run test:e2e` | **18 passed** |
| Type check / lint / build / public scan | `npm run typecheck`, `lint`, `build`, `check:public` | clean / clean / OK / passed (13 files) |
| Broker (vitest, mocked GitHub) | `npm test` (in `broker/`) | **24 passed** |
| Content validator (node:test) | `npm test` (in `IT/tools/validate-content`) | **24 passed**; real repo: 0 errors |
| Windows agent (Pester 3.4) | `Invoke-Pester -Path .\tests` (in `IT/agent/windows`) | **52 passed**; one real check-only run produced a schema-valid snapshot |

## Coverage by area

| Area | Covered by |
|---|---|
| Bootstrap: valid locator, real `bootstrap.json`, invalid/unsupported schema, disallowed owner, malformed paths, unknown keys, https-only broker, missing/invalid/unreachable file | `bootstrap.test.ts` |
| Private config: valid, real `IT/config/it-hub.json`, extra repositories, foreign owner, undeclared repo key, traversal/URLs, duplicates, flags | `bootstrap.test.ts` |
| GitHub client: token only to api.github.com, `no-store`, 401/404/403/rate limit mapping, ETag 304 reuse, blob cache + clear, network errors | `github.test.ts` |
| Loading: devices, newest snapshot, docs, software, commits, approved release selection; unauthorized repo (no content requests); missing/invalid/unsupported config; inaccessible extra repo; malformed records → problems; duplicate IDs; no re-download on refresh | `content.test.ts` |
| Real content: the local IT working tree loads with zero content problems | `local-it.test.ts` |
| Markdown: 8 XSS vectors, headings/tables/code, relative/anchor/external links, unresolved links, images; path resolution | `markdown.test.ts` |
| Auth: PKCE RFC 7636 vector, token format (classic refused), session storage modes/expiry/corruption/clear, GitHub App redirect params, cancel, state mismatch, code exchange (mocked broker), single-use pending login, callback URL cleanup | `auth.test.ts` |
| App: sign-in UI, classic token refused without network, dashboard, alias routing, docs, no-access, expired creds, revoked access on refresh, logout + reauth, landing | `app.test.tsx` |
| PWA in a browser: Pages sub-path, manifest + icons, CSP, Chromium installability, offline shell, Cache Storage has no API data, XSS not executed, no token in URL, no-access, logout storage, update toast, dark theme, no horizontal overflow (mobile) | `tests/e2e/pwa.spec.ts` |
| Live GitHub: access check, tree + raw blob, ETag, file by path, not-found, no-access, commits/releases, `loadHub` (currently a clear "config not found" error, because the config is not pushed yet), bad credentials | `live.test.ts` |

## Running

```sh
cd app
npm run typecheck && npm run lint && npm test
npm run build && npm run check:public
npm run test:e2e                     # Edge; PW_CHANNEL=chrome for Chrome, PW_CHANNEL=chromium after `npx playwright install chromium`
```

The live test reads the token from the environment and never prints it. It only reads.

## Not tested (honest list)

- **Real GitHub OAuth / GitHub App sign-in.** No app or broker exists. Mocked tests do not prove it works.
- **Real iOS/iPadOS Safari, installed iOS PWA, real Android devices, macOS Safari, Firefox.** Only
  Chromium (Edge) with mobile emulation was used.
- **The GitHub Pages deployment** and the CI workflows on GitHub-hosted runners (never run).
- **The agent's real pull request** (`-Propose`) and real release install/update (mocked `git`/`gh`).
- Prototype sign-in with a real fine-grained token in the browser UI. The live API tests used the
  existing GitHub CLI session token directly, not the sign-in form.
- Screen-reader testing (semantic HTML and ARIA labels are used, but no audit was done).
