# Authentication and authorization

Version 0.1 · 2026-11-06 · Status: Token prototype IMPLEMENTED + TESTED · GitHub App flow IMPLEMENTED, **REQUIRES APPROVAL** (broker hosting) · real GitHub OAuth NOT TESTED

## 1. Feasibility finding (security gate)

**Question:** can a public, static GitHub Pages PWA securely sign in individual GitHub users and read
a private repository using only GitHub Free?

**Answer:** No, not with an automatic GitHub login. Reading the data works (`api.github.com`
supports CORS). Obtaining a user token in the browser does not.

| Fact | Source / evidence |
|---|---|
| The web-flow token exchange (`POST https://github.com/login/oauth/access_token`) requires `client_secret`, also for GitHub Apps and also when PKCE is used | GitHub Docs, "Authorizing OAuth apps" and "Generating a user access token for a GitHub App" (checked 2026-11-06) |
| The token endpoint and `POST https://github.com/login/device/code` send **no CORS headers**, so browser JavaScript cannot read their responses (this blocks the device flow too, even though it needs no secret) | Tested 2026-11-06 with `curl` (`OPTIONS` and `POST` with `Origin`: no `Access-Control-Allow-Origin`). Docs: "CORS pre-flight requests (OPTIONS) are not supported at this time." |
| `api.github.com` allows CORS with an `Authorization` header (`Access-Control-Allow-Origin: *`) | Tested 2026-11-06 |
| Fine-grained personal access tokens can only target repositories owned by the token owner's account or an organisation, so a collaborator cannot create one for `fariesen/company-of-1-it` | GitHub Docs, "Managing your personal access tokens" |
| Classic tokens with `repo` scope grant access to **all** of a user's private repositories | GitHub Docs; too broad, so the app refuses them |

**Conclusion:** secure automatic sign-in needs a confidential component that holds the client
secret. Putting the secret in the static site, or using an unauthenticated public CORS proxy, is
not acceptable.

## 2. What is implemented

### 2a. Prototype: fine-grained token (owner only), active now

- The sign-in screen is labelled **"Prototype sign-in"**. It is an IT Hub form for a token, not an
  imitation of GitHub's login page, and it never asks for a password.
- Only `github_pat_…` tokens are accepted. Classic or OAuth tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) are refused
  before any network request.
- Recommended token: resource owner `fariesen`, *Only select repositories* →
  `company-of-1-it`, **Contents: Read-only** (Metadata: read is added automatically), expiry
  of 90 days or less.
- Storage: `sessionStorage` by default, or `localStorage` if "Remember this token" is ticked.
- Logout forgets the token locally. To **revoke** it, delete it at
  <https://github.com/settings/personal-access-tokens>.
- **Limitation:** only the repository owner can use this mode. It is not a production login.

### 2b. Production: GitHub App + stateless broker (code ready, not enabled)

- Flow: authorization code with PKCE (S256) and `state`. The browser redirects to
  `github.com/login/oauth/authorize`. GitHub redirects back to the app with `?code&state`. The app
  removes the code from the URL immediately, checks `state` against a pending login (single use,
  10-minute expiry), and sends `code` + `code_verifier` to the broker's `POST /token`.
- Tokens are GitHub App **user-to-server** tokens. They expire after 8 hours. Their permissions are
  the intersection of the app's permissions and installation (Contents: read, Metadata: read, only
  `company-of-1-it`) and the user's own repository access.
- The refresh token (6 months) is **kept only if the user ticks "Keep me signed in"**. Otherwise the
  user signs in again after expiry.
- Logout calls the broker's `POST /revoke`, which revokes the token at GitHub, then clears local state.
- Broker (`broker/`): stateless; exact `ALLOWED_ORIGIN` and `REDIRECT_URI`; JSON ≤ 4 KiB; no
  storage, cookies or logging; `Cache-Control: no-store`; returns only GitHub's token fields.

## 3. Authorization (applies to both modes)

A successful sign-in only proves identity. Before reading any content, the app calls
`GET /repos/fariesen/company-of-1-it` with the user's token. A 404 or 403 means **no access**: no
content is requested, and the user sees "No access to the IT repository". The same check runs on
every refresh, so removing a collaborator takes effect at the next refresh. A 401 (expired or revoked)
ends the session and wipes loaded data.

## 4. Decision required (Owner)

| Option | Login | Infra / cost | Status |
|---|---|---|---|
| **A. GitHub App + broker on Cloudflare Workers (free tier)** *(recommended)* | Automatic "Continue with GitHub" for every collaborator | New third-party provider (free tier), one secret | REQUIRES APPROVAL |
| B. GitHub App + broker on Azure Functions (Consumption plan) | Same as A | Uses Microsoft/Azure, which may already fit the M365 tenant; needs an Azure subscription | REQUIRES APPROVAL |
| C. Transfer the IT repo to a free GitHub organisation | Collaborators can create fine-grained tokens scoped to the org repo; still **manual tokens**, no automatic login | No new infrastructure; changes repository ownership and URLs | REQUIRES APPROVAL |
| D. Stay on the prototype | Owner only | None | Current state |

## 5. Enabling the GitHub App (after approval)

1. **Create the app** (manual): GitHub → Settings → Developer settings → GitHub Apps → *New GitHub App*.
   - Homepage URL: `https://fariesen.github.io/company-of-1-it-hub/`
   - Callback URL: `https://fariesen.github.io/company-of-1-it-hub/`
   - Turn on *Expire user authorization tokens*. Leave *Request user authorization during installation* off.
   - Webhook: inactive.
   - Repository permissions: **Contents: Read-only**, **Metadata: Read-only**. Nothing else.
   - Where can it be installed: *Only on this account*.
2. Generate a client secret, and store it **only** in the broker's secret store.
3. **Install the app** on `fariesen` → *Only select repositories* → `company-of-1-it`.
4. **Deploy the broker** (see `broker/README.md`). Set `GITHUB_CLIENT_ID`, `ALLOWED_ORIGIN=https://fariesen.github.io`,
   `REDIRECT_URI=https://fariesen.github.io/company-of-1-it-hub/`, and the secret.
5. **Update `app/public/config/bootstrap.json`:**
   ```json
   "auth": {
     "methods": ["github-app", "fine-grained-token"],
     "githubApp": {
       "clientId": "Iv23li...",
       "brokerUrl": "https://<broker-host>/",
       "redirectUri": "https://fariesen.github.io/company-of-1-it-hub/"
     }
   }
   ```
6. **Allow the broker in the CSP.** Set the repository variable used by `pages.yml`:
   `gh variable set IT_HUB_BROKER_ORIGIN -R fariesen/company-of-1-it-hub -b https://<broker-host>`.
   The build adds it to the Content Security Policy `connect-src`. Then push to `main` (or re-run the workflow).
7. Verify on every platform, especially an **installed iOS PWA** (section 6). Then optionally remove
   `fine-grained-token` from `methods`.

## 6. Platform notes

- **iOS / iPadOS installed PWA:** storage is separate from Safari, so the user signs in once inside
  the app. `sessionStorage` is lost when the app is closed from the app switcher, so the user must
  sign in again unless they chose "remember". The redirect from the standalone app to
  `github.com` and back may open or return in a different browsing context. The pending login is kept in
  `localStorage` to tolerate this, but **this has not been tested on a real device** and must be
  verified before production.
- Android and desktop Chromium installed apps share storage with the browser profile.

## 7. Not tested

Real GitHub OAuth / GitHub App sign-in (no app or broker exists yet). Real iOS and Android devices.
All OAuth tests use a mocked broker and only prove the app's handling of responses.
