import {
  CompositeGuardrail,
  ConfigPolicy,
  ElicitationPolicy,
  type CallContext,
  type ElicitationCapability,
} from 'mcp-guardrails';
import type { ResolvedSystem, SystemMode } from '../config/SystemRegistry';
import { checkObjectScope, hasScopeConfig, toConfigPolicyConfig } from '../config/GuardrailConfig';
import { compareTiers, type RiskTier } from './AdtRiskTiers';

export type GuardrailDenialCategory = 'read-only' | 'scope' | 'declined-confirmation' | 'no-elicitation-support';

export interface GuardrailDenial {
  category: GuardrailDenialCategory;
  reason: string;
}

export type GuardrailOutcome = { allowed: true } | { allowed: false; denial: GuardrailDenial };

/**
 * One audit record per Tier B/C guardrail decision - emitted for approvals and denials alike, so
 * an approved production write leaves the same trace a blocked one does.
 *
 * Deliberately carries no argument values. `GuardrailDenial.reason` is free text that quotes them
 * (package names, object URIs), so only the denial *category* is recorded here - an audit log must
 * not become a second copy of every source buffer, table name or object path sent through a tool.
 */
export interface GuardrailLogEntry {
  toolName: string;
  system: string;
  tier: RiskTier;
  mode: SystemMode;
  decision: 'allow' | 'deny';
  denial?: GuardrailDenialCategory;
}

/**
 * Composes `mcp-guardrails`' generic `ConfigPolicy` + `ElicitationPolicy` (via
 * `CompositeGuardrail`) with the ADT-specific package/object-type scope pre-check, and turns the
 * plain allow/deny outcome into a denial reason the calling agent can act on (per
 * `guardrails-integration`'s "every guardrail decision is explained" requirement) - something
 * `CompositeGuardrail` itself, being protocol-agnostic, does not attempt to do.
 *
 * `configPolicy.evaluate` is pure/synchronous (no I/O, no side effects), so calling it once here
 * to classify the reason and again inside `CompositeGuardrail.evaluate` for the actual decision
 * is safe - it never causes the live user-facing elicitation prompt to fire twice.
 */

/**
 * Looks up what an object *actually* is, from the system rather than from the call's arguments.
 * Injected so this class stays free of ADT I/O and stays unit-testable.
 */
export type ObjectScopeResolver = (
  systemAlias: string,
  objectUri: string,
) => Promise<{ packageName?: string; objectType?: string }>;

const SCOPE_CACHE_TTL_MS = 5 * 60 * 1000;
const SCOPE_CACHE_MAX = 500;

export class AdtGuardrail {
  private readonly configPolicy: ConfigPolicy<RiskTier>;
  private readonly composite: CompositeGuardrail<RiskTier>;
  private readonly scopeCache = new Map<string, { value: { packageName?: string; objectType?: string }; at: number }>();

  constructor(
    systems: ResolvedSystem[],
    private readonly elicitationCapability: ElicitationCapability,
    private readonly onLog: (entry: GuardrailLogEntry) => void = () => {},
    /** Omitted only in tests that configure no package/object-type scope. When a system *does*
     * configure scope and this is absent, a scoped call is denied rather than waved through. */
    private readonly resolveObject?: ObjectScopeResolver,
  ) {
    this.configPolicy = new ConfigPolicy(toConfigPolicyConfig(systems), compareTiers);
    this.composite = new CompositeGuardrail(this.configPolicy, new ElicitationPolicy(elicitationCapability));
  }

  async evaluate(
    system: ResolvedSystem,
    toolName: string,
    tier: RiskTier,
    args: Record<string, unknown>,
  ): Promise<GuardrailOutcome> {
    if (tier === 'A') {
      return { allowed: true };
    }

    const audit = (outcome: GuardrailOutcome): GuardrailOutcome => {
      this.onLog({
        toolName,
        system: system.alias,
        tier,
        mode: system.mode,
        decision: outcome.allowed ? 'allow' : 'deny',
        denial: outcome.allowed ? undefined : outcome.denial.category,
      });
      return outcome;
    };

    let scopeArgs = args;
    if (hasScopeConfig(system) && typeof args.objectUri === 'string' && args.objectUri.length > 0) {
      // `packageName`/`objectType` arrive as optional arguments that the *caller* supplies and
      // that are never sent to SAP - so as scope input they are a self-declaration, and omitting
      // `packageName` used to skip the denyPackages check entirely. Ask the system instead.
      //
      // Only objectUri-bearing calls need this. `adt_object_create` has no object to look up yet,
      // and there its `targetPackage`/`objectType` args *are* authoritative: they are exactly what
      // gets sent to SAP, so a lie in them is a lie to SAP too, not a way around the guardrail.
      try {
        const resolved = await this.resolveScope(system.alias, args.objectUri);
        if (!resolved.packageName) {
          throw new Error('the system did not report which package it belongs to');
        }
        scopeArgs = {
          ...args,
          packageName: resolved.packageName,
          targetPackage: undefined,
          objectType: resolved.objectType ?? args.objectType,
        };
      } catch (error) {
        // Fail closed: unable to verify scope is not the same as in scope.
        return audit({
          allowed: false,
          denial: {
            category: 'scope',
            reason:
              `cannot verify the package of "${args.objectUri}" on system "${system.alias}", and that system configures ` +
              `package/object-type scope, so the call is denied rather than assumed in scope (${(error as Error).message})`,
          },
        });
      }
    }

    const scopeDenial = checkObjectScope(system, scopeArgs);
    if (scopeDenial) {
      return audit({ allowed: false, denial: { category: 'scope', reason: scopeDenial.reason } });
    }

    const context: CallContext<RiskTier> = { toolName, scope: system.alias, riskTier: tier, args };
    const configDecision = this.configPolicy.evaluate(context);
    const finalDecision = await this.composite.evaluate(context);

    if (finalDecision === 'allow') {
      return audit({ allowed: true });
    }

    if (configDecision !== 'ask') {
      return audit({
        allowed: false,
        denial: {
          category: 'read-only',
          reason: `system "${system.alias}" is read-only; Tier ${tier} tools are blocked regardless of confirmation`,
        },
      });
    }

    if (!this.elicitationCapability.isSupported()) {
      return audit({
        allowed: false,
        denial: {
          category: 'no-elicitation-support',
          reason:
            'the connected client does not support confirmation prompts (MCP elicitation); denied by default rather than treated as approved',
        },
      });
    }

    return audit({
      allowed: false,
      denial: { category: 'declined-confirmation', reason: 'confirmation was declined by the connected client' },
    });
  }

  /** Resolves an object's real package/type, memoized briefly so a burst of calls against the
   * same object doesn't issue a lookup each time. Throws if no resolver is wired. */
  private async resolveScope(
    systemAlias: string,
    objectUri: string,
  ): Promise<{ packageName?: string; objectType?: string }> {
    if (!this.resolveObject) {
      throw new Error('no object resolver is configured for this guardrail');
    }

    const key = JSON.stringify([systemAlias, objectUri]);
    const now = Date.now();
    const cached = this.scopeCache.get(key);
    if (cached && now - cached.at < SCOPE_CACHE_TTL_MS) {
      return cached.value;
    }

    const value = await this.resolveObject(systemAlias, objectUri);

    if (this.scopeCache.size >= SCOPE_CACHE_MAX) {
      const oldest = this.scopeCache.keys().next().value;
      if (oldest !== undefined) this.scopeCache.delete(oldest);
    }
    this.scopeCache.set(key, { value, at: now });
    return value;
  }
}
