import { z } from 'zod';
import { AdtError } from 'sap-adt-client';
import { ToolRegistry } from './ToolRegistry';
import type { Tool } from './Tool';
import { SystemRegistry } from '../config/SystemRegistry';
import { FakeAdtGateway } from '../gateway/FakeAdtGateway';
import type { AdtGuardrail, GuardrailOutcome } from '../guardrails/AdtGuardrail';

// AdtRiskTiers already contains every real tool name; register a throwaway fake tool under a
// real name so ToolRegistry's tier lookup succeeds without depending on the real tool modules.
const TEST_TOOL_NAME = 'adt_search'; // Tier A in AdtRiskTiers

function makeTool(execute: Tool['execute']): Tool {
  return {
    name: TEST_TOOL_NAME,
    description: 'test tool',
    inputSchema: z.object({ system: z.string(), query: z.string().optional() }).strict(),
    execute,
  };
}

function makeRegistry(overrides: Record<string, unknown> = {}) {
  return SystemRegistry.fromObject({
    dev: {
      url: 'https://dev.example.com',
      client: '100',
      auth: { type: 'basic', user: 'u', password: 'p' },
      mode: 'guarded',
      ...overrides,
    },
  });
}

function guardrailStub(outcome: GuardrailOutcome): AdtGuardrail {
  return { evaluate: jest.fn().mockResolvedValue(outcome) } as unknown as AdtGuardrail;
}

describe('ToolRegistry.register', () => {
  it('throws if the tool has no AdtRiskTiers entry', () => {
    const gateway = new FakeAdtGateway();
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
    expect(() =>
      registry.register({
        name: 'not_a_real_tool',
        description: 'x',
        inputSchema: z.object({ system: z.string() }),
        execute: async () => ({}),
      }),
    ).toThrow(/no risk tier/);
  });

  it('throws on duplicate registration', () => {
    const gateway = new FakeAdtGateway();
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
    const tool = makeTool(async () => ({}));
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow(/already registered/);
  });
});

