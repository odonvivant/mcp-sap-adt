## Why

Two existing ABAP ADT MCP servers (`mcp-abap-adt`, `mcp-abap-abap-adt-api`) are hand-rolled or
wrap an unofficial third-party SAP-domain library, run one process per system, and gate nothing —
any connected agent can lock, edit, delete, or release a transport in a production system with no
guardrail. `mcp-sap-adt` replaces both with a single multi-system server built on two independently
releasable, trusted foundations (`sap-adt-client`, `mcp-guardrails`), where every mutating/risky
tool is gated by config and, where the client supports it, live confirmation, and every ADT failure
surfaces as a structured, actionable error instead of a bare stack trace.

## What Changes

- Add `SystemRegistry`: named systems (`dev`/`qas`/`prd`/...) loaded from `systems.json` + env
  overrides, Zod-validated, each with `url`/`client`/`auth` (basic or client-cert/mTLS) and a
  guardrail `mode` (`read-only`/`guarded`/`open`).
- Add `GuardrailConfig` + `AdtRiskTiers`: the ADT-specific risk-tier assignment (A = read-only, B =
  state-changing-but-reversible/inspectable, C = destructive/production-impacting) plugged into
  `mcp-guardrails`' generic `CompositeGuardrail`/`ConfigPolicy`/`ElicitationPolicy` chain.
- Add `IAdtGateway`: the Dependency Inversion seam between tool modules and `sap-adt-client`'s
  `operations/`, so no tool touches the client library directly.
- Add `ToolRegistry` + one tool module per ADT domain (search, object source, DDIC/table/CDS +
  table contents, usage references, packages, transports, revisions, ATC, discovery, syntax
  check, code completion, object management, debugger, git/abapGit, unit test, refactor). Every
  tool's input schema requires a `system` parameter. Risk tiers:
  - **Tier A** (read-only, no guardrail prompt regardless of mode): discovery, search, object
    source read, DDIC/table/CDS metadata, table contents/query, usage references, package/node
    hierarchy, transport inspection (read), revisions (read), ATC worklists (read), syntax check,
    code completion. These are the tools the investigation/migration-assessment use case needs
    day one and carry no mutation risk.
  - **Tier B** (state-changing but reversible/inspectable; requires confirmation on `guarded`
    systems, blocked on `read-only`): `createAtcRun`, `unitTestRun`, trace creation/configuration.
    These write objects (a run, a trace) but do not touch source code or transports.
  - **Tier C** (destructive or production-impacting; requires confirmation on `guarded`, blocked
    on `read-only`, and denied by default if the connected client lacks elicitation support):
    object create/delete, source edit, lock/unlock, activate, transport release,
    abapGit push, debugger attach/step/variable-set, refactor (rename/extract-method). These
    mutate source, release changes, or attach a live debugger to a running system.
- Add `server.ts` wiring `SystemRegistry` + guardrails + `ToolRegistry` into an
  `@modelcontextprotocol/sdk` stdio server.
- Add `scripts/setup.ts`: interactive first-run wizard (Node's built-in `readline/promises`) that
  prompts per system (alias, URL, client, auth type, credentials/cert paths, mode) and writes
  `systems.json`, never logging or echoing secrets.
- Add full install documentation: Claude Desktop, Claude Code, VS Code/GitHub Copilot
  (`.vscode/mcp.json` with `${input:...}` secrets + an install deep-link badge), Cline, and a
  troubleshooting section keyed to the `AdtError` shape (401/403/404/syntax-error/guardrail-denied).

## Capabilities

### New Capabilities
- `adt-connectivity`: `SystemRegistry` (systems.json + env, Zod schema, auth strategies) and the
  `IAdtGateway` seam that wires an `AdtConnection`/`AdtAuth` session per system alias.
- `guardrails-integration`: `GuardrailConfig` + `AdtRiskTiers` plugging ADT-specific tiering into
  `mcp-guardrails`' generic `CompositeGuardrail`, and the per-system `mode` enforcement.
- `tools`: `ToolRegistry`, the per-domain tool modules, the full per-tool risk-tier table, and
  `AdtError` surfacing at the tool-response boundary.
- `distribution`: `scripts/setup.ts` wizard, `systems.json` shape/lifecycle, and README/install
  coverage across all four harnesses plus troubleshooting.

### Modified Capabilities
(none — this is the first change in a greenfield repo)

## Impact

- New repo-local code: `src/config/`, `src/guardrails/`, `src/tools/`, `src/server.ts`,
  `scripts/setup.ts`.
- New runtime dependencies (git-dependency, not npm registry):
  `sap-adt-client` (`git+https://github.com/odonvivant/sap-adt-client.git#v0.1.0`),
  `mcp-guardrails` (`git+https://github.com/odonvivant/mcp-guardrails.git#v0.1.0`). Both are now
  built, tested, tagged `v0.1.0`, and pushed; this change specifies the integration contract (`IAdtGateway`,
  `CompositeGuardrail` usage) — both dependencies are now real, tagged releases, so implementation
  of the tool modules is unblocked.
- New dev dependency surface: none beyond what's already allowed (`zod`,
  `@modelcontextprotocol/sdk`, `jest`/`ts-jest`, Node built-ins).
- New user-facing artifact: `systems.json` (git-ignored, user-local, contains credentials/cert
  paths — never committed, never logged).
- New docs: root `README.md`, `.vscode/mcp.json` template.
