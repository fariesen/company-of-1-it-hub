# Windows inventory agent

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, TESTED (52 Pester tests; one real check-only run) · no release published · real PR flow NOT TESTED

Location: private repository, `agent/windows/` (full reference in `agent/windows/README.md`).
It is a separate component from the PWA and runs only on Windows.

## Properties

- Windows PowerShell 5.1, no external modules, **no administrator rights**, ASCII-only scripts.
- **Read-only** CIM/registry queries. The default mode is check-only.
- Output: one JSON snapshot per run, conforming to `schemas/snapshot.schema.json`.
- Never edits `device.json`. It only proposes new files under `snapshots/`, via a **pull request**.
- No hidden persistence. A scheduled task is created only with `-CreateScheduledTask` (weekly,
  current user, check-only).

## What it collects / does not collect

| Collected | Not collected |
|---|---|
| Manufacturer, model, hostname, BIOS version, system type | MAC/IP addresses, DNS, Wi-Fi names |
| Windows caption, version, build, display version, architecture | User names, profiles, per-user (HKCU) or Store apps |
| CPU, RAM (+ modules), physical disks, GPUs (virtual adapters flagged) | Files, browser data, cookies |
| Physical network adapters (name, type, speed, status) | Passwords, tokens, keys |
| Machine-wide installed programs (HKLM uninstall keys) | Telemetry of any kind |
| Identity hash: `sha256(it-hub-v1|SMBIOS UUID|BIOS serial)`; raw values never stored | |

A section that fails becomes a `diagnostics` entry (`ok`/`partial`/`failed`/`skipped`), and the run
continues. Values the agent cannot read are `unknown`.

## Install (per user) **[User, Windows]**

Prerequisites: read access to the private repository, and the GitHub CLI signed in (`gh auth login`, the
normal browser login). Never paste tokens into scripts.

```powershell
gh auth status
gh release download agent-windows-v0.1.0 -R fariesen/company-of-1-it -p "*.zip" -p "*.sha256" -D "$env:TEMP\it-hub-agent"
# Verify before extracting anything (the two values must be identical):
(Get-FileHash "$env:TEMP\it-hub-agent\it-hub-windows-agent-0.1.0.zip" -Algorithm SHA256).Hash
Get-Content "$env:TEMP\it-hub-agent\it-hub-windows-agent-0.1.0.zip.sha256"
Expand-Archive "$env:TEMP\it-hub-agent\it-hub-windows-agent-0.1.0.zip" "$env:TEMP\it-hub-agent\src"
cd "$env:TEMP\it-hub-agent\src"
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-ItHubAgent.ps1 -ZipPath "$env:TEMP\it-hub-agent\it-hub-windows-agent-0.1.0.zip"
```

Or, from a clone of the private repository: `Install-ItHubAgent.ps1 -FromRelease`. The installer
verifies SHA-256 before extracting, installs to `%LOCALAPPDATA%\ItHubAgent\versions\<ver>\`, writes
`current.txt`, logs to `logs\`, and creates the launcher `ithub-agent.cmd`. No release exists yet;
the Owner must publish one first ([operations.md](operations.md)).

## Use

```powershell
ithub-agent.cmd -CheckOnly                                              # collect + validate, write JSON to %LOCALAPPDATA%\ItHubAgent\out
ithub-agent.cmd -InventoryRoot "C:\The Company of 1\IT" -Compare        # resolve device, diff vs latest snapshot
ithub-agent.cmd -InventoryRoot "C:\The Company of 1\IT" -Propose        # branch inventory/<ID>/<timestamp>, commit, push, open PR (asks to confirm)
```

`-Propose` refuses if the device is unregistered, if `agent.enabled` is not `true`, if the working tree is dirty,
or if `gh` is not authenticated. Exit codes: `0` ok, `1` error, `2` refused/cancelled.

**Registering a device:** on an unregistered machine, `-InventoryRoot` prints an
`"agent": { "enabled": true, "identityHash": "sha256:..." }` block. Add it to the right
`device.json` (or create a new record) in a normal reviewed change.

## Review workflow

1. The agent opens a PR that adds exactly one snapshot file, with a change summary.
2. A human reviews and merges it. `validate-content.yml` validates the snapshot against the schema.
3. The IT Hub shows the new snapshot after the next refresh. Where declared hardware differs, it is
   marked "differs" for a human to correct `device.json`.

## Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\ItHubAgent\versions\<ver>\Uninstall-ItHubAgent.ps1" [-KeepData]
```

This removes only `%LOCALAPPDATA%\ItHubAgent` and the agent's own scheduled task.

Updates: see [agent-updates.md](agent-updates.md).
