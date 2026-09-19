import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, buildConfirmationMessage, formatArgsForConfirmation } from './server';
import { SystemRegistry } from './config/SystemRegistry';
import { allTools } from './tools';

function testRegistry(): SystemRegistry {
  return SystemRegistry.fromObject({
    dev: {
      url: 'https://dev.example.com:44300',
      client: '100',
      auth: { type: 'basic', user: 'u', password: 'p' },
      mode: 'guarded',
    },
  });
}

describe('server boot + tool listing', () => {
  it('assembles cleanly and lists every registered tool over a real MCP connection', async () => {
    const { mcpServer } = createServer(testRegistry());

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });

    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(allTools.map((tool) => tool.name).sort());
    expect(tools.length).toBe(allTools.length);
    // Every tool declares its "system" parameter as required input.
    for (const tool of tools) {
      const schema = tool.inputSchema as { required?: string[] };
      expect(schema.required).toContain('system');
    }

    await client.close();
    await mcpServer.close();
  });
});

/** Connects a client that advertises elicitation support and answers every confirmation prompt
 * with `reply`, then runs one Tier C call through the real guardrail chain. */
async function callTierCWithElicitation(
  reply: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> },
): Promise<{ text: string; prompts: string[] }> {
  const { mcpServer } = createServer(testRegistry());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: { elicitation: {} } });

  const prompts: string[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    prompts.push(request.params.message);
    return reply;
  });

  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  const result = (await client.callTool({
    name: 'adt_object_lock',
    arguments: { system: 'dev', objectUri: '/sap/bc/adt/programs/programs/YTEST' },
  })) as { content: Array<{ text: string }> };
  await client.close();
  await mcpServer.close();

  return { text: result.content.map((part) => part.text).join('\n'), prompts };
}

describe('elicitation confirmation (server.ts)', () => {
  it('denies the call when the user submits the form with Confirm unticked', async () => {
    const { text, prompts } = await callTierCWithElicitation({ action: 'accept', content: { confirmed: false } });

    expect(prompts).toHaveLength(1);
    expect(text).toContain('declined-confirmation');
  });

  it('denies the call when an accepted form carries no content at all', async () => {
    const { text } = await callTierCWithElicitation({ action: 'accept' });
    expect(text).toContain('declined-confirmation');
  });

  it('never approves the call on a truthy non-boolean "confirmed"', async () => {
    const { text } = await callTierCWithElicitation({ action: 'accept', content: { confirmed: 'yes' } });
    // The SDK rejects this against `requestedSchema` before it reaches the capability; the
    // `=== true` check backstops it either way. Both paths must end in a non-approval.
    expect(text).toMatch(/declined-confirmation|does not match requested schema/);
  });

  it('lets the call proceed past the guardrail only when Confirm is ticked', async () => {
    const { text } = await callTierCWithElicitation({ action: 'accept', content: { confirmed: true } });
    // Reaches execution (and fails on the unreachable fake host) instead of being denied.
    expect(text).not.toContain('declined-confirmation');
    expect(text).not.toContain('Guardrail denied');
  });

  it('still denies an explicit decline, whatever content rides along', async () => {
    const { text } = await callTierCWithElicitation({ action: 'decline', content: { confirmed: true } });
    expect(text).toContain('declined-confirmation');
  });

  it('names the system URL and SAP client in the prompt, not just the alias', async () => {
    const { prompts } = await callTierCWithElicitation({ action: 'decline' });

    expect(prompts[0]).toContain('https://dev.example.com:44300');
    expect(prompts[0]).toContain('client 100');
  });
});

describe('confirmation prompt formatting', () => {
  it('truncates a long argument value with an explicit elision marker', () => {
    const source = 'X'.repeat(50_000);
    const text = formatArgsForConfirmation({ system: 'dev', objectUri: '/x/y', source });

    expect(text.length).toBeLessThan(1000);
    expect(text).toContain('[truncated, 50000 chars total]');
    expect(text).not.toContain('X'.repeat(500));
  });

  it('puts identifying fields first and drops the redundant "system" argument', () => {
    const text = formatArgsForConfirmation({
      zzz: 'last',
      system: 'dev',
      transportNumber: 'DEVK900123',
      objectUri: '/sap/bc/adt/oo/classes/zcl_a',
    });

    expect(text).not.toMatch(/^\s*system:/m);
    const lines = text.split('\n');
    expect(lines[0]).toContain('objectUri');
    expect(lines[1]).toContain('transportNumber');
    expect(lines[2]).toContain('zzz');
  });

  it('renders each argument on its own line rather than one raw JSON blob', () => {
    const text = formatArgsForConfirmation({ objectUri: '/a', packageName: 'ZFI' });
    expect(text).toBe('  objectUri: /a\n  packageName: ZFI');
  });

  it('says so explicitly when a call carries no arguments beyond "system"', () => {
    expect(formatArgsForConfirmation({ system: 'dev' })).toContain('(no arguments)');
  });

  it('falls back to the alias alone when the system cannot be resolved', () => {
    const message = buildConfirmationMessage(
      { toolName: 'adt_object_delete', scope: 'prd', riskTier: 'C', args: {} },
      undefined,
    );
    expect(message).toContain('System: prd');
    expect(message).toContain('risk tier C');
  });
});
