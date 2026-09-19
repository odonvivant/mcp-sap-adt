---
name: sap-entry-point-map
description: Given an entry point (a transaction code, or a report/program/class name), crawl only its custom-code dependencies and build the minimum object list required to transport that process to another system. Use when the user asks "what do I need to move to migrate <transaction/report>", "what does <tcode> depend on", or "build a dependency map for this process".
allowed-tools: adt_search, adt_object_source_read, adt_usage_references, adt_ddic_element, adt_package_contents, adt_ddic_table_contents, adt_transport_info, adt_transport_create
---

**Known limitation**: `adt_package_contents` is currently confirmed broken (the underlying ADT
nodestructure call's exact drill-down parameters aren't resolved yet). This skill's crawl doesn't
depend on it for correctness - dependencies are found by reading source, not by browsing packages
- so proceed without it; only mention it if the user specifically asked for package-level context
alongside the dependency map.

Given one entry point, produce the minimum set of **custom** (`Z*`/`Y*`) objects a migration needs
to carry along with it - not a full dependency graph into standard SAP code, which would be
enormous and isn't what a transport-scoping exercise needs.

**Input**: a `system` alias, an entry point (a transaction code like `ZVA01`, or a report/program/
class name), and optionally a transport number to check completeness against and/or a target
package name for the future-system recommendation (default `ZLEGACY` if not given).

## Step 1 — resolve the entry point to a source-carrying object

- If it's already a report/program/class/function-module name: `adt_search` it directly
  (`objectType` filter if you know the shape) to get its `objectUri`.
- If it's a transaction code: it isn't directly source-carrying, so resolve it first via
  `adt_ddic_table_contents` on table `TSTC` with `sqlQuery: "TCODE = '<code>'"` (uppercase the
  code - TSTC entries are case-sensitive as stored) - this returns the linked program name
  (`PGMNA` column) for a classic dynpro transaction. **This is unverified against a real system as
  of writing** - confirm the exact TSTC column name and behavior live, and if the transaction turns
  out to be object-oriented (no `PGMNA`, or a `KEYWORD`/class-based entry instead), say so plainly
  and ask the user for the underlying class/report directly rather than guessing further table
  lookups. Once you have the program/class name, `adt_search` it to get the `objectUri`.

## Step 2 — read source, extract custom-code references, verify, recurse

There is no ADT endpoint for "what does this object call" (only the reverse: `adt_usage_references`
answers "who calls this object"). Build the forward direction yourself:

1. `adt_object_source_read` the current object.
2. Read the returned ABAP text and identify identifiers that look like **customer-namespace**
   references (starting `Z` or `Y`, case-insensitive) in the patterns that actually create a
   dependency: `PERFORM ... IN PROGRAM z...`, `CALL FUNCTION 'Z...'`, `CALL METHOD`/`->`/`=>` on a
   `zcl_*`/`zif_*` class or interface, `CREATE OBJECT ... TYPE zcl_...`, class/interface
   definitions and their `TYPE`/`REF TO` usages, `INCLUDE z...`, `TYPE-POOLS z...`, and DDIC
   references in `TYPE`/`TABLES`/`SELECT ... FROM`/`INTO TABLE` clauses pointing at a `Z*`/`Y*`
   table, structure, CDS view, or data element. Ignore anything in comments.
3. For each distinct candidate, confirm it actually exists and get its exact type/URI via
   `adt_search` - a name that merely *looks* like a Z-object reference (a string literal, a
   variable named after one, a typo) is not a dependency; don't add it to the map on a guess.
4. **Recurse only into confirmed custom objects** - for each one, repeat from the top of this
   step (read its source if it has any, extract further references). A standard SAP object found
   along the way is recorded as a dependency (so the report can show "also needs standard object
   X") but is **never** read/recursed into - this is what bounds the crawl.
5. For a DDIC object (table/structure/CDS view/data element/domain) found as a dependency,
   `adt_ddic_element` it for its field list instead of trying to "read source" - and it has no
   further code-level dependencies to recurse into, only note if a table's structure references
   another custom structure/data element.
6. Keep a visited-set of URIs so a circular reference (A calls B, B calls A) terminates instead of
   looping.

## Step 3 — assemble the map and the transport check

Group the confirmed custom dependencies by type: DDIC (tables/structures/CDS views/data elements/
domains), Classes/Interfaces, Programs/Includes, Function Groups/Modules. This grouped list *is*
the minimum object set to transport.

If a transport number was given: `adt_transport_info` for it, and report **exactly which objects
from the map are missing from that transport's contents** - report only, do not attempt to add
them programmatically (there is no clean/safe existing API for inserting an already-saved,
unchanged object into a transport; that's a human action via the normal transport organizer). If no
transport was given but the user wants one created, `adt_transport_create` (Tier B - may prompt for
confirmation on a guarded system) creates the header; populating it remains a normal workflow
action outside this skill's scope.

For every custom object in the map, annotate a **recommended target package** for the future
system - the given target package name, or `ZLEGACY` by default. This is guidance only, presented
in the report for the migration team to apply manually; this skill never reassigns a package.

## Output

A Markdown report: the resolved entry point, the grouped dependency list (type / name / URI /
recommended target package), standard-SAP objects touched (listed, not expanded), the transport
gap list if a transport was checked, and a one-line summary count ("14 custom objects across 4
types needed to migrate this process"). If the crawl hit an unresolvable step (an OO transaction
TSTC couldn't explain, a reference that looked custom but didn't resolve via search), say so
explicitly in the report rather than silently omitting it.
