---
name: sap-system-orientation
description: Get oriented in a newly-configured or unfamiliar SAP system before doing real investigation work. Use the first time this MCP points at a new landscape, or when the user asks "what's in this system" / "is this connected correctly".
allowed-tools: adt_discovery, adt_search
---

A cheap first-contact check for a `system` alias you (or the user) haven't worked with yet in this
session. Tier A, read-only, safe on any system.

## Steps

1. **Confirm connectivity and see what's exposed**: `adt_discovery` for the system. Report the
   service collections it returns in plain language (e.g. "this system exposes classes, programs,
   packages, transports, ATC, and abapGit" - group by what they mean to a user, don't just dump
   the raw collection list) - a thin or unusual discovery response is itself a signal worth
   surfacing (e.g. no transport service = this may be a sandbox/trial system with no CTS).

2. **Sample the custom-code footprint**: `adt_search` a couple of broad, cheap probes -
   e.g. `query: "Z*"` restricted to a common type (`objectType: "CLAS/OC"`, then `"PROG/P"`) with a
   small `maxResults` (10-20) - to get a rough sense of scale ("a handful of Z-classes" vs
   "thousands - this is a heavily customized landscape") without pulling anything expensive.

3. If the user mentioned what they're here to investigate (a specific package, transport, or
   entry point), do one more targeted `adt_search` for it right away and report whether it exists
   on this system - catches a wrong system alias immediately, before a longer investigation wastes
   time on the wrong target.

## Output

A short orientation summary: what the system exposes, a rough scale read on custom code, and
(if applicable) confirmation that the user's actual target exists here. End by naming what
investigation skill would fit next given what the user said they're here for, rather than leaving
them to figure out the next step themselves.
