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

/** Longest argument value rendered into a confirmation prompt. A full ABAP source buffer would
 * otherwise push the identifying fields past whatever the client truncates at, leaving the human
 * approving a prompt they can't actually read to the end of. */
const MAX_ARG_CHARS = 240;

/** Argument names that identify *what* a call touches, shown first and in this order. */
const IDENTIFYING_ARGS = [
  'objectUri',
  'objectName',
  'objectType',
  'packageName',
  'targetPackage',
  'transportNumber',
  'transport',
  'newName',
];

function renderArgValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return String(value);
  if (text.length <= MAX_ARG_CHARS) return text;
  return `${text.slice(0, MAX_ARG_CHARS)} ... [truncated, ${text.length} chars total]`;
}

/** Renders a call's arguments one-per-line with identifying fields first and every value length-
 * capped, instead of a single raw JSON blob. Exported for testing. */
export function formatArgsForConfirmation(args: Record<string, unknown>): string {
  const names = Object.keys(args).filter((name) => name !== 'system');
  const ordered = [
    ...IDENTIFYING_ARGS.filter((name) => names.includes(name)),
    ...names.filter((name) => !IDENTIFYING_ARGS.includes(name)).sort(),
  ];
  if (ordered.length === 0) return '  (no arguments)';
  return ordered.map((name) => `  ${name}: ${renderArgValue(args[name])}`).join('\n');
}

/** Builds the human-facing confirmation text. Names the system's real URL and SAP client, not just
 * its alias - one server commonly serves dev and prod at once, and "prd" vs "prd2" is too weak a
 * distinguisher for someone about to approve a destructive call. Exported for testing. */
export function buildConfirmationMessage(
  summary: { toolName: string; scope: string; riskTier: unknown; args: Record<string, unknown> },
  system?: { url: string; client: string },
): string {
  const target = system ? `${summary.scope} - ${system.url} (client ${system.client})` : summary.scope;
  return [
    `Confirm "${summary.toolName}" (risk tier ${String(summary.riskTier)})`,
    `System: ${target}`,
    'Arguments:',
    formatArgsForConfirmation(summary.args),
  ].join('\n');
}

/** Adapts the SDK's low-level elicitation API to `mcp-guardrails`' `ElicitationCapability`. Any
 * client that hasn't advertised the `elicitation` capability is treated as unsupported, so the
 * guardrail chain fails closed instead of attempting a request the client can't answer. */
function buildElicitationCapability(mcpServer: McpServer, systemRegistry: SystemRegistry): ElicitationCapability {
  return {
    isSupported: () => Boolean(mcpServer.server.getClientCapabilities()?.elicitation),
    elicit: async (summary) => {
      let system: { url: string; client: string } | undefined;
      try {
        system = systemRegistry.getSystem(summary.scope);
      } catch {
        // An unknown alias never reaches here (ToolRegistry resolves it first); prompt without the
        // URL rather than failing the confirmation outright.
      }
      const result = await mcpServer.server.elicitInput({
        message: buildConfirmationMessage(summary, system),
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
      // `action: "accept"` only means the user submitted the form - the checkbox they submitted it
      // with is what actually carries their answer. Anything other than an explicit `true` is a
      // decline, so an unticked (or absent, or non-boolean) `confirmed` can never allow the call.
      const confirmed = result.action === 'accept' && result.content?.confirmed === true;
      return { action: confirmed ? 'accept' : 'decline' };
    },
  };
}

function logGuardrailDecision(entry: GuardrailLogEntry): void {
  // Stdout is reserved for the MCP JSON-RPC stream - all diagnostic/log output goes to stderr.
  const denial = entry.denial ? ` denial=${entry.denial}` : '';
  console.error(
    `[mcp-sap-adt] guardrail: tool=${entry.toolName} system=${entry.system} tier=${entry.tier} ` +
      `mode=${entry.mode} decision=${entry.decision}${denial}`,
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
    buildElicitationCapability(mcpServer, systemRegistry),
    logGuardrailDecision,
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
