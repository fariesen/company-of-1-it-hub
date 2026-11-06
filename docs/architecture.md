# Architecture

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED (PWA, agent, broker code) · NOT DEPLOYED

## Overview

```
 Public (GitHub Pages)                        Private (GitHub, authoritative)
 fariesen/company-of-1-it-hub                 fariesen/company-of-1-it
 ┌──────────────────────────┐                 ┌──────────────────────────────────┐
 │ PWA: HTML/JS/CSS, icons, │   user token    │ config/it-hub.json  (stage 2)    │
 │ manifest, sw.js,         │ ──────────────► │ inventory/**/device.json         │
 │ config/bootstrap.json    │  api.github.com │ inventory/**/snapshots/*.json    │
 │ (stage 1 locator)        │  (CORS, REST)   │ setup/ software/ infrastructure/ │
 └──────────────────────────┘                 │ agent/windows/  schemas/         │
            ▲                                 │ releases: agent-windows-vX.Y.Z   │
            │ (optional, REQUIRES APPROVAL)   └──────────────────────────────────┘
 ┌──────────┴───────────────┐                              ▲
 │ Token broker (stateless) │── code→token ──► github.com  │ pull request (reviewed)
 │ holds GitHub App secret  │                              │
 └──────────────────────────┘                 ┌────────────┴─────────────┐
                                              │ Windows inventory agent  │
                                              │ (per-user, PowerShell)   │
                                              └──────────────────────────┘
```

- **GitHub is the only data store.** The PWA reads it and the agent proposes changes to it as
  pull requests. There is no database and no server-side cache.
- **The PWA is static.** It is served from GitHub Pages and only talks to `api.github.com` (plus
  the broker once approved).
- **No private data is ever built into the public bundle.** `npm run check:public` enforces this
  in CI before every deployment.

## Startup sequence

1. The browser loads the app shell, from the network or from the service-worker cache.
2. The app fetches `./config/bootstrap.json` (same origin, no credentials) and validates it
   strictly (`src/lib/bootstrap.ts`).
3. If there is no session, the sign-in screen appears. See [authentication.md](authentication.md).
4. After sign-in, `loadHub()` (`src/lib/content.ts`) runs these steps:
   1. `GET /user`, to identify the account.
   2. `GET /repos/{owner}/{repo}`, an **explicit authorization check**. A 404 or 403 means no access, and nothing else is loaded.
   3. Read `config/it-hub.json` (stage 2) and validate it.
   4. Run the access check for every repository the configuration references.
   5. `GET /git/trees/{ref}?recursive=1` per repository, with ETag revalidation.
   6. Fetch `device.json`, the newest snapshot per device, and Markdown documents as blobs by SHA (cached in memory per session).
   7. Fetch recent commits under the inventory path and the latest approved agent release. Neither is fatal if it fails.
5. The views render from in-memory data only.

## Refresh

- Manual refresh is the button in the top bar or **Settings → Refresh now**.
- The app also refreshes when it comes back to the foreground, at most every
  `refresh.minIntervalSeconds` seconds (private config, default 60).
- An unchanged repository costs about 4 to 6 API requests per refresh. The tree comes back as 304, and blobs are never re-downloaded.
- Content changes in the repository appear after the next refresh. Reinstalling the PWA is never needed.

## App routes (hash routing, works under `/company-of-1-it-hub/`)

| Route | View |
|---|---|
| `#/` | Public landing / install page |
| `#/hub` | Dashboard |
| `#/hub/devices`, `#/hub/devices/:id` | Device list, device detail (legacy aliases redirect to the ID) |
| `#/hub/software` | Software aggregated from snapshots + optional catalog |
| `#/hub/infrastructure`, `#/hub/setup` | Section pages built from configured documentation |
| `#/hub/docs/:repo/*` | Markdown documentation viewer |
| `#/hub/search`, `#/hub/settings`, `#/hub/more` | Search, settings/diagnostics, mobile menu |

## Code map (`app/src`)

| File | Responsibility |
|---|---|
| `lib/bootstrap.ts` | Stage 1/2 configuration parsing and validation |
| `lib/policy.ts` | Built-in owner allowlist, supported schema versions, limits |
| `lib/paths.ts` | Safe repository paths, relative-link resolution |
| `lib/github.ts` | REST client: `no-store`, in-memory ETag + blob cache, error mapping |
| `lib/content.ts` | Loads and assembles all hub data |
| `lib/inventory.ts` | Defensive parsing of device records and snapshots |
| `lib/markdown.ts` | marked + DOMPurify rendering, link rewriting |
| `lib/search.ts` | In-memory search |
| `lib/auth/*` | Session storage, token prototype, GitHub App + PKCE flow |
| `lib/pwa.ts` | Service worker registration, update detection, install prompt |
| `state.tsx` | Session lifecycle, loading, refresh, logout |
| `public/sw.js` | Service worker (app shell only) |

## Repositories

| Repository | Visibility | Contents |
|---|---|---|
| `fariesen/company-of-1-it` | private | Inventory, docs, private config, schemas, Windows agent, agent releases, validation workflows |
| `fariesen/company-of-1-it-hub` | public (proposed, not created) | PWA, broker source, public docs, Pages workflow |
