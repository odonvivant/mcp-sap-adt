import {
  SystemRegistry,
  SystemConfigError,
  SystemsFileMissingError,
  UnknownSystemError,
} from './SystemRegistry';

const validBasic = {
  dev: {
    url: 'https://dev.example.com:44300',
    client: '100',
    auth: { type: 'basic', user: 'devuser', password: 'devpass' },
    mode: 'guarded',
  },
};

describe('SystemRegistry.fromObject - Zod validation', () => {
  it('accepts a valid basic-auth entry', () => {
    const registry = SystemRegistry.fromObject(validBasic);
    expect(registry.listAliases()).toEqual(['dev']);
    expect(registry.getSystem('dev').auth).toEqual({ type: 'basic', user: 'devuser', password: 'devpass' });
  });

  it('accepts a valid cert (pfx) entry', () => {
    const registry = SystemRegistry.fromObject({
      qas: {
        url: 'https://qas.example.com:44300',
        client: '200',
        auth: { type: 'cert', pfx: './certs/qas.pfx', passphrase: 'secret' },
        mode: 'read-only',
      },
    });
    expect(registry.getSystem('qas').auth).toEqual({
      type: 'cert',
      pfx: './certs/qas.pfx',
      passphrase: 'secret',
      rejectUnauthorized: undefined,
    });
  });

  it('accepts a valid cert (cert+key) entry', () => {
    const registry = SystemRegistry.fromObject({
      prd: {
        url: 'https://prd.example.com:44300',
        client: '300',
        auth: { type: 'cert', cert: './certs/prd.pem', key: './certs/prd.key' },
        mode: 'open',
      },
    });
    expect(registry.getSystem('prd').auth).toMatchObject({ type: 'cert', cert: './certs/prd.pem', key: './certs/prd.key' });
  });

  it('defaults mode to "guarded" when omitted', () => {
    const registry = SystemRegistry.fromObject({
      dev: {
        url: 'https://dev.example.com:44300',
        client: '100',
        auth: { type: 'basic', user: 'u', password: 'p' },
      },
    });
    expect(registry.getSystem('dev').mode).toBe('guarded');
  });

  it('rejects an entry missing a required field (no url)', () => {
    expect(() =>
      SystemRegistry.fromObject({
        dev: { client: '100', auth: { type: 'basic', user: 'u', password: 'p' }, mode: 'guarded' },
      }),
    ).toThrow(SystemConfigError);
  });

  it('rejects an entry with an unrecognized auth.type', () => {
    expect(() =>
      SystemRegistry.fromObject({
        dev: { url: 'https://x', client: '100', auth: { type: 'kerberos' }, mode: 'guarded' },
      }),
    ).toThrow(SystemConfigError);
  });

  it('rejects an entry specifying both basic and cert fields (ambiguous auth)', () => {
    expect(() =>
      SystemRegistry.fromObject({
        dev: {
          url: 'https://x',
          client: '100',
          auth: { type: 'basic', user: 'u', password: 'p', pfx: './x.pfx' },
          mode: 'guarded',
        },
      }),
    ).toThrow(SystemConfigError);
  });

  it('rejects an entry specifying neither basic nor cert fields', () => {
    expect(() =>
      SystemRegistry.fromObject({
        dev: { url: 'https://x', client: '100', auth: { type: 'basic' }, mode: 'guarded' },
      }),
    ).toThrow(SystemConfigError);
  });

  it('rejects an unresolvable env credential reference', () => {
    delete process.env.MCP_SAP_ADT_TEST_MISSING_VAR;
    expect(() =>
      SystemRegistry.fromObject({
        dev: {
          url: 'https://x',
          client: '100',
          auth: { type: 'basic', user: 'u', password: 'env:MCP_SAP_ADT_TEST_MISSING_VAR' },
          mode: 'guarded',
        },
      }),
    ).toThrow(SystemConfigError);
  });

  it('resolves an env-sourced credential when the variable is set', () => {
    process.env.MCP_SAP_ADT_TEST_VAR = 'resolved-secret';
    const registry = SystemRegistry.fromObject({
      dev: {
        url: 'https://x',
        client: '100',
        auth: { type: 'basic', user: 'u', password: 'env:MCP_SAP_ADT_TEST_VAR' },
        mode: 'guarded',
      },
    });
    expect(registry.getSystem('dev').auth).toEqual({ type: 'basic', user: 'u', password: 'resolved-secret' });
    delete process.env.MCP_SAP_ADT_TEST_VAR;
  });
});

describe('SystemRegistry.load - missing file', () => {
  it('throws SystemsFileMissingError, not a generic crash, when systems.json does not exist', () => {
    expect(() => SystemRegistry.load('/does/not/exist/systems.json')).toThrow(SystemsFileMissingError);
  });
});

describe('SystemRegistry - unknown alias', () => {
  it('rejects an unconfigured alias, listing configured aliases, without any network call', () => {
    const registry = SystemRegistry.fromObject(validBasic);
    expect(() => registry.getSystem('doesnotexist')).toThrow(UnknownSystemError);
    try {
      registry.getSystem('doesnotexist');
    } catch (error) {
      expect((error as Error).message).toContain('dev');
    }
  });
});

describe('SystemRegistry - per-alias session caching', () => {
  it('never shares a connection between two different aliases', () => {
    const registry = SystemRegistry.fromObject({
      dev: { url: 'https://dev.example.com', client: '100', auth: { type: 'basic', user: 'u', password: 'p' } },
      qas: { url: 'https://qas.example.com', client: '200', auth: { type: 'basic', user: 'u', password: 'p' } },
    });
    const devConn1 = registry.getConnection('dev');
    const devConn2 = registry.getConnection('dev');
    const qasConn = registry.getConnection('qas');

    expect(devConn1).toBe(devConn2);
    expect(devConn1).not.toBe(qasConn);
  });
});
