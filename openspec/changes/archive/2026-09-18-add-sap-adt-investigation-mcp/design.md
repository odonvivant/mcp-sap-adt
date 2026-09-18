## Context

See `proposal.md` - Why for motivation. Relevant constraints not restated there:

- This repo is a **thin composition layer**: `sap-adt-client` (repo 1) supplies
  `AdtConnection`/`AdtAuth`/`AdtHttp`/`operations/`/`AdtError`; `mcp-guardrails` (repo 2) supplies
  the generic `RiskTier`/`GuardrailPolicy`/`ConfigPolicy`/`ElicitationPolicy`/`CompositeGuardrail`
  chain. Both are consumed as git dependencies (tagged, not npm-registry). Neither repo's code
  exists yet at the time this change is written — this design specifies the integration contract
  (`IAdtGateway`, how repo 3's tiering plugs into repo 2's `CompositeGuardrail`) so that repo 3's
  own module boundaries, specs, and tasks are not blocked on repo 1/2 implementation, while actual
  tool-module implementation tasks are.
- Dependency trust policy (from `openspec/config.yaml`): `@modelcontextprotocol/sdk`, Node
  built-ins, `zod`, `jest`/`ts-jest`, and the two sibling repos are the only allowed dependencies.
  No new dependency may be introduced by this design without flagging it first — none is needed.
- No code is copied from the two existing reference servers (`mcp-abap-adt`,
  `mcp-abap-abap-adt-api`); they may be read for comparison only.

## Goals / Non-Goals

**Goals:**
- Define the module boundaries inside `src/config/`, `src/guardrails/`, `src/tools/`, and
  `server.ts` precisely enough that `mcp-coder` can implement against this design without
  re-deriving architecture decisions.
- Define the exact seam (`IAdtGateway`) between tool modules and `sap-adt-client`, and the exact
  seam between `AdtRiskTiers`/`GuardrailConfig` and `mcp-guardrails`' generic engine.
- Define the `systems.json` shape and setup-wizard behavior precisely (per `openspec/config.yaml`
  rule: call these out as explicit tasks, not an afterthought).

**Non-Goals:**
- Implementing `sap-adt-client` or `mcp-guardrails` themselves (separate repos/changes).
- Wave 2 (companion skill + investigation agent) — out of scope for this change, planned
  separately once Wave 1 ships.
- npm-registry publishing, a GUI/dashboard, native HANA/XSA artifacts — excluded per the build
  plan's Non-goals.

## Decisions

### D1: `IAdtGateway` is a single interface wrapping repo 1's `operations/` functions, one method per operation
**Decision**: `IAdtGateway` exposes one method per ADT operation family (mirroring repo 1's
`operations/` directory: `discovery`, `search`, `objectSource`, `ddic`, `usageReferences`,
`transports`, `packages`, `atc`, `revisions`, `objectManagement`, `debugger`, `git`, `unitTest`,
`refactor`), each taking `(system: ResolvedSystem, args)` and returning repo 1's typed result or
`AdtError`. A single `AdtGateway` class implements it by resolving the `system` alias via
`SystemRegistry` and delegating to the matching repo-1 `operations/` function with that system's
cached `AdtConnection`.

**Why**: Dependency Inversion is the mechanism that lets `CompositeGuardrail` and `AdtError`
normalization apply uniformly (per the plan's Architecture section) — tools call `IAdtGateway`,
never `sap-adt-client` directly. One implementation is still worth the interface here because the
interface's job is testability (tools can be unit-tested against a fake gateway with zero ADT
dependency) and the guardrail-wrapping seam, not hypothetical alternate ADT clients.

**Alternatives considered**: Tools importing repo 1's `operations/` directly and having
`CompositeGuardrail` wrap the MCP `Tool.execute` boundary instead of the gateway. Rejected —
it would work for guardrail enforcement but leaves `AdtError` normalization and system resolution
duplicated in every tool module instead of centralized once.

### D2: Guardrail wrapping happens once, in `ToolRegistry`, not per tool module
**Decision**: Individual tool modules (`src/tools/search/`, `src/tools/objectSource/`, etc.)
implement the `Tool` interface (`name`, `riskTier`, `inputSchema`, `execute(gateway, args)`) and
know nothing about guardrails. `ToolRegistry.register(tool)` wraps every tool's `execute` in
`CompositeGuardrail.check(tool.riskTier, system, context) -> proceed/deny` before calling the raw
`execute`, and wraps the result/thrown `AdtError` into the normalized tool-response shape.

**Why**: Chain of Responsibility (guardrail) and error normalization are cross-cutting; applying
them at the registry boundary means every current and future tool gets both for free and cannot
accidentally skip them (the concern raised in `tools` spec's "no path that bypasses them").

**Alternatives considered**: Each tool module calling the guardrail itself. Rejected — repeats the
same three lines in ~13 domains and makes it possible for a new tool to forget the check.

### D3: `AdtRiskTiers` is a static lookup table (tool name → tier), not a computed policy
**Decision**: `AdtRiskTiers.ts` exports a plain `Record<ToolName, RiskTier>` covering every tool
registered by `ToolRegistry`, populated per the tier table in `proposal.md`/`specs/tools/spec.md`.
`GuardrailConfig` reads a system's `mode`/`allowPackages`/`denyPackages`/`allowObjectTypes` from
`SystemRegistry` and constructs repo 2's `ConfigPolicy` with that data; `AdtRiskTiers` supplies the
per-tool tier repo 2's `CompositeGuardrail` needs to decide A/B/C handling.

**Why**: Tier assignment is a fixed editorial decision per the proposal's rules requirement ("state
which risk tier each newly-added tool falls into and why"), not something computed from call
arguments — keeping it a static table makes the assignment auditable in one file and matches
`specs/tools/spec.md`'s "tier is fixed per tool, not per call" requirement.

**Alternatives considered**: Deriving tier from the ADT operation's HTTP verb at runtime (GET =
A, POST/PUT = B, DELETE = C). Rejected — collapses distinctions the plan draws explicitly (e.g.
`createAtcRun` is a POST but Tier B, not C; `activate` might be POST but is Tier C) and would need
per-tool overrides anyway, so the static table is simpler and more honest about being an editorial
call.

