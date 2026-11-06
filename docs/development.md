# Development

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED

## Prerequisites

- Node.js 22+ (developed with 24) and npm
- For e2e tests: Microsoft Edge or Google Chrome installed (no Playwright browser download needed)
- For the agent: Windows PowerShell 5.1 (Pester 3.4 is bundled)

## Layout

```
it-hub/
  app/                 PWA (React 19, TypeScript 6, Vite 8, react-router 7, marked + DOMPurify, lucide-react)
    public/            manifest, sw.js, icons (generated), config/bootstrap.json
    src/lib/           data, auth, security logic (no React)
    src/pages/         views
    scripts/           generate-icons, check-public-build, serve-dist (e2e)
    tests/unit/        vitest (jsdom) incl. fake GitHub API
    tests/e2e/         Playwright
  broker/              token broker (Workers-compatible fetch handler) + vitest
  docs/
```

TypeScript 6 is pinned because `typescript-eslint` does not yet support TypeScript 7.

## Commands (`app/`)

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR (CSP is injected only in production builds) |
| `npm run build` | Generate icons, build to `dist/`, write `sw.js` precache list + `version.json` |
| `npm run preview` | Serve `dist/` locally |
| `npm run typecheck` / `lint` / `test` | Quality gates |
| `npm run check:public` | Scan `dist/` for secrets and private data |
| `npm run test:e2e` | Playwright against `dist/` served under `/company-of-1-it-hub/` |

## Developing against real data

1. `npm run dev`, then open `http://localhost:5173/#/hub`.
2. Sign in with your own fine-grained token (Contents: read-only on the IT repo). The token stays in
   the browser's session storage; never commit it or put it in `.env` files.
3. The private configuration must exist on the configured `ref`. To test unmerged config changes,
   temporarily point `bootstrap.json` `ref` at your branch locally, and **do not commit that change**.

## Conventions

- Security-relevant logic belongs in `src/lib/` with unit tests. Pages stay presentational.
- New data sources must go through `parsePrivateConfig` validation and `verifyRepositoryAccess`.
- Never add third-party scripts, analytics or remote fonts (CSP `script-src 'self'`).
- Never use `dangerouslySetInnerHTML` except with `renderMarkdown` output.
- Add a new GitHub owner only by editing `ALLOWED_OWNERS` in `src/lib/policy.ts` (a code review is required).
- Version: `app/package.json` `version` is shown in the app and baked into the service-worker cache name.

## Broker

```sh
cd broker && npm ci && npm run typecheck && npm test
```
