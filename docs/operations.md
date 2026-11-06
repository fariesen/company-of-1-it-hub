# Operations runbook

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED (procedures) · nothing deployed yet

Legend: **[Owner]** manual · **[Auto]** GitHub Actions.

## First-time setup checklist

| # | Step | Who | Reference |
|---|---|---|---|
| 1 | Review and merge the private-repo changes (config, schemas, AIC-001, agent, validation) via PR | Owner | [github-setup.md §1](github-setup.md) |
| 2 | Create public repo `fariesen/company-of-1-it-hub` and push `it-hub/` | Owner (approval) | [github-setup.md §2](github-setup.md) |
| 3 | Enable Pages (source: GitHub Actions) | Owner | [github-pages.md](github-pages.md) |
| 4 | Deploy | Auto on push to `main` | `pages.yml` |
| 5 | Sign in with the owner's fine-grained token and verify the content | Owner | [authentication.md §2a](authentication.md) |
| 6 | Decide on production sign-in (GitHub App + broker) | Owner decision | [authentication.md §4](authentication.md) |
| 7 | Publish the first agent release and capture AIC-001 | Owner | below |

## Update inventory or documentation

1. **[Human]** Edit `device.json`, `DEVICE.md` or the docs in a branch of the private repo, and open a PR.
2. **[Auto]** `validate-content.yml` validates schemas, IDs, links and secret patterns.
3. **[Owner]** Merge. Users see the change after their next refresh (no app release needed).

New device: create `inventory/<ai-computers|user-computers>/<ID>/device.json` with the next free ID,
`lifecycle`, and `unknown` for anything not verified. Then run the agent on it.

## Release a new PWA version

1. **[Owner]** Bump `version` in `app/package.json` (semver) and commit to a branch. Open a PR.
2. **[Auto]** `ci.yml` runs typecheck, lint, tests, build and `check:public`.
3. **[Owner]** Merge to `main`. **[Auto]** `pages.yml` builds, scans and deploys.
4. Installed apps show the update prompt on next focus/launch.

Rollback: `git revert` the change on `main` and push (it redeploys automatically).

## Publish a Windows agent release

```powershell
cd "C:\The Company of 1\IT\agent\windows"
# 1. Bump VERSION (e.g. 0.1.0), commit via PR, merge. Then on main:
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester -Path .\tests"
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Build-AgentPackage.ps1
gh release create agent-windows-v0.1.0 dist\it-hub-windows-agent-0.1.0.zip dist\it-hub-windows-agent-0.1.0.zip.sha256 `
  -R fariesen/company-of-1-it --title "Windows agent 0.1.0" --notes "Changes: ..."
```

A release is "approved" once it is published as neither a draft nor a prerelease. To test first, create it with
`--prerelease`. Agents ignore it until you edit it to a full release. To withdraw a bad release,
mark it as a prerelease or delete it; agents then roll back with `-Rollback`.

## Grant or revoke access

```powershell
gh api -X PUT    repos/fariesen/company-of-1-it/collaborators/USERNAME -f permission=pull   # grant
gh api -X DELETE repos/fariesen/company-of-1-it/collaborators/USERNAME                      # revoke
gh api repos/fariesen/company-of-1-it/collaborators --jq '.[].login'                       # review
```

Revocation takes effect in the IT Hub at the next refresh (access is re-checked every time). For
departing employees, also remove them from any agent machine's `gh` login, and ask them to delete
their tokens. GitHub App user tokens expire within 8 hours.

## Incident: suspected token leak

1. Delete the token (<https://github.com/settings/personal-access-tokens>) or revoke the app
   authorization (<https://github.com/settings/apps/authorizations>).
2. If the broker's client secret leaked, generate a new secret, update the broker secret, and delete the old one.
3. Review the repository's audit trail: *Settings → Security log* (personal account), recent clones
   and commits.
4. Check that nothing sensitive was committed (`npm run validate` scans for token patterns).

## Routine checks (monthly)

- Dependabot PRs (npm in `app/`, `broker/`, and GitHub Actions) are reviewed and merged.
- Dashboard: devices with snapshots older than 30 days are re-captured.
- Collaborator list is reviewed.
- Token expiries: owner prototype token rotated (90 days or less).
