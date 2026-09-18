import { discovery, search } from 'sap-adt-client';
import { AdtGateway } from './AdtGateway';
import { SystemRegistry } from '../config/SystemRegistry';

jest.mock('sap-adt-client', () => {
  const actual = jest.requireActual('sap-adt-client');
  return {
    ...actual,
    discovery: { discovery: jest.fn() },
    search: { search: jest.fn() },
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
});
