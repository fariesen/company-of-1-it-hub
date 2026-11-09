# Software knowledge, new-PC setup and the agent hand-off (0.4.7)

Version 0.4.7 · 2026-11-09 · Status: IMPLEMENTED, TESTED with the fake GitHub API (`app/tests/unit/knowledge.test.tsx`) · on branch `feature/dashboard-0.4.7`, NOT DEPLOYED

## Software detail page (`#/hub/software/<id>`)

One page per catalog package (`software/catalog.json` in the private repository). It shows:

| Section | Source in the private repository |
|---|---|
| Catalog facts: publisher, kind, category, status, tags, version policy, install method, dependencies, alternatives, related, add-ons, sources, documentation links | `software/catalog.json` |
| Devices with the package and their version against the policy (matches / differs / unknown / not version-managed), devices without it | newest snapshot per device; matching = exact name, then the package's `match.names` patterns (same rule as the agent) |
| Prerequisites and installation guide | `software/guides/<id>/guide.json` (`prerequisites`) and `software/guides/<id>/README.md` (rendered with the sanitizing Markdown pipeline) |
| Known issues and solutions, learnings (filter by type and review status), change history | `software/guides/<id>/guide.json` (schema `schemas/software-guide.schema.json`) |
| Installation recipes: state, privileges, idempotency, rollback, limitations, every step with its command, troubleshooting, history, archived versions | `setup/recipes/<id>.json`, `setup/recipes/history/<id>/` |

A missing guide is not an error ("No central knowledge yet"). An invalid `guide.json`, invalid items in it, or a guide folder that does not match a catalog package become content problems. Recipes marked `approved` without an approval record are shown as `needs-revision`.

Commands are **displayed for review and copying only**. The IT Hub never runs a command and never writes to GitHub.

The device page marks each installed program that belongs to a catalog package, links it to the detail page and can filter to catalog software or to versions that differ from the policy.

## Hand-off to the local Windows agent

| From the IT Hub | Copy alternative (Windows PowerShell) |
|---|---|
| `ithub://install?package=<id>&recipe=<id>&version=<x.y.z>&mode=step` | `& "$env:LOCALAPPDATA\ItHubAgent\ithub-agent.cmd" -RunRecipe <id> -RecipeVersion <x.y.z> -Mode Step` |
| `...&mode=auto` (only offered for an approved recipe) | `... -Mode Auto` |
| `ithub://sync` | `... -Sync` |
| `ithub://learnings` | `... -CollectLearnings` |

Rules:
- Links carry ids only, never commands. They are built in code with strict validation (`app/src/lib/agentLinks.ts`): ids `^[a-z0-9][a-z0-9-]{0,63}$`, version `^\d+\.\d+\.\d+$`.
- Markdown content can never produce an `ithub:` link; the sanitizer removes it (tested).
- A link works only when the agent's optional protocol handler was registered (`Install-ItHubAgent.ps1 -RegisterProtocol`).
- The agent loads the recipe from its verified approved-recipe cache, shows every command and asks locally. Recipe execution in the agent is currently disabled (`RecipeExecutionEnabled = $false`), so the agent shows and simulates only.

## Setting up a new PC (`#/hub/setup-pc`)

The steps are:
1. Sign in with the token.
2. Download the agent.
3. Install it.
4. Register the PC (`-Sync -Category ai-computer|user-computer [-FriendlyName]`).
5. See the PC's software.

Git, GitHub CLI and Claude Code are not needed.

### Download finding (2026-11-09)

The check used `curl` against a public release (`cli/cli`) with `Origin: https://fariesen.github.io`. It found:
- `api.github.com` answers with `Access-Control-Allow-Origin: *` and allows `Authorization` in preflight requests.
- The asset endpoint (`/releases/assets/<id>`, `Accept: application/octet-stream`) answers `302` to `release-assets.githubusercontent.com`.
- That host sends **no** `Access-Control-Allow-Origin` header.

Consequence: a `fetch()` download from the PWA is blocked by the browser. The page therefore offers:
- **Option A:** a normal link to `https://github.com/<owner>/<repo>/releases/download/<tag>/it-hub-windows-agent-<version>.zip`. It works when the browser is signed in to github.com with access to the private repository. The page shows the approved SHA-256 and a `Get-FileHash` command.
- **Option B:** a generated Windows PowerShell 5.1 bootstrap script (ASCII), which:
  - asks for the token with `Read-Host -AsSecureString`, so the token is never part of the page or script;
  - downloads the asset through the API;
  - stops unless the SHA-256 equals the value approved in `agent/windows/approved-releases.json`;
  - runs `Install-ItHubAgent.ps1 -ZipPath`.

Without an approved release (the list is empty today), neither a link nor a script is offered.
