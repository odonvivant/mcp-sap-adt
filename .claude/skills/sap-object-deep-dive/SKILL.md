---
name: sap-object-deep-dive
description: Pull everything useful about one ABAP object in one pass - source, where-used, revision history, and package context. Use when the user asks "tell me about <object>", "what does this class do", "who changed this recently", or as a building block inside a larger investigation.
allowed-tools: adt_search, adt_object_source_read, adt_usage_references, adt_package_contents, adt_revisions, adt_ddic_element
---

Given one ABAP object (a name, a URI, or a description you need to resolve first), assemble a
single-object dossier. This is a read-only, Tier A workflow - no confirmation prompts, safe on any
system including a `read-only`-mode one.

**Input**: a `system` alias and an object name or URI. If only a name is given, resolve it first
(step 1). If the user hasn't said which configured system to use and more than one exists, ask.

## Steps

1. **Resolve the object**, if you don't already have its exact URI and type. Call `adt_search`
   with the name (wildcards like `ZCL_FOO*` are fine) and, if you already know the shape (class,
   program, table...), an `objectType` filter (`CLAS/OC`, `PROG/P`, `FUGR/F`, `TABL/DT`, `DDLS/DF`,
   etc.) to narrow ambiguous matches. If more than one plausible match comes back, ask the user to
   pick rather than guessing.

2. **Read its source**, if it's a source-carrying object (class, program, include, function
   module, CDS DDL): `adt_object_source_read` with the resolved `objectUri`. For a DDIC-only
   object (table, structure, data element), use `adt_ddic_element` instead for its field
   list/types - there's no "source" to read.

3. **Find who depends on it**: `adt_usage_references` with the same `objectUri`. This is the core
   of "what breaks if I touch this" - report it as a list grouped by the referencing object's
   package, not a flat dump, so the reader can see at a glance whether the dependents are all
   local or spread across other teams' packages.

4. **Get its package context**: `adt_package_contents` for the package the object lives in (read
   from the search/source result's package field), so the report can note what else lives
   alongside it - useful for judging whether it's an isolated utility or part of a larger unit.
   **Known limitation**: `adt_package_contents` is currently confirmed broken (the underlying ADT
   nodestructure call's exact drill-down parameters aren't resolved yet) - if it errors, skip this
   step and say so in the report rather than failing the whole dossier over it.

5. **Get its recent history**: `adt_revisions` for the same `objectUri` - flag if it's changed
   recently (a volatile object is riskier to depend on for a migration decision than a stable one
   that hasn't moved in years).

## Output

A short Markdown dossier: object identity (name/type/URI/package), a one-paragraph summary of what
it does (from the source, if read), the where-used list (grouped by package), sibling objects in
its package, and recent revision history with a one-line risk note ("last changed 3 days ago by
X - check with them before depending on this" vs "stable, unchanged for 2 years"). Keep it to what
fits on one screen - this is a lookup, not a report.
