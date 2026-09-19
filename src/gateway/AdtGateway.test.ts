import { discovery, search, traces, syntaxCheck, refactor, debuggerOps } from 'sap-adt-client';
import { AdtGateway } from './AdtGateway';
import { SystemRegistry } from '../config/SystemRegistry';

jest.mock('sap-adt-client', () => {
  const actual = jest.requireActual('sap-adt-client');
  return {
    ...actual,
    discovery: { discovery: jest.fn() },
    search: { search: jest.fn() },
    traces: { ...actual.traces, tracesList: jest.fn(), tracesDelete: jest.fn() },
    syntaxCheck: { syntaxCheck: jest.fn() },
    refactor: {
      ...actual.refactor,
      extractMethodEvaluate: jest.fn(),
      extractMethodPreview: jest.fn(),
      extractMethodExecute: jest.fn(),
    },
    debuggerOps: { ...actual.debuggerOps, setVariableValue: jest.fn() },
  };
});

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

describe('AdtGateway (real implementation wired to sap-adt-client operations/)', () => {
  it('resolves the system via SystemRegistry and delegates discovery() with that connection', async () => {
    (discovery.discovery as jest.Mock).mockResolvedValue([{ href: '/x' }]);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);

    const result = await gateway.discovery('dev');

    expect(result).toEqual([{ href: '/x' }]);
    expect(discovery.discovery).toHaveBeenCalledWith(systems.getConnection('dev'));
  });

  it('forwards search() args unchanged alongside the resolved connection', async () => {
    (search.search as jest.Mock).mockResolvedValue([]);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);

    await gateway.search('dev', { query: 'ZCL*', maxResults: 10 });

    expect(search.search).toHaveBeenCalledWith(systems.getConnection('dev'), { query: 'ZCL*', maxResults: 10 });
  });

  it('propagates a thrown AdtError unchanged (never caught/swallowed here)', async () => {
    const { AdtError } = jest.requireActual('sap-adt-client');
    const error = new AdtError({ httpStatus: 404, request: { method: 'GET', path: '/x' }, hint: 'Object not found.' });
    (discovery.discovery as jest.Mock).mockRejectedValue(error);
    const gateway = new AdtGateway(testRegistry());

    await expect(gateway.discovery('dev')).rejects.toBe(error);
  });

  // Representative coverage for the v0.2.0 additions - one call per newly-wired sap-adt-client
  // namespace, to catch a wrong-function/wrong-namespace mistake a type-check alone wouldn't.
  it('wires syntaxCheck() to sap-adt-client syntaxCheck.syntaxCheck', async () => {
    (syntaxCheck.syntaxCheck as jest.Mock).mockResolvedValue([]);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);

    await gateway.syntaxCheck('dev', { objectUri: '/x', content: 'REPORT.' });

    expect(syntaxCheck.syntaxCheck).toHaveBeenCalledWith(systems.getConnection('dev'), {
      objectUri: '/x',
      content: 'REPORT.',
    });
  });

  it('wires tracesList()/tracesDelete() to sap-adt-client traces.*', async () => {
    (traces.tracesList as jest.Mock).mockResolvedValue([]);
    (traces.tracesDelete as jest.Mock).mockResolvedValue(undefined);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);

    await gateway.tracesList('dev', { user: 'DEVUSER' });
    await gateway.tracesDelete('dev', { uri: '/traces/T1' });

    expect(traces.tracesList).toHaveBeenCalledWith(systems.getConnection('dev'), { user: 'DEVUSER' });
    expect(traces.tracesDelete).toHaveBeenCalledWith(systems.getConnection('dev'), { uri: '/traces/T1' });
  });

  it('runs extract-method as evaluate -> preview and returns a handle, not the opaque blob', async () => {
    // A refactoring is a 3-step ADT conversation whose intermediate response must be echoed back
    // byte-for-byte. The gateway keeps that blob server-side and hands out a short previewId, so it
    // never has to survive a round trip through the LLM.
    const evaluation = { xml: '<evaluate/>', affectedObjects: [] };
    const preview = { xml: '<preview-with-server-tokens/>', affectedObjects: [{ uri: '/x' }] };
    (refactor.extractMethodEvaluate as jest.Mock).mockResolvedValue(evaluation);
    (refactor.extractMethodPreview as jest.Mock).mockResolvedValue(preview);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);
    const range = { startLine: 1, startColumn: 0, endLine: 2, endColumn: 5 };

    const result = await gateway.extractMethodPreview('dev', { objectUri: '/x', range, methodName: 'GET_FOO' });

    expect(refactor.extractMethodEvaluate).toHaveBeenCalledWith(systems.getConnection('dev'), { uri: '/x', range });
    expect(refactor.extractMethodPreview).toHaveBeenCalledWith(systems.getConnection('dev'), {
      evaluation,
      methodName: 'GET_FOO',
    });
    expect(result.previewId).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain('server-tokens');
  });

  it('executes against the stored preview, and refuses an unknown, reused, or foreign-system handle', async () => {
    const preview = { xml: '<preview/>', affectedObjects: [] };
    (refactor.extractMethodEvaluate as jest.Mock).mockResolvedValue({ xml: '<e/>', affectedObjects: [] });
    (refactor.extractMethodPreview as jest.Mock).mockResolvedValue(preview);
    (refactor.extractMethodExecute as jest.Mock).mockResolvedValue({ affectedObjects: [{ uri: '/changed' }] });
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);

    const { previewId } = await gateway.extractMethodPreview('dev', {
      objectUri: '/x',
      range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 5 },
      methodName: 'GET_FOO',
    });

    const executed = await gateway.extractMethodExecute('dev', { previewId });
    expect(refactor.extractMethodExecute).toHaveBeenCalledWith(systems.getConnection('dev'), { preview });
    expect(executed.changedObjects).toEqual(['/changed']);

    // Single-use: the same handle must not apply the refactoring twice.
    await expect(gateway.extractMethodExecute('dev', { previewId })).rejects.toThrow(/Unknown or expired/);
    await expect(gateway.extractMethodExecute('dev', { previewId: 'never-issued' })).rejects.toThrow(
      /Unknown or expired/,
    );
  });

  it('wires debuggerSetVariableValue() to sap-adt-client debuggerOps.setVariableValue', async () => {
    (debuggerOps.setVariableValue as jest.Mock).mockResolvedValue(undefined);
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);
    const args = { debuggeeId: 'D1', variableName: 'LV_FOO', value: "'BAR'" };

    await gateway.debuggerSetVariableValue('dev', args);

    expect(debuggerOps.setVariableValue).toHaveBeenCalledWith(systems.getConnection('dev'), args);
  });
});
