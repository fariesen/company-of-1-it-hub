# Troubleshooting

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED

| Symptom | Cause | Fix |
|---|---|---|
| **"No access to the IT repository"** after sign-in | The account is not a collaborator, the invitation is not accepted, access was removed, or (token) the token does not include the repository | Owner: grant read access ([github-setup.md](github-setup.md)). User: accept the invitation. Token: recreate it with *Only select repositories → company-of-1-it* and Contents: Read-only. |
| **"This looks like a classic or OAuth token"** | `ghp_`/`gho_`… tokens are too broad and are refused | Create a **fine-grained** token (`github_pat_…`) |
| **"This is not a fine-grained personal access token"** | Typo or truncated paste | Paste the whole token |
| **"GitHub did not accept this token"** | Wrong, expired or deleted token | Create a new token |
| **"Your session has expired"** | Token expired or was revoked (HTTP 401) | Sign in again. GitHub App tokens last 8 hours unless "keep me signed in" was chosen. |
| Signed out every time the app is reopened (iOS) | iOS clears session storage when the installed app is closed | Tick "Remember…/Keep me signed in" (personal devices only) |
| **"GitHub rate limit reached"** | Too many API calls (5,000/hour per user) | Wait until the time shown. Settings → Diagnostics shows the remaining quota. |
| **"The private configuration config/it-hub.json was not found"** | File missing on the configured branch, or not pushed yet | Push/merge `config/it-hub.json` to `main` in the private repo |
| **"Invalid configuration: …"** | Config fails validation (the message names the field) | Fix the field; run `npm run validate` in `IT/tools/validate-content` |
| **"Unsupported configuration version"** | `schemaVersion` newer than this app | Deploy an app version that supports it, or revert the config |
| Dashboard shows **content problems** | A `device.json`/snapshot is malformed, has an unsupported version, or contains duplicate IDs | Fix the listed file; CI validation shows details |
| A device shows "Not captured yet" | No snapshot, or `agent.identityHash` not bound | Run the agent and merge its PR |
| **No "Install" button** | iOS/macOS Safari and Firefox have no install prompt; the app is already installed; or the browser has not yet decided it is installable | Use the manual steps on the landing page ([pwa-installation.md](pwa-installation.md)) |
| **"A new version … is available"** | A new deployment was detected | Click **Reload** |
| Old version keeps loading | Stale service worker | Close all app windows/tabs and reopen; or Settings → *Clear app cache*; or clear site data for `fariesen.github.io` |
| "You appear to be offline" | No network | Reconnect. Private content is never available offline. |
| Links in docs shown as dashed text | The target file is not in a configured documentation section or does not exist | Add the section to `sources.documentation`, or fix the link |
| Images in docs shown as `[alt]` | Intended: private images need credentials and remote images are blocked by the CSP | Link to the file instead |

## Windows agent

| Symptom | Fix |
|---|---|
| `running scripts is disabled` | Run it via `powershell -NoProfile -ExecutionPolicy Bypass -File …` as documented |
| `deviceId: unregistered` | Bind the printed `identityHash` in the device's `device.json` (reviewed PR) |
| `-Propose` refused (exit 2) | Read the message: device unregistered, `agent.enabled` not true, working tree dirty, or `gh` not authenticated (`gh auth login`) |
| Section `partial`/`failed` in diagnostics | Usually a missing cmdlet or permission (e.g. `Get-PhysicalDisk`). The fallback data is used; the run is still valid. |
| Checksum mismatch on install/update | Do not install. Re-download; if it persists, tell the Owner (the release may be corrupt or tampered with). |
| Logs | `%LOCALAPPDATA%\ItHubAgent\logs\` |

## Diagnostics to share

Settings → *Diagnostics* (bootstrap target, sign-in methods, counts, request count, rate limit,
content problems) and *App version*. These never include tokens. Never share a token or a
screenshot that shows one.
