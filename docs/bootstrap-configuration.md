# Bootstrap configuration (two stages)

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, TESTED (`bootstrap.test.ts`, `content.test.ts`, local IT content test)

The configuration separates *where things are* from the application code. **It is not an access
control mechanism.** Access is decided only by GitHub permissions.

| Stage | File | Visibility | Loaded |
|---|---|---|---|
| 1 | `app/public/config/bootstrap.json` → served as `config/bootstrap.json` | **Public** | Before sign-in, same origin, no credentials |
| 2 | `config/it-hub.json` in `fariesen/company-of-1-it` | **Private** | After sign-in and the access check, with the user's token |

## Stage 1: public locator

```json
{
  "schemaVersion": 1,
  "bootstrap": { "provider": "github", "owner": "fariesen", "repository": "company-of-1-it", "ref": "main", "path": "config/it-hub.json" },
  "auth": { "methods": ["fine-grained-token"] }
}
```

| Field | Rules |
|---|---|
| `schemaVersion` | Must be `1`. Other values show "Unsupported configuration version". |
| `bootstrap.owner` | Must be on the **built-in allowlist** (`ALLOWED_OWNERS` in `src/lib/policy.ts`, currently `fariesen`) |
| `bootstrap.repository`, `ref` | GitHub name / branch or tag syntax |
| `bootstrap.path` | Relative `.json` path; no `..`, `\`, `:`, leading `/` |
| `auth.methods` | `fine-grained-token` and/or `github-app` |
| `auth.githubApp` | Required for `github-app`: `clientId`, `brokerUrl` (https), `redirectUri` (https). Nothing else allowed; a `clientSecret` key is rejected. |

Unknown keys are rejected everywhere.

## Stage 2: private configuration

Schema: `schemas/it-hub-config.schema.json` in the private repo (validated in CI by
`tools/validate-content`, and again by the app at runtime).

```json
{
  "schemaVersion": 1,
  "application": { "name": "The Company of 1 IT Hub", "configVersion": "2026.11.06-1" },
  "repositories": { "it": { "owner": "fariesen", "name": "company-of-1-it", "ref": "main" } },
  "sources": {
    "inventory": { "repository": "it", "path": "inventory" },
    "software": { "repository": "it", "path": "software", "catalog": "software/catalog.json" },
    "infrastructure": { "repository": "it", "path": "infrastructure" },
    "setup": { "repository": "it", "path": "setup" },
    "documentation": [ { "id": "overview", "title": "Overview", "repository": "it", "path": "README.md" } ]
  },
  "contentSchemas": { "device": [1], "snapshot": [1] },
  "agent": { "windows": { "repository": "it", "releaseTagPrefix": "agent-windows-v", "installDoc": "agent/windows/README.md" } },
  "features": { "agentStatus": true },
  "refresh": { "minIntervalSeconds": 60, "onFocus": true }
}
```

| Section | Meaning |
|---|---|
| `repositories` | Up to 10 repositories, keyed by a short id. Every owner must be on the built-in allowlist. Each repository used gets its own access check, and the load **fails closed** if one is inaccessible. |
| `sources.inventory` | Root scanned for `**/device.json` and `**/snapshots/*.json` |
| `sources.software.catalog` | Optional standard-software catalog (`{"schemaVersion":1,"packages":[{name,targetVersion,category,notes}]}`). If the file is missing, the catalog is simply skipped. |
| `sources.documentation` | Sections of Markdown docs (a path may be a folder or a single file) |
| `contentSchemas` | Accepted device and snapshot schema versions |
| `agent.windows` | Where approved agent releases are published |
| `features` | Booleans only |
| `refresh` | Foreground refresh policy (15–86400 s) |

**Safety rules:** the private config contains **no URLs** (all data is read from
`api.github.com`), no scripts or commands, and only relative, normalised paths. Nothing in either
file is executed.

## Changing the configuration

1. Edit `config/it-hub.json` in a branch and open a PR. CI validates it.
2. Bump `application.configVersion`. It is shown in *Settings*.
3. After merge, users see the change on their next refresh, without reinstalling.
4. To support a new schema version, update the app (`SUPPORTED_*` in `policy.ts`) **before**
   publishing content that uses it.
