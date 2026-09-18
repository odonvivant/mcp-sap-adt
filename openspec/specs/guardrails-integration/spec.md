# guardrails-integration Specification

## Purpose
Defines how ADT-specific risk tiers and per-system guardrail modes are enforced on every tool
call, on top of `mcp-guardrails`' generic policy/elicitation engine.

## Requirements

### Requirement: Every tool call is evaluated against an ADT-specific risk tier
Every tool SHALL declare exactly one risk tier — Tier A (read-only), Tier B (state-changing but
reversible/inspectable), or Tier C (destructive or production-impacting) — and every invocation
SHALL be evaluated against that tier before the underlying ADT operation executes.

#### Scenario: Tier A call proceeds without any guardrail check
- **WHEN** a Tier A tool (e.g. object source read) is invoked against a system in any mode
- **THEN** the call proceeds immediately with no confirmation step

### Requirement: read-only mode hard-blocks Tier B and Tier C regardless of confirmation
A system configured with `mode = "read-only"` SHALL deny every Tier B and Tier C tool call
outright, with no path to override via confirmation.

#### Scenario: Tier C call against a read-only system
- **WHEN** a Tier C tool (e.g. activate object) is invoked against a system configured
  `mode = "read-only"`
- **THEN** the call is denied before reaching the ADT system, and the denial reason states the
  system is read-only

### Requirement: guarded mode requires live confirmation for Tier B and Tier C
A system configured with `mode = "guarded"` (the default) SHALL require the connected client to
confirm a Tier B or Tier C call via MCP elicitation before it executes, showing the tool name,
target system, target object/transport (when applicable), and risk tier in the confirmation
prompt.

#### Scenario: Tier C call against a guarded system is confirmed
- **WHEN** a Tier C tool is invoked against a `guarded` system and the connected client approves
  the elicitation prompt
- **THEN** the call proceeds and the confirmation is recorded

#### Scenario: Tier C call against a guarded system is declined
- **WHEN** a Tier C tool is invoked against a `guarded` system and the connected client declines
  the elicitation prompt
- **THEN** the call is denied and no ADT request is made

### Requirement: open mode skips confirmation but still logs the call
A system configured with `mode = "open"` SHALL allow Tier B and Tier C calls to proceed without an
elicitation prompt, while still recording that the call occurred (tool, tier, system, target).

#### Scenario: Tier B call against an open system
- **WHEN** a Tier B tool is invoked against a system configured `mode = "open"`
- **THEN** the call proceeds without a confirmation prompt, and the invocation is logged

### Requirement: fail-closed when the connected client does not support elicitation
When a `guarded` system's Tier B/C tool is invoked by a client that does not support MCP
elicitation, the system SHALL NOT silently allow the call. It SHALL fall back to config-only
evaluation (allow/deny lists) and SHALL deny Tier C calls by default in that fallback, rather than
treating the absence of elicitation support as implicit approval.

#### Scenario: Tier C call from a non-elicitation-capable client
- **WHEN** a Tier C tool is invoked against a `guarded` system by a client that does not advertise
  elicitation support
- **THEN** the call is denied by default, and the denial reason states that confirmation could not
  be obtained

### Requirement: allow/deny scoping narrows Tier B/C calls within guarded and open modes
A system MAY declare `allowPackages`/`denyPackages` prefixes and `allowObjectTypes` that further
restrict which Tier B/C calls are permitted, evaluated in addition to the mode-level rule. A call
targeting an object outside the allowed scope SHALL be denied even under `guarded` confirmation or
`open` mode.

#### Scenario: Tier C call targets a denied package prefix
- **WHEN** a Tier C tool targets an object whose package matches a `denyPackages` prefix
  configured for that system
- **THEN** the call is denied regardless of `mode`, before any confirmation prompt is shown

### Requirement: every guardrail decision is explained to the caller
A denied call SHALL return a reason distinguishing why it was denied (read-only mode, declined
confirmation, no elicitation support, package/object-type scope) rather than a generic refusal, so
the calling agent can decide how to proceed.

#### Scenario: Denial reason is specific
- **WHEN** any tool call is denied by the guardrail chain
- **THEN** the response states which rule denied it (mode, scope, or declined confirmation) instead
  of an unqualified "denied"
