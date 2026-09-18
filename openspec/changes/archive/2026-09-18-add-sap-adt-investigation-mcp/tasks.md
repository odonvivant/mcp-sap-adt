## 1. System configuration (adt-connectivity)

- [x] 1.1 Define the `systems.json` Zod schema (per `design.md` D4: alias-keyed object, `url`,
      `client`, `auth` discriminated union `basic`/`cert`, `mode`, optional `allowPackages`/
      `denyPackages`/`allowObjectTypes`, `"env:VAR_NAME"` credential references) in
      `src/config/SystemRegistry.ts` and verify with unit tests covering: valid basic entry, valid
      cert entry (pfx and cert+key forms), missing required field, both/neither auth type
      specified, unresolvable env reference — each rejected or accepted per `specs/adt-connectivity/
      spec.md`.
- [x] 1.2 Implement `SystemRegistry` load (`systems.json` + env override resolution) with a clear
      "no systems configured, run setup" message when the file is absent, and verify with a unit
      test for the missing-file path.
- [x] 1.3 Implement per-alias session caching (one authenticated session per system, per
      `design.md`) behind the registry, and verify with a unit test that two aliases never share a
      cached session.
- [x] 1.4 Implement unknown-alias rejection (lists configured aliases in the error, no network
      call attempted) and verify with a unit test.

## 2. Gateway seam (adt-connectivity)

- [x] 2.1 Define `IAdtGateway` (`src/tools/Tool.ts` or a dedicated `src/gateway/IAdtGateway.ts` —
      one method per repo-1 `operations/` family, per `design.md` D1) and a fake in-memory
      implementation for tests, and verify the fake satisfies the interface via a compile-time
      check plus one example unit test per method group.
- [x] 2.2 Implement the real `AdtGateway` resolving `system` via `SystemRegistry` and delegating to
      `sap-adt-client`'s `operations/` (**blocked on `sap-adt-client` `v0.1.0` git tag** — until
      then, implement against the fake and leave a `// TODO(sap-adt-client v0.1.0)` marker) and
      verify by wiring one operation end-to-end once the dependency is available.

## 3. Guardrail plumbing (guardrails-integration)

- [x] 3.1 Implement `AdtRiskTiers.ts` as the static per-tool tier table described in `design.md`
      D3, seeded with every tool from `specs/tools/spec.md`'s inventory, and verify with a unit
      test asserting every tool registered in `ToolRegistry` (task 4.1) has a table entry (no
      silent default).
- [x] 3.2 Implement `GuardrailConfig.ts` translating a system's `mode`/`allowPackages`/
      `denyPackages`/`allowObjectTypes` into `mcp-guardrails`' `ConfigPolicy` shape
      (**blocked on `mcp-guardrails` `v0.1.0` git tag** for the real `ConfigPolicy`/
      `CompositeGuardrail` types — implement against a local interface stub until then) and verify
      with unit tests for: read-only blocks Tier B/C, guarded requires confirmation, open skips
      confirmation but logs, deny-package-prefix blocks regardless of mode.
- [x] 3.3 Implement the fail-closed fallback (no elicitation support → config-only evaluation,
      Tier C denied by default) and verify with a unit test simulating a non-elicitation-capable
      client.
- [x] 3.4 Verify every guardrail denial path returns a specific reason (mode / scope / declined
      confirmation / no-elicitation-fallback) distinguishable from a generic denial, via a unit
      test enumerating each denial cause.

## 4. Tool registry and domain modules (tools)

- [x] 4.1 Implement `ToolRegistry.ts` and the `Tool` interface (`name`, `riskTier`, `inputSchema`
      requiring `system`, `execute(gateway, args)`), with guardrail-check-then-execute-then-
      normalize wrapping applied once at registration time (per `design.md` D2), and verify with a
      unit test that a denied call never reaches `execute`.
- [x] 4.2 Implement `AdtError` → tool-response normalization (401/403 → auth hint, 404 → object/
      system-not-found hint, 400 with syntax payload → parsed syntax error list, generic fallback
      never a bare "request failed") in the registry wrapper, and verify with unit tests for each
      status-code category listed in `specs/tools/spec.md`.
- [x] 4.3 Implement Tier A tool modules: `discovery`, `search`, `objectSource` (read),
      `ddic`/table/CDS metadata + table contents/query, `usageReferences`, `packages` (node
      hierarchy), `transports` (read), `revisions` (read), `atc` (worklists, read), syntax check,
      code completion — each a thin module calling `IAdtGateway`, and verify each against the fake
      gateway from task 2.1 with one happy-path and one not-found-path test.
- [x] 4.4 Implement Tier B tool modules: `createAtcRun`, `unitTestRun`, trace
      creation/configuration — and verify each requires guardrail confirmation on a `guarded`
      system via a unit test using the guardrail chain from section 3.
- [x] 4.5 Implement Tier C tool modules: object create/delete, source edit, lock/unlock, activate,
      transport release, abapGit push, debugger (attach/step/variable-set), refactor
      (rename/extract method) — and verify each is blocked on a `read-only` system and requires
      confirmation on a `guarded` system via unit tests.
- [x] 4.6 **Note**: tasks 4.3-4.5 depend on `sap-adt-client`'s real `operations/` (task 2.2) for
      end-to-end wiring; module structure, input schemas, and tier assignment can be implemented
      and unit-tested against the fake gateway before that dependency lands.

## 5. Server wiring

- [x] 5.1 Implement `server.ts` wiring `SystemRegistry` + `GuardrailConfig`/`AdtRiskTiers` +
      `ToolRegistry` into an `@modelcontextprotocol/sdk` stdio server, and verify with
      `npm run build && node dist/index.js` booting clean and listing all registered tools via
      `npx @modelcontextprotocol/inspector node ./dist/index.js`.

