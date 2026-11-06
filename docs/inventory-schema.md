# Inventory schema and field ownership

Version 0.1 · 2026-11-06 · Status: IMPLEMENTED, TESTED (validator: 24 tests; app parser tests; Pester validator tests)

Schemas (JSON Schema 2020-12) live in the private repository under `schemas/`:

| Schema | File(s) it validates | Owner of the data |
|---|---|---|
| `device.schema.json` | `inventory/<category>/<ID>[_HOSTNAME]/device.json` | **Human** |
| `snapshot.schema.json` | `inventory/<category>/<ID>[_HOSTNAME]/snapshots/<yyyy-MM-ddTHHmmssZ>.json` | **Agent** (never edit by hand) |
| `it-hub-config.schema.json` | `config/it-hub.json` | Human |

`DEVICE.md` next to `device.json` holds the human narrative and maintenance history.

## Device record (`device.json`, schemaVersion 1)

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `AIC-nnn` (AI computer) or `UC-nnn` (user computer). Permanent, never reused. |
| `aliases` | no | Documented legacy names only (e.g. "PC1"). `#/hub/devices/<alias>` redirects to the ID. |
| `category` | yes | `ai-computer` \| `user-computer`; must match the parent folder |
| `name` | yes | Display name |
| `hostname`, `role`, `assignedTo`, `location`, `setupProfile` | no | `assignedTo`: role or person; omit if unassigned |
| `lifecycle` | yes | `planned`, `ordered`, `active`, `maintenance`, `retired`, `disposed`, `unknown` |
| `hardware` | yes | Declared `manufacturer`, `model`, `cpu`, `ramGB` (number or `"unknown"`), `storage`, `gpu`, `os` |
| `agent` | no | `enabled` (bool), `identityHash` (`sha256:<64 hex>`) to bind agent snapshots |
| `docs` | no | Related documents, as repository-relative paths |
| `sources` | no | Evidence: `{statement, source, date}` |
| `notes` | no | Free text |
| `updated` | yes | `YYYY-MM-DD` of the last human edit |

**Unknown is explicit:** use the string `unknown`. Never guess. The IT Hub shows unknown values in
grey italics.

## Snapshot (agent output, schemaVersion 1)

`deviceId`, `collectedAt` (ISO 8601), `agent{name,version,elevated}`,
`identity{identityHash,hostname,manufacturer,model,systemType,biosVersion}`,
`os{caption,version,build,displayVersion,architecture,installDate}`, `cpu[]`, `memory{totalGB,modules[]}`,
`storage[]`, `gpu[]` (with `virtual`), `network[]` (no MAC/IP), `software[]`
(name/version/publisher), `diagnostics[]` (`ok|partial|failed|skipped`). `additionalProperties`
is false everywhere.

## Ownership rules

1. Humans edit `device.json` and `DEVICE.md`. The agent never writes them.
2. The agent only **adds** snapshot files, through a reviewed pull request.
3. The IT Hub shows the **captured** value with the **declared** value beneath it, and flags differences.
   A human resolves a difference by editing `device.json`.
4. The newest snapshot is the one with the greatest file name. Older snapshots stay as history, and
   Git history is the full change log.

## Validation

- **CI (private repo):** `tools/validate-content`. It checks the schemas, unique IDs and aliases, folder
  name and category, snapshot `deviceId` against the folder, that linked docs exist, credential patterns, and relative
  Markdown links.
- **Runtime (PWA):** malformed or unsupported records are skipped and listed as *content problems* on
  the dashboard and in Settings. They never crash the app.
- **Agent:** validates every snapshot against the schema before writing or proposing it.

## Versioning

A breaking change needs a new `schemaVersion`. Add support in the app (`policy.ts`) and in
`contentSchemas` of the private config **before** writing records with the new version.