### D4: `systems.json` shape and setup wizard
**Decision**: `systems.json` is a flat JSON object keyed by system alias, each value matching the
Zod schema implied by `adt-connectivity`'s spec:
```jsonc
{
  "<alias>": {
    "url": "https://host:port",
    "client": "100",
    "auth": { "type": "basic", "user": "...", "password": "..." }
      // or: { "type": "cert", "pfx": "./certs/x.pfx", "passphrase": "..." }
      // or: { "type": "cert", "cert": "./certs/x.pem", "key": "./certs/x.key" }
    "mode": "read-only" | "guarded" | "open"   // default "guarded" if omitted
    "allowPackages": ["Z*"], "denyPackages": [], "allowObjectTypes": []   // optional
  }
}
```
A credential field's value may instead be an `"env:VAR_NAME"`-style reference, resolved at load
time (per `adt-connectivity`'s env-resolution requirement). `scripts/setup.ts` uses
`readline/promises` to loop: prompt alias → url → client → auth type → auth fields → mode →
optional package/object-type scoping → "add another system? (y/n)". It builds the object in
memory (never printing collected secret values back), validates it against the same Zod schema
`SystemRegistry` uses, and writes it with restrictive file mode where the platform supports it.
`.gitignore` includes `systems.json` from repo scaffolding.

**Why**: Reusing the exact `SystemRegistry` Zod schema for wizard-output validation guarantees the
wizard can never produce a file the server then rejects (closes the loop `distribution` spec's
"wizard output is immediately valid" requirement demands).

### D5: Spec split across four capability paths, one proposal/design/tasks
**Decision**: `specs/adt-connectivity`, `specs/guardrails-integration`, `specs/tools`,
`specs/distribution` as four independent capability specs, but a single `proposal.md`, `design.md`,
`tasks.md` narrating the whole change.

**Why**: The scope (SystemRegistry, guardrail plumbing, ~13 tool domains, setup + 4-harness docs)
is too broad for one spec file to stay legible, but it is one coherent change (Milestone 11-17 in
the build plan) — splitting proposal/tasks would fragment a single implementation effort into
artificial sub-changes with no independent value.

## Risks / Trade-offs

- **[Risk] Repo 1/2 don't exist yet at spec-writing time** → Mitigation: this design fixes the
  integration contracts (`IAdtGateway` method shape, `CompositeGuardrail` call shape) precisely
  enough to code repo 3's own modules and fakes against now; `tasks.md` marks tool-module tasks
  that need real repo 1/2 releases as blocked on those repos' `v0.1.0` tags, consistent with
  Milestone 11 running in parallel with repos 1-2 per the build plan.
- **[Risk] Static `AdtRiskTiers` table drifts from actual operation risk as new tools are added**
  → Mitigation: `specs/tools/spec.md`'s scenario requires the tier to be exercised by a test per
  tool; `mcp-tester` is expected to assert every registered tool has a table entry (no silent
  default tier).
- **[Risk] `${input:...}` secrets in `.vscode/mcp.json` still land in VS Code's own settings
  storage, not just prompted** → Mitigation: documented as a known VS Code MCP behavior in the
  README troubleshooting section, not something this repo controls; the deep-link badge and
  template avoid hardcoding secrets in the *repo*, which is the scope this change controls.
- **[Risk] Fail-closed elicitation fallback (Tier C denied by default) may surprise users on
  clients without elicitation support** → Mitigation: `specs/guardrails-integration`'s scenario
  requires the denial reason to explicitly say confirmation could not be obtained, not a bare
  denial.

## Migration Plan

Greenfield change in a fresh repo — no existing users or data to migrate. Sequencing:
1. `SystemRegistry`/`GuardrailConfig`/`AdtRiskTiers` (needs only `zod`, no repo 1/2 dependency).
2. `IAdtGateway` interface + a test fake (needs only the interface shape, not repo 1's real impl).
3. `ToolRegistry` + tool modules (needs real repo 1 `v0.1.0` + repo 2 `v0.1.0` tags to wire for
   real; can be developed against the fake gateway/guardrail until then).
4. `scripts/setup.ts` + `server.ts` wiring.
5. README + install docs.
Rollback is trivial pre-release (delete the change / revert commits); no deployed state exists.

## Open Questions

- Git-dependency URLs resolved to `github.com/odonvivant/sap-adt-client` and
  `github.com/odonvivant/mcp-guardrails`. `#<tag>` stays a placeholder until each repo cuts its
  first tagged version (e.g. `v0.1.0`) — that's a `package.json` edit at that point, not a design
  question.
