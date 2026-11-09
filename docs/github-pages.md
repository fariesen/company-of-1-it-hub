# GitHub Pages

Version 0.2 · 2026-11-09 · Status: workflow IMPLEMENTED, TESTED: deployed on GitHub Pages from main 5b4a213 (deployments 2026-11-06 16:24 and 16:45 UTC; https://fariesen.github.io/company-of-1-it-hub/ answered HTTP 200 on 2026-11-08) · every push to main redeploys

Target URL (after deployment): **https://fariesen.github.io/company-of-1-it-hub/**

## Enable (one time) **[Owner]**

After the public repository exists ([github-setup.md](github-setup.md)):

```powershell
gh api -X POST repos/fariesen/company-of-1-it-hub/pages -f build_type=workflow
gh workflow run pages.yml -R fariesen/company-of-1-it-hub     # or push to main
gh run watch -R fariesen/company-of-1-it-hub
gh api repos/fariesen/company-of-1-it-hub/pages --jq .html_url
```

Equivalent UI: *Settings → Pages → Build and deployment → Source: GitHub Actions*. HTTPS is
enforced automatically on `github.io`.

## Deployment workflow **[Auto]**

`.github/workflows/pages.yml` runs on every push to `main` and on manual dispatch.

| Job | Permissions | Steps |
|---|---|---|
| `build` | `contents: read` | `npm ci` → typecheck → unit tests → build → **`check:public`** (refuses to publish if secrets or private data are found) → upload `app/dist` |
| `deploy` | `pages: write`, `id-token: write` | `actions/deploy-pages` |

Actions are pinned to commit SHAs. The workflow uses no secrets. Deployments never cancel each other
(`concurrency: pages`).

## Base path

The build uses `base: './'` and hash routing (`#/hub/...`). The same build works at
`/company-of-1-it-hub/`, at a custom domain root, or locally, and no 404 fallback page is needed. The
manifest uses relative `start_url` (`./#/hub`) and `scope` (`./`). The e2e tests serve the
build under `/company-of-1-it-hub/` to check this.

## What is published

`index.html`, hashed JS/CSS bundles, `manifest.webmanifest`, `sw.js`, `version.json`,
`icons/*`, `config/bootstrap.json`. Nothing else. Source maps are disabled.

## Custom domain (optional, not configured)

A custom domain would give the app its own origin, not shared with other `fariesen.github.io`
sites. If used, add a `CNAME` file to `app/public/`, and update the GitHub App callback URL and the
broker's `ALLOWED_ORIGIN` / `REDIRECT_URI`.
