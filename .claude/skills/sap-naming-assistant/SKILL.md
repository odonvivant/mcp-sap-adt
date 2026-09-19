---
name: sap-naming-assistant
description: Propose compliant ABAP object names before anything is created. Use when a developer asks "what should I call this new class/interface/table", "help me name this object", "is this a good name for a new Z object", or otherwise wants naming guidance for one or more ABAP objects they're about to build - before adt_object_create or hand-written source ever touches the system.
allowed-tools: adt_search, adt_package_contents
---

Given a developer's description of one or more ABAP objects they intend to create, propose
compliant names for each. This is a **naming advisor only** - it never calls `adt_object_create`
and never writes source. Tier A, read-only, safe on any system including a `read-only`-mode one.
If the developer wants the object actually created afterward, that's a separate, explicit,
guardrail-gated action outside this skill's scope - say so rather than doing it.

**Input**: a `system` alias, one or more intended object types + a rough purpose for each (e.g.
"an interface and two classes for X"), a target package (or "not sure yet" - ask, don't guess a
package name), and whether this is test/throwaway or real release-bound work (ask if not stated).

## Step 1 - throwaway vs release-bound (hard rule, not optional)

Ask directly if the developer hasn't already said: is this test/throwaway work (verification
scaffolding, a scratch object to try something out) or real release-bound work?

- **Throwaway/test** → every proposed name gets a `Y` prefix, never `Z`. Recommend `$TMP` (or a
  designated sandbox package if the system has one) as the target package regardless of what
  package the developer named. Explicitly remind them to delete the object(s) when done - a
  stuck/forgotten `Y*` object is exactly the kind of leftover scaffolding that has previously left
  stale ABAP enqueue locks needing manual SM12 cleanup.
- **Release-bound** → every proposed name gets a `Z` prefix, never `Y`.

This split is not something the developer's answer to any other question can override. If they ask
for a `Y` name on release-bound work (or vice versa), correct it and explain why before proceeding.

## Step 2 - resolve the target package

If a target package was given, use it. If not, ask - don't guess. (Exception: throwaway work
already resolved to `$TMP`/sandbox in Step 1; still confirm that's acceptable rather than assuming.)

## Step 3 - look for existing naming precedent in the target package

Before asking the precedent question in Step 4, actually look, so the developer's answer is
informed rather than a guess:

1. `adt_package_contents` for the target package to list what it directly contains.
2. Filter to objects already in customer namespace (`Z*`/`Y*`). If the package is new/empty or has
   too few custom objects to judge a pattern (fewer than ~3), say so plainly - there's no precedent
   to match against, and Step 4's question becomes moot (Clean ABAP defaults apply automatically).
3. Look for a recognizable shared prefix pattern among the names found - specifically a
   `Z<MODULE>_<DESCRIPTIVE_NAME>`-style module prefix (real examples seen on this project's dev
   system: `ZBC_COCKPIT_*`, `ZWM_INTERFACES_FG`). Split names on `_` and check whether a majority
   share the same leading token(s).
4. If the target package's own contents are too sparse to tell, and the developer's purpose
   suggests a specific module/team (e.g. "BC" or "WM"), a supplementary `adt_search` with a
   wildcard query (e.g. `ZBC_*`) can widen the check across sibling packages in the same apparent
   module - but only as a fallback, and say plainly that this is a broader, less precise signal
   than what's actually inside the target package.
5. Summarize what was found: either a clear pattern (name it, with 2-3 example objects as
   evidence) or "no clear pattern found in this package."

## Step 4 - ask the precedent question (default is Clean ABAP, not precedent)

Show the developer what Step 3 found, then ask explicitly: **"Should the name match existing
naming precedent already used in the target package, or should I use Clean ABAP naming
defaults?"**

- If the developer explicitly opts into precedent-matching, use the detected pattern for the
  descriptive part of the name.
- If they don't answer, decline, or say something ambiguous, **default to Clean ABAP naming
  guidelines** - never silently fall back to precedent-matching. This default exists because
  existing precedent in a package may itself be inconsistent or non-Clean-ABAP-compliant, and
  matching it by default would quietly perpetuate that instead of the Clean ABAP mandate this
  tooling is required to follow. State which path was taken in the output rationale either way.

## Step 5 - propose names

For each object, build `<Y|Z prefix><descriptive part>` using whichever path Step 4 resolved to:

- **Precedent path**: follow the detected `Z<MODULE>_<...>` (or equivalent) shape, substituting the
  new object's own descriptive words for the `<...>` part.
- **Clean ABAP default path** (see `CleanABAP.md`'s "Names" section, ~line 389): descriptive and
  pronounceable words, no cryptic/meaningless abbreviations (abbreviate only if a length limit
  forces it, and then consistently), nouns for classes/interfaces, no noise words like "data" or
  "object" tacked on for no reason. This governs the *object name* itself - the separate lowercase-
  ABAP-keywords override only affects source code this tooling might show as an example snippet,
  not the technical object name, which by long-standing SAP convention is rendered uppercase with
  underscores regardless of which naming path was used.

Respect length limits: most repository object names (classes, interfaces, programs, function
modules) cap at 30 characters; some DDIC object types have tighter limits (e.g. transparent
tables). Flag if a proposed descriptive name is close to or over the likely limit for that specific
object type, and note that the exact limit for less-common object types hasn't been verified here -
confirm in SE80/SE11 if it matters before finalizing.

Where a widely-recognized ABAP type infix helps readability (`_CL_`/`CL_`-style for classes,
`_IF_`/`IF_`-style for interfaces, etc.), you may suggest one, but frame it as convention, not a
hard rule - the two hard rules in this skill are only the `Y`/`Z` split and Clean ABAP naming
quality.

## Output

For each object requested: the proposed name, the recommended target package, and a one-line
rationale stating which prefix rule applied (test→`Y`/`$TMP` or release→`Z`) and which naming path
was used (precedent-matched, with the pattern named, or Clean-ABAP-default, noted as the default
because no explicit opt-in was given). If any object is test/throwaway, close with an explicit
reminder to delete it when done. End by restating plainly that this skill only proposes names - no
object has been created, and creating one is a separate, explicit, guardrail-gated step the
developer (or a follow-up tool call they ask for) still has to take.
