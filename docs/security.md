# Security model

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, TESTED (automated tests named below)

## Boundaries

| Asset | Where | Who can read it |
|---|---|---|
| App code, icons, manifest, `bootstrap.json` | Public repo + GitHub Pages | Everyone (by design) |
| Private config, inventory, docs, agent releases | `fariesen/company-of-1-it` (private) | Accounts with read access, via their own credentials |
| GitHub App client secret (future) | Broker secret store only | Nobody else; never in any repository or bundle |
| User access token | Browser storage of that user's device | Scripts on the app origin (see below) |

Only GitHub's own access control grants access. The repository name in `bootstrap.json` is
public on purpose: **an obscured path is not a security control**, and none is relied on.

## Controls

| Control | Implementation | Evidence |
|---|---|---|
| Explicit authorization (login ≠ access) | `verifyRepositoryAccess` before any content is read, for every configured repository | Unit + integration tests: outsider gets `no-access`, no content requests made |
| Least privilege | Prototype refuses classic/OAuth tokens (`ghp_`, `gho_`, …); fine-grained token with **Contents: Read-only** on one repo. Production: GitHub App with Contents/Metadata read, installed on one repo | `auth.test.ts`, `app.test.tsx` |
| No secrets in the frontend | No client secret anywhere in the app. `check:public` scans `dist/` for token patterns, private keys, `client_secret` | `scripts/check-public-build.mjs`, run in CI before upload |
| No private data in the public build | Same scan for device records, snapshots, identity hashes, private config shape | `check:public` |
| Token never in URLs/logs | Tokens only in the `Authorization` header to `api.github.com`; errors are built from status codes; OAuth `code` removed from the address bar immediately | `github.test.ts`, e2e test |
| HTTP cache | All API calls use `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` | `github.test.ts` |
| Service worker | Caches same-origin public assets only; never intercepts cross-origin requests | e2e: Cache Storage contains no `api.github.com` entries |
| Markdown | marked → DOMPurify (no scripts, event handlers, styles, forms, frames, SVG); external links `noopener noreferrer`; images replaced by text | 8 XSS cases in `markdown.test.ts`; e2e checks an injected script/onerror did not run |
| Configuration is data only | Strict validators, unknown keys rejected, no URL fields in private config, owner allowlist (`fariesen`) compiled in, path traversal rejected | `bootstrap.test.ts` |
| CSP | `<meta>` CSP in production: `script-src 'self'`, `connect-src 'self' https://api.github.com [broker]`, `object-src 'none'` | e2e checks presence |
| Expiry/revocation | 401 → session ended, private data wiped; 404 on re-check → content hidden | `app.test.tsx` |
| Account isolation | New `GitHubClient` (empty caches) per session; login mismatch on refresh forces sign-out | `state.tsx` |
| CI | Minimal `permissions`, actions pinned to commit SHAs, `persist-credentials: false`, no secrets used in public workflows | `.github/workflows/*.yml` |

## Offline and caching

- Cached for offline use: **only the public application shell** (HTML/JS/CSS/icons/manifest).
  `bootstrap.json` and `version.json` are fetched network-first.
- **Not cached:** GitHub API responses, credentials and private content. Private data lives only in
  JavaScript memory while the app is open. There is no private offline mode (not implemented).
- **Logout** removes the session from `sessionStorage` and `localStorage`, discards the in-memory
  data and clients, and removes any pending login state. **Settings → Clear app cache** removes the
  app's Cache Storage (shell only).

## Residual risks (accepted or open)

| Risk | Notes |
|---|---|
| Token readable by scripts on the origin | Session storage (default) or local storage ("remember"). Mitigated by the strict CSP, no third-party scripts and sanitised rendering. Do not use "remember" on shared devices. |
| Device-level compromise | OS security, disk encryption and screen lock still matter. A stolen unlocked device with a remembered session can read the inventory until the token expires or is revoked. |
| `github.io` origin shared with other Pages sites of the same account | Pages sites of one user share the `fariesen.github.io` origin, so storage is per-origin, not per-repo. Do not publish untrusted Pages sites under the same account, or use a custom domain. |
| Meta-CSP limits | GitHub Pages cannot set HTTP headers; `frame-ancestors` cannot be set via meta. |
| Prototype tokens | Long-lived if the user picks a long expiry. Recommend 90 days or less. |
| Agent packages unsigned | Integrity relies on SHA-256 + private release access (no code-signing certificate). |
