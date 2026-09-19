import { AdtError } from 'sap-adt-client';
import type { SystemRegistry } from '../config/SystemRegistry';
import type { IAdtGateway } from '../gateway/IAdtGateway';
import type { AdtGuardrail } from '../guardrails/AdtGuardrail';
import { riskTierFor, type RiskTier } from '../guardrails/AdtRiskTiers';
import type { Tool } from './Tool';
import {
  adtErrorToToolResult,
  guardrailDenialToToolResult,
  unexpectedErrorToToolResult,
  type ToolTextResult,
} from './errors';

export interface ToolSuccessResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * Registers `Tool` implementations and is the single choke point their calls pass through (per
 * `design.md` D2): validate args -> resolve `system` -> guardrail check -> `execute` ->
 * normalize. No tool module reaches `IAdtGateway` any other way, so a denied call never reaches
 * `execute` and every `AdtError`/guardrail denial is normalized identically regardless of which
 * tool produced it.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool<any, unknown>>();

  constructor(
    private readonly gateway: IAdtGateway,
    private readonly systemRegistry: SystemRegistry,
    private readonly guardrail: AdtGuardrail,
  ) {}

  /** Registers `tool`. Throws immediately if `AdtRiskTiers` has no entry for its name (task 3.1:
   * "no silent default") or if the name is already registered. */
  register(tool: Tool<any, unknown>): void {
    if (riskTierFor(tool.name) === undefined) {
      throw new Error(`ToolRegistry: no risk tier registered for tool "${tool.name}" in AdtRiskTiers`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`ToolRegistry: tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): Array<Tool<any, unknown>> {
    return [...this.tools.values()];
  }

  async invoke(name: string, rawArgs: unknown): Promise<ToolTextResult | ToolSuccessResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return unexpectedErrorToToolResult(new Error(`Unknown tool "${name}"`));
    }
    const tier = riskTierFor(tool.name) as RiskTier;

    const parsed = tool.inputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return unexpectedErrorToToolResult(new Error(`Invalid arguments for "${name}": ${parsed.error.message}`));
    }
    const args = parsed.data;

    let system;
    try {
      system = this.systemRegistry.getSystem(args.system);
    } catch (error) {
      return unexpectedErrorToToolResult(error);
    }

    const outcome = await this.guardrail.evaluate(system, tool.name, tier, args as unknown as Record<string, unknown>);
    if (!outcome.allowed) {
      return guardrailDenialToToolResult(outcome.denial);
    }

    try {
      const result = await tool.execute(this.gateway, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      if (error instanceof AdtError) {
        return adtErrorToToolResult(error);
      }
      return unexpectedErrorToToolResult(error);
    }
  }
}
