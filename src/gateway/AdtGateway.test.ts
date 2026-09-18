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
    refactor: { ...actual.refactor, extractMethodPreview: jest.fn() },
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

  it('wires extractMethodPreview() to sap-adt-client refactor.extractMethodPreview', async () => {
    (refactor.extractMethodPreview as jest.Mock).mockResolvedValue({ previewId: 'P1', affectedLocations: [] });
    const systems = testRegistry();
    const gateway = new AdtGateway(systems);
    const args = { objectUri: '/x', range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 5 }, methodName: 'GET_FOO' };

    await gateway.extractMethodPreview('dev', args);

    expect(refactor.extractMethodPreview).toHaveBeenCalledWith(systems.getConnection('dev'), args);
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
