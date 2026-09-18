import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server';
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
