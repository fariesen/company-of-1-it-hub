# Windows agent updates

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, TESTED with mocked release data (Pester) · no real release yet

## Approved release definition

An update source is **only** a GitHub release in `fariesen/company-of-1-it` that:

- has the tag `agent-windows-v<major>.<minor>.<patch>`,
- is **not** a draft and **not** a prerelease,
- carries `it-hub-windows-agent-<ver>.zip` and `it-hub-windows-agent-<ver>.zip.sha256`.

Commits on `main` are never installed. The IT Hub dashboard and settings show the latest approved
release using the same rule.

## Commands (installed copy)

| Command | Effect |
|---|---|
| `ithub-agent.cmd -CheckUpdate` | Shows the installed version and the newest approved release. Changes nothing. |
| `ithub-agent.cmd -Update` | Downloads with `gh release download`, verifies SHA-256, asks for confirmation, installs into `versions\<new>\`, then switches `current.txt` (old version recorded in `previous.txt`) |
| `ithub-agent.cmd -Rollback` | Switches back to the version in `previous.txt` |

## Safety properties

- Versions are compared numerically (semver), and older or equal versions are ignored.
- A checksum mismatch aborts **before** extraction. Nothing changes, and the reason is logged.
- Updates are per-user. They never elevate, and no silent or background update is installed.
- Every action is logged in `%LOCALAPPDATA%\ItHubAgent\logs\`.
- Recovery: if a new version misbehaves, run `-Rollback`. If the launcher itself is broken, run the
  previous version's `Invoke-ItHubInventory.ps1` from `versions\<old>\` directly, or reinstall from a
  release.

## Not implemented

- Code signing (no certificate). Integrity relies on SHA-256 plus private release access control.
- Automatic scheduled updates (deliberately not implemented, because updates require confirmation).

## Publishing an update **[Owner]**

See [operations.md](operations.md#publish-a-windows-agent-release).
