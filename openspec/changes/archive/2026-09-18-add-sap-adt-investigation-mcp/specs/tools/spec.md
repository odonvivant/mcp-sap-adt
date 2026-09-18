## Purpose

Defines the ADT tool inventory exposed by the MCP server, the per-tool system-scoping and
risk-tier contract, and how ADT failures are surfaced to the calling agent.

## ADDED Requirements

### Requirement: Every tool requires a system parameter
Every registered tool's input schema SHALL require a `system` parameter identifying which
configured system alias the call targets. No tool SHALL operate against an implicit or
process-wide default system.

#### Scenario: Tool call missing system parameter
- **WHEN** a tool is invoked without a `system` value
- **THEN** the call is rejected by input validation before any guardrail or ADT logic runs

### Requirement: Full investigation/mapping tool surface across ADT domains
The server SHALL expose tools covering: discovery, search, object source read, DDIC/table/CDS
metadata and table contents/query, usage references, package/node hierarchy, transport inspection
and management, revisions, ATC (run creation + worklists), syntax check, code completion, object
management (create/delete/lock/unlock/activate), debugger, abapGit, unit test execution, and
refactor (rename/extract method) — matching the breadth needed for custom-code migration
assessment and transport/object dependency checks.

#### Scenario: Investigation workflow uses only Tier A tools
- **WHEN** an agent performs a read-only investigation (discovery, search, usage references,
  package hierarchy, ATC worklist review) against any configured system
- **THEN** every tool used completes without requiring guardrail confirmation, regardless of the
  system's mode

### Requirement: Each tool declares exactly one risk tier matching its mutation impact
Each tool SHALL be assigned exactly one of:
- **Tier A** (read-only, no mutation): discovery, search, object source read, DDIC/table/CDS
  metadata, table contents/query, usage references, package/node hierarchy, transport inspection
  (read), revisions (read), ATC worklists (read), syntax check, code completion.
- **Tier B** (creates state but does not alter source/transports): `createAtcRun`, `unitTestRun`,
  trace creation/configuration.
- **Tier C** (destructive or production-impacting): object create/delete, source edit,
  lock/unlock, activate, transport release, abapGit push, debugger attach/step/variable-set,
  refactor (rename/extract method).

#### Scenario: Tier is fixed per tool, not per call
- **WHEN** the same tool is invoked twice with different arguments
- **THEN** its risk tier evaluated by the guardrail chain is identical both times

### Requirement: ADT failures are normalized into a structured, actionable error
When the underlying ADT call fails, the tool response SHALL include a structured error containing
the HTTP status, the ADT system's own error payload/message when present, and a short human-
readable hint for common cases (401/403 → authentication/authorization, 404 → object or system
mismatch, 400 with a syntax payload → the parsed syntax error list). The tool SHALL never return a
bare "request failed" with no diagnostic detail.

#### Scenario: Authentication failure is explained
- **WHEN** an ADT call returns HTTP 401
- **THEN** the tool response states the failure is an authentication problem for that system,
  rather than an unqualified error

#### Scenario: Object not found is distinguished from a system-level problem
- **WHEN** an ADT call returns HTTP 404 for a requested object
- **THEN** the tool response indicates the object (or the object/system combination) was not
  found, distinguishable from a connectivity failure

#### Scenario: Syntax error payload is parsed, not passed through raw
- **WHEN** an ADT call returns HTTP 400 with a syntax-check error payload
- **THEN** the tool response includes the parsed list of syntax errors rather than the raw XML/JSON
  body

### Requirement: A guardrail denial is distinguishable from an ADT failure
A tool call denied by the guardrail chain SHALL return a response distinguishable from an ADT-level
error (per `guardrails-integration`), so the calling agent can tell "the system rejected this" apart
from "the guardrail policy rejected this."

#### Scenario: Denied call does not look like a 4xx ADT error
- **WHEN** a Tier C call is denied by guardrail policy before reaching the ADT system
- **THEN** the response is marked as a guardrail denial, not an ADT HTTP error, and no ADT request
  was made
