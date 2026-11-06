# GitHub setup

Version 0.1 · 2026-11-06 · Status: steps documented · public repository NOT CREATED (REQUIRES APPROVAL)

Legend: **[Owner]** = manual action by the repository owner · **[Auto]** = done by workflows.

## 1. Private IT repository (exists)

`fariesen/company-of-1-it` (private, default branch `main`). It is the authoritative source of truth.
Locally the changes prepared on 2026-11-06 are **uncommitted**: `config/`, `schemas/`,
`inventory/ai-computers/AIC-001/`, `agent/windows/`, `tools/validate-content/`, `.github/workflows/`.

**[Owner]** Commit them on a branch and merge through a pull request:

```powershell
cd "C:\The Company of 1\IT"
git switch -c it-hub/initial
git add config schemas inventory agent tools .github README.md
git status            # review: no secrets, no tool output
git commit -m "Add IT Hub configuration, schemas, AIC-001 record, Windows agent and validation"
git push -u origin it-hub/initial
gh pr create -R fariesen/company-of-1-it --fill
```

**[Auto]** `validate-content.yml` and `agent-windows.yml` run on the PR (read-only permissions).

## 2. Public hub repository (to be created)

**What becomes public:** everything under `it-hub/`, which is the PWA source and build, the broker
source (no secrets), the docs and the workflows. **Not included:** inventory, private config,
internal docs, credentials. `npm run check:public` verifies the build output.

**[Owner]** Check that the name is free, then create and push:

```powershell
gh repo view fariesen/company-of-1-it-hub    # must fail with "Could not resolve"
cd "C:\The Company of 1\it-hub"
git init -b main
git add .
git status            # review the file list
git commit -m "IT Hub PWA, token broker (not deployed) and documentation"
gh repo create fariesen/company-of-1-it-hub --public --source . --remote origin --push `
  --description "The Company of 1 IT Hub - installable PWA (data stays in a private repository)"
```

Then enable Pages (see [github-pages.md](github-pages.md)).

## 3. Granting access to an employee

1. The employee needs a GitHub account (personal account, own identity).
2. **[Owner]** Grant **read** access to the private repository:
   ```powershell
   gh api -X PUT repos/fariesen/company-of-1-it/collaborators/USERNAME -f permission=pull
   ```
   On a personal-account repository GitHub may grant collaborators broader rights than `pull`;
   check under *Settings → Collaborators*. An organisation gives finer roles (see
   [authentication.md](authentication.md), option C).
3. The employee accepts the invitation (e-mail or <https://github.com/notifications>).
4. The employee opens the IT Hub and signs in. **Prototype limitation:** until the GitHub App is
   enabled, collaborators cannot sign in (fine-grained tokens cannot target another user's repository).

## 4. Revoking access

```powershell
gh api -X DELETE repos/fariesen/company-of-1-it/collaborators/USERNAME
gh api repos/fariesen/company-of-1-it/invitations --jq '.[] | "\(.id) \(.invitee.login)"'   # pending invitations
gh api -X DELETE repos/fariesen/company-of-1-it/invitations/INVITATION_ID
```

The IT Hub re-checks access on every refresh and hides the content when access is gone. A token
already issued stays valid for other public data until it expires or is revoked. GitHub App tokens
expire after 8 hours. The user can revoke them at <https://github.com/settings/apps/authorizations>.

## 5. GitHub Free notes

- GitHub Pages is free for **public** repositories. Pages from a private repository needs a paid plan, and
  the site would still be publicly reachable, so this is not used.
- Actions minutes: public repositories are free. The private repo's validation workflows use the
  included Free minutes (a few minutes per push).
