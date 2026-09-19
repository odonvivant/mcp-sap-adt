---
name: sap-migration-scan
description: Run an ATC-driven custom-code migration readiness assessment over a package or namespace, summarized by severity. Use when the user asks "is this package ready for S/4HANA", "scan our custom code for migration issues", or "how risky is this namespace to move".
allowed-tools: adt_search, adt_package_contents, adt_atc_worklist, adt_atc_create_run
---

Given a package or object-name pattern, assess it for migration/Clean-Core readiness using ATC
(ABAP Test Cockpit). Tier B (`adt_atc_create_run`) - may prompt for confirmation on a guarded
system; everything else is Tier A.

**Input**: a `system` alias and a package name or object-name pattern (e.g. `ZFI*`). Optionally an
ATC check variant name.

## Steps

1. **Enumerate the scope**: `adt_package_contents` for a package, or `adt_search` for a name
   pattern, to get the concrete object URI list this scan will cover. Report the count before
   running anything expensive - if it's very large (hundreds of objects), confirm with the user
   before proceeding rather than silently kicking off a huge check run. **Known limitation**:
   `adt_package_contents` is currently confirmed broken - if scoping by package, fall back to
   `adt_search` with a name pattern matching that package's typical namespace (ask the user for
   one if it isn't obvious) and say plainly that the scope is name-pattern-based, not a verified
   full package listing, until that tool is fixed.

2. **Determine the check variant**. ATC variant names are landscape-specific (a common one is
   something like `S4HANA_READINESS` or a customer-defined variant for Clean Core) - if the user
   named one, use it. If not, ask rather than hardcoding a guess that might not exist on this
   system; if they don't know, say plainly that the variant needs to be confirmed with whoever
   owns ATC configuration on this system (there's no ADT endpoint in this tool set to list
   available variants).

3. **Run the check**: `adt_atc_create_run` with the variant and the object URI list from step 1.

4. **Fetch results**: `adt_atc_worklist` for the resulting worklist ID.

5. **Summarize by severity and category** - don't just relay the raw finding list. Group findings
   by priority/severity first, then by category within each (obsolete statement usage, direct
   table access instead of a released API, hardcoded client, standard-object modification, etc.).
   Call out any finding categories that specifically block a Clean Core / cloud-qualified path
   (direct database access, unreleased API usage) separately from stylistic/maintainability
   findings, since they carry different weight in a migration decision.

## Output

A Markdown assessment: scope (package/pattern, object count, check variant used), findings grouped
by severity then category with counts, the Clean-Core-blocking subset called out explicitly, and a
one-line bottom-line read ("mostly clean, N objects need attention before migration" /
"significant remediation needed - M objects have blocking findings"). This supports a scoping
conversation, not a line-by-line fix list - point at the worklist for that level of detail rather
than reproducing every finding's text.
