# mcp-sap-adt

MCP server for **investigating and mapping SAP ECC / S/4HANA ABAP systems via ADT** — source and
dependency discovery, where-used analysis, transport content inspection, and ATC-based
custom-code checks. Built for custom-code migration assessments and transport/object dependency
checks, across as many named systems (dev/qas/prd/...) as you configure, from one server process.

Every mutating or risky tool is gated by a **guardrail layer**: a per-system mode
(`read-only`/`guarded`/`open`) plus, on a `guarded` system, a live confirmation prompt (MCP
elicitation) before a Tier B/C call executes. Every ADT failure comes back as a structured,
actionable error (HTTP status, SAP's own message, a plain-language hint) — never a bare
"request failed".

This repo is a thin composition layer over two independently-releasable libraries:

- **[`sap-adt-client`](https://github.com/odonvivant/sap-adt-client)** — the ADT protocol client
  (session/CSRF/auth/XML parsing/operations), written from scratch, zero SAP-domain third-party
  dependencies.
- **[`mcp-guardrails`](https://github.com/odonvivant/mcp-guardrails)** — a generic, protocol-
  agnostic risk-tiered guardrail/elicitation engine, usable by any MCP server, not just this one.

`mcp-sap-adt` itself only supplies what's SAP/ADT-specific: the named-system registry, the
per-tool risk tiers, the ~40 ADT tools, server wiring, the setup wizard, and this documentation.
See [Architecture](#architecture) for why the split.

## Quickstart

```bash
git clone https://github.com/odonvivant/mcp-sap-adt.git
cd mcp-sap-adt
npm install && npm run build && npm run setup
```

`npm install` pulls `sap-adt-client` and `mcp-guardrails` as git dependencies — no npm-registry
publish needed. `npm run setup` runs an interactive wizard that asks, per system: alias, base URL,
SAP client, auth type (username/password or client certificate), credentials/cert paths, and
guardrail mode — then writes `systems.json` (git-ignored, never committed, never logged/echoed
back). Add as many systems as you like in one run.

Then point any of the harnesses below at `dist/src/server.js`.

## Claude Desktop

Add to your `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-sap-adt/dist/src/server.js"]
    }
  }
}
```

Restart Claude Desktop. `systems.json` must already exist in the repo's working directory (from
`npm run setup`) — the server reads it relative to its own `cwd`, which Claude Desktop sets to the
directory containing `dist/src/server.js`'s ancestor unless you also pass a `cwd` field; if tools
report "no systems configured", set an explicit `"cwd": "/absolute/path/to/mcp-sap-adt"` alongside
`command`/`args` above.

## Claude Code

One-liner:

```bash
claude mcp add sap-adt -- node /absolute/path/to/mcp-sap-adt/dist/src/server.js
```

Or add directly to `.mcp.json` in your project (or `~/.claude.json` for a user-level server):

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-sap-adt/dist/src/server.js"]
    }
  }
}
```

Run `npm run setup` inside `mcp-sap-adt` first (once) so `systems.json` exists before Claude Code
connects.

## VS Code / GitHub Copilot

This is the simplest path to set up: VS Code has native MCP support, and this repo ships a ready
template.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_mcp--sap--adt-0098FF?logo=visualstudiocode\&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22sap-adt%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22node%22%2C%22args%22%3A%5B%22%24%7BworkspaceFolder%7D%2Fdist%2Fsrc%2Fserver.js%22%5D%7D)

Or manually: this repo already includes [`.vscode/mcp.json`](.vscode/mcp.json). Open the folder in
VS Code, open the Command Palette → **MCP: List Servers** → start `sap-adt`. VS Code will prompt
you for the two `${input:...}`-declared secrets (username/password) via its own secret-entry UI —
nothing is typed into a file.

Before first use, run `npm run setup` once and, when prompted for the dev system's credentials,
enter them as environment references (`env:SAP_ADT_DEV_USER` / `env:SAP_ADT_DEV_PASSWORD`) instead
of literal values — this is what lets `systems.json` stay free of secrets while VS Code supplies
them at launch through the input prompts. If you'd rather enter literal credentials once via the
wizard (still git-ignored, never committed), that also works and you can skip the `${input:...}`
step in `.vscode/mcp.json`.

> **Known VS Code behavior**: `${input:...}` prompts avoid a *hardcoded* secret in this repo's
> template, but VS Code itself still stores what you enter in its own settings/secret storage once
> you answer the prompt — that's VS Code's mechanism, not something this repo controls.

## Cline

In Cline's MCP settings (`cline_mcp_settings.json`, via the Cline extension's MCP Servers panel):

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-sap-adt/dist/src/server.js"],
      "disabled": false
    }
  }
}
```

Run `npm run setup` inside `mcp-sap-adt` first so `systems.json` exists.

## Guardrails at a glance

Every tool requires a `system` parameter (the alias you gave it during setup) and has a fixed risk
tier:

| Tier | Meaning | Examples |
|---|---|---|
| A | Read-only, no mutation, no meaningful data-exposure/execution risk | discovery, search, object source read, DDIC metadata, usage references, package contents, transport/revision/ATC-worklist read, abapGit repo listing, syntax check, code completion, trace list/hit list/DB access |
| B | Creates state but doesn't touch source/transports, or a read/cleanup carrying more than plain-metadata risk | table data query, ATC run creation, transport creation, rename/extract-method preview, object unlock, debugger breakpoint removal, trace configuration creation/deletion |
| C | Destructive, production-impacting, or executes arbitrary customer code | object create/delete/lock/activate, source write, transport release, abapGit pull/push, unit test run, debugger attach/step/set-breakpoints/variables/set-variable-value, rename/extract-method execute |

