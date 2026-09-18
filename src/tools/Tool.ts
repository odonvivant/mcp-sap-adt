import type { z } from 'zod';
import type { IAdtGateway } from '../gateway/IAdtGateway';

/** Every tool's input schema requires `system` - the alias into `SystemRegistry` the call
 * targets (per `tools` spec's "every tool requires a system parameter"). */
export interface WithSystem {
  system: string;
}

/**
 * A single registered ADT tool. Tools know nothing about guardrails or error normalization (per
 * `design.md` D2) - they validate/accept already-parsed args and call `IAdtGateway`.
 * `ToolRegistry` looks up the tool's risk tier from `AdtRiskTiers` by `name`, not from this
 * interface, so tier assignment has exactly one source of truth.
 */
export interface Tool<Args extends WithSystem = WithSystem, Result = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Args>;
  execute(gateway: IAdtGateway, args: Args): Promise<Result>;
}
