## MODIFIED Requirements

### Requirement: Full investigation/mapping tool surface across ADT domains
The server SHALL expose tools covering: discovery, search, object source read, DDIC/table/CDS
metadata and table contents/query, usage references, package/node hierarchy, transport inspection
and management, revisions, ATC (run creation + worklists), syntax check, code completion,
performance/SQL trace inspection and configuration, object management
(create/delete/lock/unlock/activate), debugger, abapGit, unit test execution, and refactor
(rename/extract method) — matching the breadth needed for custom-code migration assessment and
transport/object dependency checks.

#### Scenario: Investigation workflow uses only Tier A tools
- **WHEN** an agent performs a read-only investigation (discovery, search, usage references,
  package hierarchy, ATC worklist review, trace inspection) against any configured system
- **THEN** every tool used completes without requiring guardrail confirmation, regardless of the
  system's mode

### Requirement: Each tool declares exactly one risk tier matching its mutation impact
Each tool SHALL be assigned exactly one of:
- **Tier A** (read-only, no mutation): discovery, search, object source read, DDIC/table/CDS
  metadata, table contents/query, usage references, package/node hierarchy, transport inspection
  (read), revisions (read), ATC worklists (read), syntax check, code completion, trace run
  listing/hit list/DB access inspection.
- **Tier B** (creates state but does not alter source/transports, or cleans up a Tier B action):
  `createAtcRun`, `unitTestRun`, trace creation/configuration, trace/trace-configuration deletion,
  refactor preview (rename/extract method).
- **Tier C** (destructive or production-impacting): object create/delete, source edit,
  lock/unlock, activate, transport release, abapGit push, debugger attach/step/variable-set,
  refactor execute (rename/extract method).

#### Scenario: Tier is fixed per tool, not per call
- **WHEN** the same tool is invoked twice with different arguments
- **THEN** its risk tier evaluated by the guardrail chain is identical both times

#### Scenario: Cleanup of a Tier B action is not gated harder than the action itself
- **WHEN** a trace configuration created via trace creation/configuration (Tier B) is deleted
- **THEN** the deletion is evaluated as Tier B, not Tier C, so a declined or unsupported
  confirmation never leaves the trace stranded and consuming system resources
