## Context

`sap-adt-client` v0.2.0 (tagged, local checkout at `D:\.repositories\.tools\sap-adt-client`) adds
5 operation families this repo doesn't wire up yet: `syntaxCheck`, `codeCompletion`
(`codeCompletionProposal`/`codeCompletionElementInfo`), `traces` (`tracesList`/`tracesHitList`/
`tracesDbAccess`/`tracesCreateConfiguration`/`tracesDelete`), and extensions to
`refactor.ts` (`extractMethodPreview`/`extractMethodExecute`) and `debugger.ts`
(`setVariableValue`). v0.2.0 also fixes a CSRF/session-cookie bug in every mutating call —
transparent to this repo, no code change needed here for that part. See proposal.md for the
per-tool motivation and tier rationale.

This is a same-shape addition to an existing, working pipeline (`Tool` → `ToolRegistry` →
`AdtGuardrail` → `IAdtGateway` → `sap-adt-client` operations), not a new architectural pattern.

## Goals / Non-Goals

**Goals:**
- Wire all 8 new tools through the existing `IAdtGateway`/`ToolRegistry`/`AdtRiskTiers` pattern
  with zero deviation from how the other ~30 tools are structured.
- Keep the dependency-inversion boundary intact: tool modules never import `sap-adt-client`
  directly.

**Non-Goals:**
- No changes to `mcp-guardrails`, `AdtGuardrail`, or `GuardrailConfig` — the existing tier/mode/
  scope machinery already covers Tier A/B/C without modification.
- No live smoke test against a real SAP system in this pass (done separately by the user).
- No re-litigating tier assignments already fixed for the 30 existing tools.

## Decisions

- **One gateway method per `sap-adt-client` function**, named identically to the operation
  (`syntaxCheck`, `codeCompletionProposal`, `codeCompletionElementInfo`, `tracesList`,
  `tracesHitList`, `tracesDbAccess`, `tracesCreateConfiguration`, `tracesDelete`,
  `extractMethodPreview`, `extractMethodExecute`, `debuggerSetVariableValue`) — matches the
  existing 1:1 method-to-operation convention in `IAdtGateway`/`AdtGateway`/`FakeAdtGateway`.
- **New tool-module files** `src/tools/syntaxCheck.ts`, `src/tools/codeCompletion.ts`,
  `src/tools/traces.ts` (one per new domain, matching e.g. `atc.ts`/`search.ts`), and extend the
  existing `src/tools/refactor.ts` (extract-method sits next to rename) and
  `src/tools/debuggerTools.ts` (set-variable-value sits next to the other debugger ops) rather
  than creating new files for those two — mirrors how the file boundary already follows ADT
  domain, not one-file-per-tool.
- **`adt_traces_delete` is Tier B, not Tier C** (deviating from the task's initial default
  suggestion of mirroring "other delete operations"): its creating action
  (`adt_traces_create_configuration`) is already Tier B, and `AdtRiskTiers.ts`'s own documented
  precedent (`adt_object_unlock`, `adt_debugger_delete_breakpoints`) is that a cleanup/release
  operation is never gated harder than the action that created the state it releases — gating
  higher would let a declined/unsupported confirmation strand a live trace. See proposal.md and
  the `tools` spec delta for the full reasoning.
- **`adt_refactor_extract_method_execute` gets the same optional `packageName` field**
  `adt_refactor_rename_execute` has (guardrail-scoping only, never sent to SAP) — keeps the two
  "execute a previewed refactoring" tools structurally identical, cheap to add, avoids a silent
  inconsistency between two Tier C siblings.
- **No new Zod schema abstractions**: `codeCompletionProposal`/`codeCompletionElementInfo` share
  one input schema (same `objectUri`/`source`/`line`/`column` shape) the same way
  `debuggerAttach`'s and `debuggerStep`'s schemas are each defined once per tool today — no new
  shared-schema module introduced for two tools.

## Risks / Trade-offs

- [Trace DB-access statements could carry literal SQL predicate values, arguably a confidentiality
  concern like `adt_ddic_table_contents` (Tier B)] → Kept as Tier A per the existing
  `specs/tools/spec.md` wording (already lists "trace ... inspection" alongside other Tier A
  reads) and because the operation's parsed shape (`statement`/`table`/`count`/`duration`) is a
  performance-profiling aggregate, not a row-data query; revisit if real-system verification shows
  otherwise.
- [`adt_traces_delete` at Tier B instead of the initially suggested Tier C] → Documented above and
  in proposal.md; consistent with existing precedent in the same file, not a new pattern.

## Migration Plan

Additive only — no existing tool name, schema, or tier changes. `npm install` picks up
`sap-adt-client#v0.2.0` via the existing git-dependency mechanism; no `systems.json` or config
migration needed. Rollback is reverting the dependency bump and the new tool registrations.
