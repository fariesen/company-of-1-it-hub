# The Company of 1 - IT Hub

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED and TESTED locally · NOT DEPLOYED · production sign-in REQUIRES APPROVAL

An installable Progressive Web App (PWA) for the IT department of The Company of 1. It shows
devices, software, infrastructure, setup guides and documentation. All of this is read **at
runtime** from the private GitHub repository `fariesen/company-of-1-it` with the signed-in user's own
GitHub credentials.

This repository is **public**. It contains only the application code, public icons, the web
manifest, the service worker and a non-sensitive bootstrap locator. It contains no inventory
data, internal documentation, credentials or network details.

## Components

| Path | What | Status |
|---|---|---|
| `app/` | React + TypeScript + Vite PWA (GitHub Pages compatible) | IMPLEMENTED, TESTED |
| `app/public/config/bootstrap.json` | Public stage-1 locator of the private configuration | IMPLEMENTED |
| `broker/` | Stateless token-exchange function for GitHub App sign-in | IMPLEMENTED, unit-TESTED, **not deployed: REQUIRES APPROVAL** |
| `.github/workflows/ci.yml` | Typecheck, lint, tests, build, public-build scan | IMPLEMENTED (not yet run on GitHub) |
| `.github/workflows/pages.yml` | GitHub Pages deployment | IMPLEMENTED (not yet run on GitHub) |
| `docs/` | Documentation (this set) | IMPLEMENTED |

The Windows inventory agent, the data schemas and the private configuration live in the
**private** repository (`agent/windows/`, `schemas/`, `config/it-hub.json`).

## Current sign-in status (important)

A static GitHub Pages site **cannot** complete GitHub's OAuth login by itself. GitHub requires a
client secret for the token exchange, and its login endpoints do not support CORS. See
[docs/authentication.md](docs/authentication.md).

- **Now:** an owner-only *prototype* sign-in with a fine-grained personal access token (read-only,
  limited to the IT repository).
- **Production:** a GitHub App plus a tiny stateless token broker. The code is ready, but hosting
  the broker needs Owner approval.

## Quick start (development)

```sh
cd app
npm ci
npm run dev          # http://localhost:5173
npm run typecheck && npm run lint && npm test && npm run build && npm run check:public
```

## Documentation

| Topic | File |
|---|---|
| Architecture and data flow | [docs/architecture.md](docs/architecture.md) |
| Security model | [docs/security.md](docs/security.md) |
| Authentication (feasibility finding, options) | [docs/authentication.md](docs/authentication.md) |
| GitHub setup (repositories, access) | [docs/github-setup.md](docs/github-setup.md) |
| GitHub Pages | [docs/github-pages.md](docs/github-pages.md) |
| Bootstrap configuration (public + private) | [docs/bootstrap-configuration.md](docs/bootstrap-configuration.md) |
| Installing the PWA | [docs/pwa-installation.md](docs/pwa-installation.md) |
| Windows inventory agent | [docs/windows-agent.md](docs/windows-agent.md) |
| Agent updates | [docs/agent-updates.md](docs/agent-updates.md) |
| Inventory schema and field ownership | [docs/inventory-schema.md](docs/inventory-schema.md) |
| Development | [docs/development.md](docs/development.md) |
| Testing | [docs/testing.md](docs/testing.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Operations (releases, access, revocation) | [docs/operations.md](docs/operations.md) |

## Principles

GitHub is the single source of truth. There is no database and no private data in the public
build. Unknown values are shown as `unknown`, never guessed. Access is least-privilege and
read-only. The Owner approves all commits, publication and new infrastructure.
