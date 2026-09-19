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

describe('SystemRegistry - package prefix rules', () => {
  function withPackages(field: 'allowPackages' | 'denyPackages', values: string[]): unknown {
    return { dev: { ...validBasic.dev, [field]: values } };
  }

  it.each(['allowPackages', 'denyPackages'] as const)(
    'rejects a mid-prefix "*" in %s at load time instead of accepting a rule that can never fire',
    (field) => {
      expect(() => SystemRegistry.fromObject(withPackages(field, ['Z*FI']))).toThrow(SystemConfigError);
      expect(() => SystemRegistry.fromObject(withPackages(field, ['Z*FI']))).toThrow(/trailing wildcard/);
    },
  );

  it('names the offending field so the operator can find it', () => {
    expect(() => SystemRegistry.fromObject(withPackages('denyPackages', ['Z*', '/CUST/*X*']))).toThrow(
      /denyPackages\.1/,
    );
  });

  it('rejects a bare "*", which would otherwise normalize to an empty never-matching prefix', () => {
    expect(() => SystemRegistry.fromObject(withPackages('denyPackages', ['*']))).toThrow(SystemConfigError);
  });

  it('accepts a trailing wildcard, a namespaced prefix, and a literal prefix', () => {
    const registry = SystemRegistry.fromObject(withPackages('denyPackages', ['Z*', '/CUSTOMER/Z*', 'Z_LEGACY']));
    expect(registry.getSystem('dev').denyPackages).toEqual(['Z*', '/CUSTOMER/Z*', 'Z_LEGACY']);
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

  it('builds stateful connections, without which every lock/write pair fails', async () => {
    // An ABAP enqueue lock only survives between the lock call and the write that uses it inside a
    // real server-side dialog session. Under the 'stateless' default the write comes back 423
    // "Resource ... is not locked (invalid lock handle)" - found live, not by a fixture, because a
    // mocked connection has no session at all.
    const registry = SystemRegistry.fromObject({
      dev: {
        url: 'https://dev.example.com:44300',
        client: '100',
        auth: { type: 'basic', user: 'u', password: 'p' },
        mode: 'guarded',
      },
    });

    const sent: Array<Record<string, string | string[] | undefined>> = [];
    const connection = registry.getConnection('dev');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (connection as any).http = {
      request: (options: { headers?: Record<string, string> }) => {
        sent.push(options.headers ?? {});
        return Promise.resolve({ status: 200, headers: {}, body: '', raw: Buffer.alloc(0) });
      },
    };

    await connection.request({ method: 'GET', path: '/sap/bc/adt/discovery' });

    expect(sent[0]['X-sap-adt-sessiontype']).toBe('stateful');
  });
});
