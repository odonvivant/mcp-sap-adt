import {
  CompositeGuardrail,
  ConfigPolicy,
  ElicitationPolicy,
  type CallContext,
  type ElicitationCapability,
} from 'mcp-guardrails';
import type { ResolvedSystem } from '../config/SystemRegistry';
import { checkObjectScope, toConfigPolicyConfig } from '../config/GuardrailConfig';
import { compareTiers, type RiskTier } from './AdtRiskTiers';

export type GuardrailDenialCategory = 'read-only' | 'scope' | 'declined-confirmation' | 'no-elicitation-support';

export interface GuardrailDenial {
  category: GuardrailDenialCategory;
  reason: string;
}

export type GuardrailOutcome = { allowed: true } | { allowed: false; denial: GuardrailDenial };

export interface GuardrailLogEntry {
  toolName: string;
  system: string;
  tier: RiskTier;
  args: Record<string, unknown>;
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
export class AdtGuardrail {
  private readonly configPolicy: ConfigPolicy<RiskTier>;
  private readonly composite: CompositeGuardrail<RiskTier>;

  constructor(
    systems: ResolvedSystem[],
    private readonly elicitationCapability: ElicitationCapability,
    private readonly onLog: (entry: GuardrailLogEntry) => void = () => {},
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

    const scopeDenial = checkObjectScope(system, args);
    if (scopeDenial) {
      return { allowed: false, denial: { category: 'scope', reason: scopeDenial.reason } };
    }

    const context: CallContext<RiskTier> = { toolName, scope: system.alias, riskTier: tier, args };
    const configDecision = this.configPolicy.evaluate(context);
    const finalDecision = await this.composite.evaluate(context);

    if (finalDecision === 'allow') {
      if (system.mode === 'open') {
        this.onLog({ toolName, system: system.alias, tier, args });
      }
      return { allowed: true };
    }

    if (configDecision !== 'ask') {
      return {
        allowed: false,
        denial: {
          category: 'read-only',
          reason: `system "${system.alias}" is read-only; Tier ${tier} tools are blocked regardless of confirmation`,
        },
      };
    }

    if (!this.elicitationCapability.isSupported()) {
      return {
        allowed: false,
        denial: {
          category: 'no-elicitation-support',
          reason:
            'the connected client does not support confirmation prompts (MCP elicitation); denied by default rather than treated as approved',
        },
      };
    }

    return {
      allowed: false,
      denial: { category: 'declined-confirmation', reason: 'confirmation was declined by the connected client' },
    };
  }
}
