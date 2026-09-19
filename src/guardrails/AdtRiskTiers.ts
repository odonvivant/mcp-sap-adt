/**
 * ADT-specific risk-tier assignment, one entry per registered tool. Static and editorial (per
 * `design.md` D3), not derived from the underlying HTTP verb - e.g. `adt_atc_create_run` is a
 * POST but Tier B (creates an inspectable run, doesn't touch source), while
 * `adt_object_activate` is also a POST but Tier C (can make a production object live).
 *
 * `ToolRegistry` looks up a tool's tier here by name at registration time and fails fast if a
 * tool has no entry - this table, not a self-declared field on the tool module, is the single
 * source of truth so tier assignment stays auditable in one place.
 */
export type RiskTier = 'A' | 'B' | 'C';

// Null-prototype: a lookup keyed by an attacker-influenced/mistyped name (`constructor`,
// `toString`, ...) must miss rather than resolve to an inherited Object member.
const TIER_RANK: Record<string, number> = Object.assign(Object.create(null) as Record<string, number>, {
  A: 0,
  B: 1,
  C: 2,
});

function rankOf(tier: RiskTier): number {
  if (!Object.hasOwn(TIER_RANK, tier)) {
    // Fails loudly instead of ranking below the threshold, which `ConfigPolicy` would read as
    // "less risky than Tier B" and allow ungated.
    throw new Error(`AdtRiskTiers: unknown risk tier ${JSON.stringify(tier)}`);
  }
  return TIER_RANK[tier];
}

/** `TierComparator<RiskTier>` for `mcp-guardrails`' `ConfigPolicy`/`isAtLeastAsRisky`. Throws on a
 * tier value outside `A`/`B`/`C` rather than returning an order that would read as "low risk". */
export function compareTiers(a: RiskTier, b: RiskTier): number {
  return rankOf(a) - rankOf(b);
}

/** The tier registered for `toolName`, or `undefined` if it has no entry. Own-property lookup
 * only - a tool named after an `Object.prototype` member resolves to `undefined`, not a function. */
export function riskTierFor(toolName: string): RiskTier | undefined {
  return Object.hasOwn(ADT_RISK_TIERS, toolName) ? ADT_RISK_TIERS[toolName] : undefined;
}

export const ADT_RISK_TIERS: Record<string, RiskTier> = Object.assign(Object.create(null) as Record<string, RiskTier>, {
  // Tier A - read-only, no mutation, no guardrail prompt in any mode.
  adt_discovery: 'A',
  adt_search: 'A',
  adt_object_source_read: 'A',
  adt_ddic_element: 'A',
  adt_usage_references: 'A',
  adt_package_contents: 'A',
  adt_transport_info: 'A',
  adt_revisions: 'A',
  adt_atc_worklist: 'A',
  adt_git_repos: 'A',
  adt_syntax_check: 'A', // POST, but only evaluates a supplied source buffer - no state created.
  adt_code_completion_proposal: 'A', // same: transient analysis of a supplied buffer.
  adt_code_completion_element_info: 'A',
  adt_traces_list: 'A',

  // Tier B - creates state but does not alter source/transports; reversible/inspectable; also
  // used for reads that are technically non-mutating but carry a confidentiality/execution risk
  // a plain metadata read doesn't (per the one-time SAP-domain review in tasks.md 8.3).
  adt_ddic_table_contents: 'B', // arbitrary application-data query (up to 10k rows) - can expose
  // PII/financial data; a plain-read Tier A with no confirmation on any mode (including a
  // "read-only" production system) understates that.
  adt_traces_hit_list: 'B', // returns statements captured from other users' traced sessions,
  adt_traces_db_access: 'B', // including literal WHERE-clause values - same confidentiality class
  // as adt_ddic_table_contents, reached without naming a table.
  adt_atc_create_run: 'B',
  adt_transport_create: 'B',
  adt_refactor_rename_preview: 'B',
  adt_object_unlock: 'B', // releases state rather than creating it; gating it as hard as `lock`
  // strands an enqueue lock if a confirmation is declined/unsupported, blocking other developers.
  adt_debugger_delete_breakpoints: 'B', // same asymmetry - leftover breakpoints halt live sessions.
  adt_traces_create_configuration: 'B', // creates a transient trace run request - inspectable/
  // reversible, same class as adt_atc_create_run.
  adt_refactor_extract_method_preview: 'B',
  adt_traces_delete: 'B', // deletes what adt_traces_create_configuration (also B) creates - same
  // "cleanup is never gated harder than the action that created it" asymmetry as unlock/
  // delete-breakpoints above; a declined/unsupported confirmation would otherwise strand a live
  // trace consuming system resources instead of releasing it.

  // Tier C - destructive, production-impacting, or executes arbitrary customer code.
  adt_unit_test_run: 'C', // ABAP Unit test classes can be marked DANGEROUS/CRITICAL and legitimately
  // commit DB changes or call remote systems - this runs arbitrary customer ABAP, not just
  // "creates an inspectable run".
  adt_transport_release: 'C',
  adt_object_source_write: 'C',
  adt_object_create: 'C',
  adt_object_delete: 'C',
  adt_object_lock: 'C',
  adt_object_activate: 'C',
  adt_refactor_rename_execute: 'C',
  adt_git_pull: 'C',
  adt_git_push: 'C',
  adt_debugger_attach: 'C',
  adt_debugger_set_breakpoints: 'C',
  adt_debugger_step: 'C',
  adt_debugger_variables: 'C',
  adt_refactor_extract_method_execute: 'C',
  adt_debugger_set_variable_value: 'C', // modifies live process state, same class as attach/step.
});