describe('ToolRegistry.invoke', () => {
  it('never calls execute when the guardrail denies the call', async () => {
    const gateway = new FakeAdtGateway();
    const execute = jest.fn(async () => ({ ok: true }));
    const registry = new ToolRegistry(
      gateway,
      makeRegistry(),
      guardrailStub({ allowed: false, denial: { category: 'read-only', reason: 'system is read-only' } }),
    );
    registry.register(makeTool(execute));

    const result = await registry.invoke(TEST_TOOL_NAME, { system: 'dev' });

    expect(execute).not.toHaveBeenCalled();
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain('read-only');
  });

  it('calls execute and wraps a successful result when the guardrail allows the call', async () => {
    const gateway = new FakeAdtGateway();
    const execute = jest.fn(async () => ({ hello: 'world' }));
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
    registry.register(makeTool(execute));

    const result = await registry.invoke(TEST_TOOL_NAME, { system: 'dev', query: 'ZCL*' });

    expect(execute).toHaveBeenCalledWith(gateway, { system: 'dev', query: 'ZCL*' });
    expect((result as any).content[0].text).toContain('world');
  });

  it('passes every parsed arg (including an optional packageName) through to guardrail.evaluate, not just gateway-bound fields', async () => {
    const gateway = new FakeAdtGateway();
    const guardrail = guardrailStub({ allowed: true });
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrail);
    const tool: Tool = {
      name: TEST_TOOL_NAME,
      description: 'test tool',
      inputSchema: z.object({ system: z.string(), objectUri: z.string(), packageName: z.string().optional() }).strict(),
      execute: async (_gateway, args) => ({ objectUri: (args as any).objectUri }),
    };
    registry.register(tool);

    await registry.invoke(TEST_TOOL_NAME, { system: 'dev', objectUri: '/x', packageName: 'Z_LEGACY' });

    expect(guardrail.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'dev' }),
      TEST_TOOL_NAME,
      'A',
      expect.objectContaining({ packageName: 'Z_LEGACY' }),
    );
  });

  it('rejects args missing the required system field before any guardrail/ADT logic runs', async () => {
    const gateway = new FakeAdtGateway();
    const guardrail = guardrailStub({ allowed: true });
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrail);
    registry.register(makeTool(async () => ({})));

    const result = await registry.invoke(TEST_TOOL_NAME, { query: 'x' });

    expect((result as any).isError).toBe(true);
    expect(guardrail.evaluate).not.toHaveBeenCalled();
  });

  it('rejects an unknown system alias with no guardrail evaluation and no gateway call', async () => {
    const gateway = new FakeAdtGateway();
    const guardrail = guardrailStub({ allowed: true });
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrail);
    registry.register(makeTool(async () => ({})));

    const result = await registry.invoke(TEST_TOOL_NAME, { system: 'doesnotexist' });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain('doesnotexist');
    expect(guardrail.evaluate).not.toHaveBeenCalled();
    expect(gateway.calls).toHaveLength(0);
  });

  it('reports an unknown tool name as an error result', async () => {
    const gateway = new FakeAdtGateway();
    const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
    const result = await registry.invoke('nope', {});
    expect((result as any).isError).toBe(true);
  });

  describe('AdtError normalization', () => {
    const cases: Array<[string, AdtError, RegExp]> = [
      [
        '401 -> authentication hint',
        new AdtError({ httpStatus: 401, request: { method: 'GET', path: '/x' }, hint: 'Authentication or authorization failed (HTTP 401).' }),
        /Authentication or authorization failed/,
      ],
      [
        '404 -> object/system-not-found hint',
        new AdtError({ httpStatus: 404, request: { method: 'GET', path: '/x' }, hint: 'Object not found, or the request targets the wrong system/client.' }),
        /Object not found/,
      ],
      [
        '400 with syntax payload -> parsed syntax error list',
        new AdtError({
          httpStatus: 400,
          request: { method: 'POST', path: '/x' },
          hint: 'ABAP syntax/activation check failed with 1 message(s).',
          syntaxErrors: [{ type: 'E', shortText: 'Unexpected token' }],
        }),
        /Unexpected token/,
      ],
    ];

    it.each(cases)('%s', async (_label, error) => {
      const gateway = new FakeAdtGateway();
      const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
      registry.register(
        makeTool(async () => {
          throw error;
        }),
      );

      const result = await registry.invoke(TEST_TOOL_NAME, { system: 'dev' });
      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).not.toMatch(/^request failed$/i);
    });

    it('never returns a bare "request failed" with no diagnostic detail', async () => {
      const gateway = new FakeAdtGateway();
      const registry = new ToolRegistry(gateway, makeRegistry(), guardrailStub({ allowed: true }));
      registry.register(
        makeTool(async () => {
          throw new AdtError({ httpStatus: 500, request: { method: 'GET', path: '/x' }, hint: 'ADT request failed with HTTP 500.' });
        }),
      );

      const result = await registry.invoke(TEST_TOOL_NAME, { system: 'dev' });
      const text = (result as any).content[0].text as string;
      expect(text.length).toBeGreaterThan('request failed'.length);
      expect(text).toContain('500');
    });
  });

  it('is distinguishable from an ADT error: a guardrail denial never carries an HTTP status', async () => {
    const gateway = new FakeAdtGateway();
    const registry = new ToolRegistry(
      gateway,
      makeRegistry(),
      guardrailStub({ allowed: false, denial: { category: 'scope', reason: 'out of scope' } }),
    );
    registry.register(makeTool(async () => ({})));

    const result = await registry.invoke(TEST_TOOL_NAME, { system: 'dev' });
    const text = (result as any).content[0].text as string;
    expect(text).toMatch(/^Guardrail denied/);
    expect(text).not.toMatch(/HTTP \d/);
  });
});
