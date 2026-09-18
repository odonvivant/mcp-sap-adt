#!/usr/bin/env node
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ElicitationCapability } from 'mcp-guardrails';
import { SystemRegistry, SystemsFileMissingError, SystemConfigError } from './config/SystemRegistry';
import { AdtGateway } from './gateway/AdtGateway';
import { AdtGuardrail, type GuardrailLogEntry } from './guardrails/AdtGuardrail';
import { ToolRegistry } from './tools/ToolRegistry';
import { allTools } from './tools';

const SERVER_NAME = 'mcp-sap-adt';
const SERVER_VERSION = '0.1.0';

/** Adapts the SDK's low-level elicitation API to `mcp-guardrails`' `ElicitationCapability`. Any
 * client that hasn't advertised the `elicitation` capability is treated as unsupported, so the
 * guardrail chain fails closed instead of attempting a request the client can't answer. */
function buildElicitationCapability(mcpServer: McpServer): ElicitationCapability {
  return {
    isSupported: () => Boolean(mcpServer.server.getClientCapabilities()?.elicitation),
    elicit: async (summary) => {
      const result = await mcpServer.server.elicitInput({
        message:
          `Confirm "${summary.toolName}" on system "${summary.scope}" (risk tier ${String(summary.riskTier)})?\n` +
          `Arguments: ${JSON.stringify(summary.args)}`,
        requestedSchema: {
          type: 'object',
          properties: {
            confirmed: {
              type: 'boolean',
              title: 'Confirm',
              description: 'Approve this call against the SAP system?',
            },
          },
          required: ['confirmed'],
        },
      });
      return { action: result.action };
    },
  };
}

function logOpenModeCall(entry: GuardrailLogEntry): void {
  // Stdout is reserved for the MCP JSON-RPC stream - all diagnostic/log output goes to stderr.
  console.error(
    `[mcp-sap-adt] open-mode call: tool=${entry.toolName} system=${entry.system} tier=${entry.tier}`,
  );
}

/** Wires `SystemRegistry` + `AdtGateway` + `AdtGuardrail`/`AdtRiskTiers` + `ToolRegistry` into an
 * `@modelcontextprotocol/sdk` `McpServer`, registering every tool in `allTools`. Exported
 * separately from `main()` so tests can build a server against an in-memory `SystemRegistry`
 * without a stdio transport. */
export function createServer(systemRegistry: SystemRegistry): { mcpServer: McpServer; toolRegistry: ToolRegistry } {
  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  const gateway = new AdtGateway(systemRegistry);
  const guardrail = new AdtGuardrail(
    systemRegistry.listSystems(),
    buildElicitationCapability(mcpServer),
    logOpenModeCall,
  );
  const toolRegistry = new ToolRegistry(gateway, systemRegistry, guardrail);

  for (const tool of allTools) {
    toolRegistry.register(tool);
    // `registerTool`'s generics can't be inferred across a heterogeneous array of tools with
    // different Zod shapes; each tool's own args are already validated by `ToolRegistry.invoke`
    // via `tool.inputSchema`, so the SDK-facing shape here is only for client-side introspection.
    const registerTool = mcpServer.registerTool.bind(mcpServer) as (
      name: string,
      config: { description: string; inputSchema: z.ZodRawShape },
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ) => unknown;
    registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: (tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape,
      },
      (args) => toolRegistry.invoke(tool.name, args),
    );
  }

  return { mcpServer, toolRegistry };
}

async function main(): Promise<void> {
  let systemRegistry: SystemRegistry;
  try {
    systemRegistry = SystemRegistry.load();
  } catch (error) {
    if (error instanceof SystemsFileMissingError || error instanceof SystemConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const { mcpServer } = createServer(systemRegistry);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error(`${SERVER_NAME} running on stdio (${systemRegistry.listAliases().length} system(s) configured)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
