# IT Hub token broker

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, unit-TESTED (mocked GitHub), **NOT DEPLOYED - requires Owner approval**

A stateless function that lets the IT Hub PWA complete the GitHub App sign-in. It exists only
because GitHub's token endpoint (`https://github.com/login/oauth/access_token`) needs the client
secret, even with PKCE, and does not support CORS. A static GitHub Pages site can't do that exchange on its own.

## What it does

| Endpoint | Input (JSON) | Action |
|---|---|---|
| `POST /token` | `code`, `code_verifier`, `redirect_uri` | Exchanges an authorization code (PKCE) for a user access token |
| `POST /refresh` | `refresh_token` | Exchanges a refresh token for a new user access token |
| `POST /revoke` | `access_token` | Revokes the token (`DELETE /applications/{client_id}/token`) at sign-out |

## What it does not do

- It doesn't store anything (no database, KV or cookies).
- It doesn't log request or response bodies, and it never echoes tokens or upstream errors. Errors are short codes only.
- It doesn't proxy repository content. The PWA reads `api.github.com` directly with the user's own token.
- It grants no access on its own. Access is the overlap of the GitHub App's installation (only on
  `fariesen/company-of-1-it`, Contents: read, Metadata: read) and the user's own repository permissions.

## Hardening

- CORS accepts exactly one origin (`ALLOWED_ORIGIN`). Requests from any other origin, or with no origin, get `403`.
- `redirect_uri` must exactly match `REDIRECT_URI`.
- Only `application/json` bodies are accepted, up to 4 KiB, and input fields must match strict patterns.
- Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

## Configuration

| Variable | Kind | Example |
|---|---|---|
| `GITHUB_CLIENT_ID` | plain | `Iv23li...` |
| `GITHUB_CLIENT_SECRET` | **secret** | set via the provider's secret store only |
| `ALLOWED_ORIGIN` | plain | `https://fariesen.github.io` |
| `REDIRECT_URI` | plain | `https://fariesen.github.io/company-of-1-it-hub/` |

## Development

```sh
npm ci
npm run typecheck
npm test
```

## Deployment (only after Owner approval)

The module is a Web-standard `fetch(request, env)` handler.

- **Cloudflare Workers** (free tier): copy `wrangler.toml.example` to `wrangler.toml`, then run
  `npx wrangler secret put GITHUB_CLIENT_SECRET` and `npx wrangler deploy`.
- **Deno Deploy / Bun:** wrap it with `Deno.serve((req) => broker.fetch(req, env))` and read `env` from environment variables.
- **Azure Functions (Node 20+, v4 programming model):** register an HTTP trigger that passes the
  `HttpRequest` (converted to a `Request`) to `broker.fetch` with the env values from App Settings
  (put the secret in Key Vault references).

After deploying, set the broker URL in the PWA build configuration. See `docs/authentication.md`.