Per-system `mode`:

- **`read-only`** — Tier B/C calls are always denied, no confirmation can override it.
- **`guarded`** (default) — Tier B/C calls require a live confirmation prompt (MCP elicitation). If
  the connected client doesn't support elicitation, the call is denied by default (fails closed,
  never silently allowed).
- **`open`** — Tier B/C calls proceed without a prompt, but every call is logged (to stderr).

`allowPackages`/`denyPackages` (prefix match, e.g. `"Z*"`) and `allowObjectTypes` further narrow
Tier B/C calls within any mode, and are checked before any confirmation prompt.

## Tool verification status

Every operation `sap-adt-client` implements has fixture-based unit tests, but this project's own
history shows that isn't sufficient by itself — several operations passed every fixture test while
being structurally wrong against a real system (wrong endpoint, wrong `Accept` header, wrong
request/response shape). Treat this table as the actual trust level, not the test suite:

| Status | Tools |
|---|---|
| **Live-verified** | discovery, search, DDIC metadata + table contents (with `sqlQuery` filter), usage references, package contents, revisions, transport info/create, ATC run/worklist, syntax check, code completion, object source read/write, object create/lock/unlock/activate/delete, traces list |
| **Draft / unverified** | `adt_debugger_*` (attach/breakpoints/variables/set-variable-value) — no live test rig exists for this; attaching a debugger needs an actual running ABAP process to pause, which nothing in this MCP triggers on its own. `adt_git_*` (repos/pull/push) — needs an existing abapGit-linked repository to test against; none was available during this project's live-testing pass. |

Draft-status tools are still guardrail-gated and reachable, but treat a failure from one of them as
at least as likely to be a real protocol bug in `sap-adt-client` as a problem with your call - file
an issue (or fix it the same way this project's history shows: read the real HTTP response,
compare against `abap-adt-api`'s implementation of the same call for protocol understanding
without depending on it, live-verify the fix) rather than assuming it's user error.

## Troubleshooting

Every ADT failure and every guardrail denial comes back as tool response text with enough detail
to self-diagnose:

| You see | What it means | What to do |
|---|---|---|
| `ADT request failed (HTTP 401/403)` / "Authentication or authorization failed" | Bad credentials, expired cert, or the SAP user lacks ADT/authorization-object access for that operation | Re-run `npm run setup` to re-enter credentials, or check the SAP user's ADT/developer authorizations |
| `ADT request failed (HTTP 404)` / "Object not found..." | The object/transport doesn't exist in that system/client, or you targeted the wrong `system` alias | Double-check the object URI/name and which `system` alias you used |
| `ADT request failed (HTTP 400)` with a "Check messages:" list | A syntax check or activation failed - the listed messages are the actual ABAP compiler/check errors | Fix the reported line(s); this is not a connectivity problem |
| `Guardrail denied this call [read-only]` | The target system's `mode` is `read-only`; Tier B/C is blocked unconditionally | Use a `guarded`/`open` system, or change that system's `mode` in `systems.json` if that's intended |
| `Guardrail denied this call [scope]` | The target package/object type is outside that system's `allowPackages`/`denyPackages`/`allowObjectTypes` | Adjust the scope config in `systems.json`, or target an in-scope object |
| `Guardrail denied this call [declined-confirmation]` | You (or whoever answered the elicitation prompt) declined the confirmation | Re-invoke and accept the prompt if the call was actually intended |
| `Guardrail denied this call [no-elicitation-support]` | The connected MCP client doesn't support confirmation prompts, so a `guarded` Tier B/C call is denied by default (fail closed) | Use a client with elicitation support, or set that system's `mode` to `open` if you accept the risk |
| `No systems configured (...)` on startup | `systems.json` doesn't exist yet | Run `npm run setup` |
| Unexpected error / a raw exception message | Something outside ADT/guardrail handling (e.g. a network-level failure before any HTTP response) | Check basic connectivity (VPN, hostname, port) to the SAP system |

## Architecture

```
sap-adt-client   - ADT protocol client (CSRF/session/auth/XML), no MCP or guardrail awareness
mcp-guardrails   - generic risk-tiered guardrail/elicitation engine, no ADT awareness
mcp-sap-adt      - this repo: SystemRegistry, AdtRiskTiers/GuardrailConfig, the tool inventory,
                   server wiring, setup wizard - the only place ADT and MCP guardrails meet
```

Each is independently versioned and releasable (tagged, git-dependency install - no npm registry
publish for v1). Splitting them out means a fix to session/CSRF handling, or to the guardrail
engine itself, ships and is testable on its own, without touching or re-releasing this repo - and
either library is reusable outside this MCP server (a plain ADT client; a generic MCP guardrail
engine for a different domain entirely).

Inside this repo: tool modules under `src/tools/` never call `sap-adt-client` directly - they go
through `IAdtGateway` (`src/gateway/`), and `ToolRegistry` (`src/tools/ToolRegistry.ts`) is the
single choke point that applies the guardrail check and normalizes every result before a tool's
`execute` ever runs. See `openspec/changes/add-sap-adt-investigation-mcp/design.md` for the full
set of design decisions.

## Development

```bash
npm test              # jest
npm test -- --coverage
npm run build          # tsc -> dist/
```