## 6. Setup wizard and systems.json (distribution)

- [x] 6.1 Implement `scripts/setup.ts` using Node's built-in `readline/promises`: loop prompting
      alias → url → client → auth type → auth fields → mode → optional package/object-type scoping
      → "add another system?", per `design.md` D4, and verify by running it interactively (or via
      a scripted stdin test) and confirming the resulting `systems.json` validates against the
      `SystemRegistry` schema from task 1.1 with no manual edits.
- [x] 6.2 Verify no collected secret (password, passphrase, key content) is ever printed to stdout,
      written to a log, or echoed in a confirmation summary — via a test that captures wizard
      stdout/stderr and asserts the literal secret value never appears in it.
- [x] 6.3 Add `systems.json` to `.gitignore` and verify `git status` in a clone with a generated
      `systems.json` shows it as ignored, not untracked.
- [x] 6.4 Wire `npm run setup` to run `scripts/setup.ts` and verify the quickstart sequence
      (`npm install && npm run build && npm run setup`) produces a server that starts successfully.

## 7. README and install docs (distribution)

- [x] 7.1 Write the Claude Desktop section (`claude_desktop_config.json` snippet) and verify a
      fresh reader can configure the server from that section alone.
- [x] 7.2 Write the Claude Code section (`.mcp.json` snippet + `claude mcp add` one-liner) and
      verify it is independently sufficient (no cross-references to other harness sections
      required).
- [x] 7.3 Write the VS Code / GitHub Copilot section: ship `.vscode/mcp.json` in the repo using
      VS Code's native `servers` key with `${input:...}` placeholders for every secret (no
      hardcoded credentials), plus an "Install in VS Code" deep-link badge, and verify the template
      file is valid JSON and contains no literal secret values.
- [x] 7.4 Write the Cline section (VS Code extension config block) and verify it is independently
      sufficient.
- [x] 7.5 Write the troubleshooting section mapping each `AdtError`/guardrail-denial category from
      `specs/tools/spec.md` and `specs/guardrails-integration/spec.md` (auth failure, object/system
      not found, syntax error, guardrail denial by mode/scope/declined-confirmation/no-elicitation)
      to concrete user-facing guidance, and verify every category listed in those specs has a
      corresponding troubleshooting entry.
- [x] 7.6 Write a short "Architecture" section linking to `sap-adt-client` and `mcp-guardrails` and
      explaining why they're separate repos, and verify the links resolve once those repos are
      pushed.

## 8. Cross-cutting review

- [x] 8.1 Run the `code-review` skill over the full diff before considering this change ready to
      archive, and resolve or explicitly accept every finding.
- [x] 8.2 Run the `security-review` skill over the full diff (particular attention to secret
      handling in `systems.json`/`setup.ts` and the guardrail fail-closed paths) and resolve or
      explicitly accept every finding.
- [x] 8.3 One-time business/domain review by the existing SAP `architect` agent of the tool
      inventory and risk-tier model (build plan Milestone 16), and record any resulting
      adjustments as follow-up tasks or a spec amendment before archiving.

      **Adjustments applied directly to `AdtRiskTiers.ts` as a result of this review** (see
      commit-time diff, not a deferred follow-up - re-tiering is cheap/low-risk to apply
      immediately per D3's "static, auditable, editorial" design):
      - `adt_ddic_table_contents`: A -> B. Arbitrary application-data query (up to 10k rows) can
        expose PII/financial data; a no-confirmation-ever tier understated that.
      - `adt_unit_test_run`: B -> C. ABAP Unit classes can be marked DANGEROUS/CRITICAL and
        legitimately commit DB changes / call remote systems - this executes arbitrary customer
        ABAP, not just "creates an inspectable run".
      - `adt_object_unlock`: C -> B. Releases state rather than creating it; gating it as hard as
        `lock` risked stranding an enqueue lock (blocking other developers) behind a declined or
        unsupported confirmation.
      - `adt_debugger_delete_breakpoints`: C -> B. Same asymmetry - cleanup shouldn't be harder to
        reach than the action that created the mess (a breakpoint halting a live user session).

      **Noted, not changed** (real trade-off, not a defect): `adt_atc_create_run` (Tier B) is
      blocked outright on a `read-only` system, which is exactly where a migration-assessment ATC
      run is most likely to be wanted. Fixing this would need a new guardrail mechanism (a
      per-tool allowance distinct from the system-level mode) - out of scope for this change per
      the "no added scope without surfacing it" rule; flagged as a possible follow-up change.

      **Confirmed, not new findings** (already known/documented): two proposal-listed Tier C
      tools - refactor extract-method and debugger variable-set (write) - have no backing
      operation in `sap-adt-client` v0.1.0 and were not implemented, consistent with `design.md`
      D1's `IAdtGateway` method list (which never listed them either).
- [x] 8.4 Manual smoke test of the fully assembled server against a real dev ADT system (VPN
      required), once `sap-adt-client` was live-verified and pushed: `SystemRegistry.fromObject`
      -> `createServer` -> `toolRegistry.invoke` directly (no MCP transport attached, so this also
      exercises the fail-closed elicitation path for real, not mocked). `adt_search` (Tier A)
      returned real repository objects with no prompt. `adt_object_lock` (Tier C) was correctly
      denied with reason `no-elicitation-support`, since no client was connected to answer a
      confirmation. Surfaced one more real gap along the way: `basicAuthSchema` had no
      `rejectUnauthorized` field and `buildAuthStrategy` never threaded one through to
      `BasicAuthStrategy` even after `sap-adt-client` gained that option - fixed in
      `SystemRegistry.ts` (schema field + resolution + wiring) and `scripts/setup.ts` (new "Verify
      TLS certificate?" prompt for both auth types), with tests added.
