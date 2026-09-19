---
name: sap-transport-impact
description: Given an existing transport request, find what depends on its contents outside its own package - the blast radius of releasing it. Use when the user asks "is it safe to release this transport", "what will break if I move this", or "who else uses what's in this transport".
allowed-tools: adt_transport_info, adt_usage_references, adt_package_contents, adt_revisions
---

The reverse direction from `sap-entry-point-map`: that skill asks "what does this process need
to bring with it"; this one asks "what happens to everyone else if I release what's already in
this transport." Tier A, read-only, safe on any system including `read-only` mode.

**Input**: a `system` alias and a transport number.

## Steps

1. `adt_transport_info` for the transport - its description, target package, and every object its
   tasks contain.

2. For **each object** in the transport: `adt_usage_references` on its `objectUri`. This is the
   core check - filter the results to references **outside** the transport's own object set (an
   object in the transport referencing another object also in the same transport isn't an external
   risk, it's internally consistent).

3. Group external references by their **package**, not by object - the real question a release
   decision needs answered is "which teams/areas outside this change need to know," not a flat
   list of a hundred call sites. Note anything referenced from a package that looks unrelated to
   the transport's own target package as a specific flag.

4. For any object with a surprisingly large external reference count, or one that's had frequent
   `adt_revisions` activity recently, call that out explicitly - a heavily-referenced, recently-
   volatile object is exactly the kind of thing a release review should look at twice.

5. Use `adt_package_contents` on the transport's target package if useful for context (e.g. to
   note whether the transport represents a small slice of a much larger package, or nearly all of
   it).

## Output

A Markdown risk report: transport identity and contents, external dependents grouped by consuming
package (with object-level detail available but not leading the report), specific call-outs for
high-reference-count or recently-volatile objects, and a plain-language bottom line ("low risk -
no external references found" / "coordinate with package X before releasing - N references from
outside this change"). This is a release-readiness read, not raw data - lead with the verdict.
