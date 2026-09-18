## 1. Dependency bump

- [x] 1.1 Bump `sap-adt-client` in `package.json` to `git+https://github.com/odonvivant/sap-adt-client.git#v0.2.0`, run `npm install` for real, and verify the existing 85 `mcp-sap-adt` tests still pass unchanged (`npm test`)

## 2. Gateway layer

- [x] 2.1 Add the 11 new methods to `IAdtGateway` (`syntaxCheck`, `codeCompletionProposal`, `codeCompletionElementInfo`, `tracesList`, `tracesHitList`, `tracesDbAccess`, `tracesCreateConfiguration`, `tracesDelete`, `extractMethodPreview`, `extractMethodExecute`, `debuggerSetVariableValue`) and verify `npm run build` type-checks
- [x] 2.2 Implement the same 11 methods on `AdtGateway`, delegating to `sap-adt-client`'s `syntaxCheck`/`codeCompletion`/`traces`/`refactor`/`debuggerOps` operations, and verify `npm run build` type-checks
- [x] 2.3 Implement the same 11 methods on `FakeAdtGateway` following the existing `invoke()` pattern, and add/extend `AdtGateway.test.ts` with wiring tests (each new method calls the right `sap-adt-client` operation with the resolved connection and forwarded args)

## 3. Risk tiers

- [x] 3.1 Add the 11 new tool-name → tier entries to `ADT_RISK_TIERS` in `AdtRiskTiers.ts` (`adt_syntax_check`: A, `adt_code_completion_proposal`: A, `adt_code_completion_element_info`: A, `adt_traces_list`: A, `adt_traces_hit_list`: A, `adt_traces_db_access`: A, `adt_traces_create_configuration`: B, `adt_traces_delete`: B, `adt_refactor_extract_method_preview`: B, `adt_refactor_extract_method_execute`: C, `adt_debugger_set_variable_value`: C), with the comment block explaining the `adt_traces_delete` B-not-C deviation, and verify `AdtRiskTiers.test.ts` (extended if needed) still passes

## 4. Tool modules

- [x] 4.1 Create `src/tools/syntaxCheck.ts` with `adt_syntax_check` (Tier A) and verify it validates args and forwards to `gateway.syntaxCheck`
- [x] 4.2 Create `src/tools/codeCompletion.ts` with `adt_code_completion_proposal` and `adt_code_completion_element_info` (both Tier A) sharing one input schema, and verify each forwards to its `gateway` method
- [x] 4.3 Create `src/tools/traces.ts` with `adt_traces_list`, `adt_traces_hit_list`, `adt_traces_db_access` (Tier A), `adt_traces_create_configuration` (Tier B), `adt_traces_delete` (Tier B), and verify each forwards to its `gateway` method
- [x] 4.4 Extend `src/tools/refactor.ts` with `adt_refactor_extract_method_preview` (Tier B) and `adt_refactor_extract_method_execute` (Tier C, with the same optional `packageName` scoping field `adt_refactor_rename_execute` has), and verify both forward to `gateway.extractMethodPreview`/`gateway.extractMethodExecute`
- [x] 4.5 Extend `src/tools/debuggerTools.ts` with `adt_debugger_set_variable_value` (Tier C) and verify it forwards to `gateway.debuggerSetVariableValue`
- [x] 4.6 Register the 3 new tool arrays (`syntaxCheckTools`, `codeCompletionTools`, `tracesTools`) plus the 2 extended arrays (`refactorTools`, `debuggerTools`) in `src/tools/index.ts`'s `allTools`, and verify `ToolRegistry.register()` (via the smoke test / server boot) does not throw for any of the 11 new tools

## 5. Tests

- [x] 5.1 Extend `src/tools/toolModules.smoke.test.ts`'s `cases` array with the 11 new tools (args → gateway method → result forwarding), and verify `it('covers every registered tool exactly once', ...)` passes with the new total tool count
- [x] 5.2 Run `npm run build && npm test -- --coverage` and confirm all tests pass; review the coverage report for the new gateway/tool code and address any real (non-trivial-passthrough) gaps

## 6. Docs and cleanup

- [x] 6.1 Update `README.md`'s tool list/count if it enumerates tools by name or count
- [x] 6.2 Run the `code-review` skill over the diff and resolve or note findings
- [x] 6.3 Archive this change via `openspec archive add-additional-adt-tools`
- [x] 6.4 Manual smoke test of 4 of the 11 new tools against a real dev ADT system (VPN
      required), via `SystemRegistry.fromObject` -> `createServer` -> `toolRegistry.invoke`
      directly (same approach as the previous change's 8.4): `adt_syntax_check` returned a real
      parsed syntax error against a real class; `adt_traces_list` returned successfully (empty);
      `adt_code_completion_proposal` returned real, correct completion suggestions; and
      `adt_debugger_set_variable_value` (Tier C) was correctly denied fail-closed with reason
      `no-elicitation-support`, confirming the guardrail wiring extends correctly to the new
      tools. No new bugs found - `sap-adt-client` v0.2.0's CSRF/session-cookie fix and per-
      endpoint `Accept` headers (from that repo's own live-verification pass) carried through
      correctly.
