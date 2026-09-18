## Why

`sap-adt-client` v0.2.0 shipped 5 new operation families (`syntaxCheck`, `codeCompletion`,
`traces`, plus extensions to `refactor` and `debuggerOps`) that this server does not yet expose.
Without them, an agent using this MCP has no way to validate a source buffer before writing it,
get completion/type-info assistance while drafting a change, inspect performance/SQL traces
during an investigation, extract a method as part of a refactor, or set a variable value in an
attached debug session — each a gap against the "full ADT tool surface" goal already stated in
`specs/tools/spec.md`.

## What Changes

- Bump the `sap-adt-client` git dependency to `#v0.2.0` (fixes a systemic CSRF/session-cookie bug
  affecting every mutating call; no code change required in this repo for that fix).
- Add 11 new tools, each requiring the existing `system` parameter and routed through
  `IAdtGateway`/`ToolRegistry` exactly like every other tool:
  - `adt_syntax_check` — **Tier A**: checks a source buffer for syntax errors against an object
    URI without saving or activating it; no state is created despite being a POST (same reasoning
    already codified for `adt_ddic_table_contents`'s sibling reads and matching
    `specs/tools/spec.md`'s existing Tier A bucket, which already lists "syntax check, code
    completion").
  - `adt_code_completion_proposal`, `adt_code_completion_element_info` — **Tier A**: same
    no-side-effect reasoning as syntax check; transient analysis of a supplied buffer, nothing
    persisted.
  - `adt_traces_list`, `adt_traces_hit_list`, `adt_traces_db_access` — **Tier A**: read-only trace
    inspection (run list, timing breakdown, DB access statements) — matches `specs/tools/spec.md`'s
    Tier A read bucket.
  - `adt_traces_create_configuration` — **Tier B**: creates a transient trace run request; state is
    created but it's inspectable/reversible, same class as `adt_atc_create_run`.
  - `adt_traces_delete` — **Tier B** (not C): deletes a trace or trace configuration created by
    `adt_traces_create_configuration` (itself Tier B). Follows the existing
    `adt_object_unlock`/`adt_debugger_delete_breakpoints` precedent in `AdtRiskTiers.ts` — cleanup
    of a Tier B action is never gated harder than the action that created it, otherwise a
    confirmation decline/unsupported-elicitation leaves a stranded trace consuming system
    resources.
  - `adt_refactor_extract_method_preview` — **Tier B**: mirrors `adt_refactor_rename_preview`
    exactly (preview only, no change applied).
  - `adt_refactor_extract_method_execute` — **Tier C**: mirrors `adt_refactor_rename_execute`
    exactly (applies a previously previewed refactoring).
  - `adt_debugger_set_variable_value` — **Tier C**: mirrors the other debugger write tools
    (`adt_debugger_attach`/`adt_debugger_step`) — modifies live process state in an attached,
    stopped debug session.
- Extend `IAdtGateway`/`AdtGateway`/`FakeAdtGateway` with one method per new `sap-adt-client`
  operation.
- Extend `AdtRiskTiers.ts` with the 8 new tier assignments above.
- Update `README.md`'s tool count/list if it enumerates tools.

## Capabilities

### New Capabilities

(none — this extends the existing tool surface, not a new capability domain)

### Modified Capabilities

- `tools`: adds `adt_syntax_check`, `adt_code_completion_proposal`,
  `adt_code_completion_element_info`, `adt_traces_list`, `adt_traces_hit_list`,
  `adt_traces_db_access`, `adt_traces_create_configuration`, `adt_traces_delete`,
  `adt_refactor_extract_method_preview`, `adt_refactor_extract_method_execute`,
  `adt_debugger_set_variable_value` to the tool inventory and their tier assignments.
- `guardrails-integration`: no rule changes — the 8 new tools are evaluated by the same
  tier/mode/scope machinery already specified; only the set of tools it applies to grows.

## Impact

- `package.json` (dependency bump to `sap-adt-client#v0.2.0`).
- `src/gateway/IAdtGateway.ts`, `src/gateway/AdtGateway.ts`, `src/gateway/FakeAdtGateway.ts`.
- `src/guardrails/AdtRiskTiers.ts`.
- New tool modules: `src/tools/syntaxCheck.ts`, `src/tools/codeCompletion.ts`,
  `src/tools/traces.ts`; extended `src/tools/refactor.ts`, `src/tools/debuggerTools.ts`,
  `src/tools/index.ts`.
- Tests: gateway wiring tests, new tool-module unit tests, `toolModules.smoke.test.ts` extended
  with the 8 new cases.
- `README.md` if it enumerates tools by name/count.
