import type { ConfigPolicyConfig, ScopeConfig } from 'mcp-guardrails';
import type { ResolvedSystem, SystemMode } from './SystemRegistry';
import type { RiskTier } from '../guardrails/AdtRiskTiers';

/** Tier B/C calls are gated by a system's mode; Tier A is always below this threshold, so
 * `ConfigPolicy` allows it unconditionally regardless of mode (per `isAtLeastAsRisky`). */
export const GUARDED_THRESHOLD: RiskTier = 'B';

const MODE_TO_POLICY_MODE: Record<SystemMode, 'deny' | 'ask' | 'allow'> = {
  'read-only': 'deny',
  guarded: 'ask',
  open: 'allow',
};

/** Translates each configured system's `mode` into `mcp-guardrails`' `ConfigPolicy` shape, keyed
 * by system alias (the `scope` every tool call is evaluated under). */
export function toConfigPolicyConfig(systems: ResolvedSystem[]): ConfigPolicyConfig<RiskTier> {
  const scopes: Record<string, ScopeConfig<RiskTier>> = {};
  for (const system of systems) {
    scopes[system.alias] = {
      mode: MODE_TO_POLICY_MODE[system.mode],
      threshold: GUARDED_THRESHOLD,
    };
  }
  return { scopes };
}

export interface ScopeDenial {
  reason: string;
}

function normalizePrefix(prefix: string): string {
  return prefix.endsWith('*') ? prefix.slice(0, -1) : prefix;
}

function matchesAnyPrefix(value: string, prefixes: string[]): boolean {
  const upper = value.toUpperCase();
  return prefixes.some((prefix) => upper.startsWith(normalizePrefix(prefix).toUpperCase()));
}

/**
 * Package/object-type scope pre-check for Tier B/C calls, evaluated before `ConfigPolicy` and
 * any elicitation prompt. `ConfigPolicy`'s predicates match argument values by exact equality;
 * `allowPackages`/`denyPackages` need prefix matching (`"Z*"`), which is ADT-specific enough that
 * it lives here rather than being forced into `ConfigPolicy`'s generic predicate shape.
 *
 * Looks at `args.packageName` or `args.targetPackage` for package scoping, and `args.objectType`
 * for object-type scoping; a tool whose args carry neither is unaffected by scope config.
 */
export function checkObjectScope(
  system: ResolvedSystem,
  args: Record<string, unknown>,
): ScopeDenial | undefined {
  const packageName = (args.packageName ?? args.targetPackage) as string | undefined;
  const objectType = args.objectType as string | undefined;

  if (packageName && system.denyPackages && matchesAnyPrefix(packageName, system.denyPackages)) {
    return {
      reason: `package "${packageName}" matches a denyPackages prefix configured for system "${system.alias}"`,
    };
  }
  if (
    packageName &&
    system.allowPackages &&
    system.allowPackages.length > 0 &&
    !matchesAnyPrefix(packageName, system.allowPackages)
  ) {
    return {
      reason: `package "${packageName}" is outside the allowPackages scope configured for system "${system.alias}"`,
    };
  }
  if (
    objectType &&
    system.allowObjectTypes &&
    system.allowObjectTypes.length > 0 &&
    !system.allowObjectTypes.includes(objectType)
  ) {
    return {
      reason: `object type "${objectType}" is outside the allowObjectTypes scope configured for system "${system.alias}"`,
    };
  }
  return undefined;
}
