import type { ElicitationCapability, ElicitationAction } from 'mcp-guardrails';
import { AdtGuardrail, type GuardrailLogEntry } from './AdtGuardrail';
import type { ResolvedSystem } from '../config/SystemRegistry';

function system(overrides: Partial<ResolvedSystem> = {}): ResolvedSystem {
  return {
    alias: 'dev',
    url: 'https://dev.example.com',
    client: '100',
    auth: { type: 'basic', user: 'u', password: 'p' },
    mode: 'guarded',
    ...overrides,
  };
}

class FakeElicitationCapability implements ElicitationCapability {
  supported = true;
  nextAction: ElicitationAction = 'accept';
  calls: unknown[] = [];

  isSupported(): boolean {
    return this.supported;
  }

  async elicit(summary: unknown): Promise<{ action: ElicitationAction }> {
    this.calls.push(summary);
    return { action: this.nextAction };
  }
}

describe('AdtGuardrail', () => {
  it('lets a Tier A call proceed without any guardrail check, in any mode', async () => {
    const elicitation = new FakeElicitationCapability();
    const guardrail = new AdtGuardrail([system({ mode: 'read-only' })], elicitation);

    const outcome = await guardrail.evaluate(system({ mode: 'read-only' }), 'adt_search', 'A', {});
    expect(outcome.allowed).toBe(true);
    expect(elicitation.calls).toHaveLength(0);
  });

  it('denies a Tier C call against a read-only system, reason category "read-only"', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ mode: 'read-only' });
    const guardrail = new AdtGuardrail([sys], elicitation);

    const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', {});
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.denial.category).toBe('read-only');
    }
    expect(elicitation.calls).toHaveLength(0);
  });

  it('confirms a Tier C call against a guarded system when the client accepts', async () => {
    const elicitation = new FakeElicitationCapability();
    elicitation.nextAction = 'accept';
    const sys = system({ mode: 'guarded' });
    const guardrail = new AdtGuardrail([sys], elicitation);

    const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', { objectUri: '/x' });
    expect(outcome.allowed).toBe(true);
    expect(elicitation.calls).toHaveLength(1);
  });

  it('denies a Tier C call against a guarded system when the client declines, reason category "declined-confirmation"', async () => {
    const elicitation = new FakeElicitationCapability();
    elicitation.nextAction = 'decline';
    const sys = system({ mode: 'guarded' });
    const guardrail = new AdtGuardrail([sys], elicitation);

    const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', {});
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.denial.category).toBe('declined-confirmation');
    }
  });

  it('fails closed (denies) a Tier C call against a guarded system when the client does not support elicitation', async () => {
    const elicitation = new FakeElicitationCapability();
    elicitation.supported = false;
    const sys = system({ mode: 'guarded' });
    const guardrail = new AdtGuardrail([sys], elicitation);

    const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', {});
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.denial.category).toBe('no-elicitation-support');
    }
    // Never actually attempted to elicit - only checked support.
    expect(elicitation.calls).toHaveLength(0);
  });

  it('allows a Tier B call against an open system without prompting, and logs it', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ mode: 'open' });
    const logs: GuardrailLogEntry[] = [];
    const guardrail = new AdtGuardrail([sys], elicitation, (entry) => logs.push(entry));

    const outcome = await guardrail.evaluate(sys, 'adt_atc_create_run', 'B', {});
    expect(outcome.allowed).toBe(true);
    expect(elicitation.calls).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      toolName: 'adt_atc_create_run',
      system: 'dev',
      tier: 'B',
      mode: 'open',
      decision: 'allow',
    });
  });

  it('denies a Tier C call whose package matches denyPackages, before any confirmation prompt, regardless of mode', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ mode: 'open', denyPackages: ['Z_LEGACY'] });
    const guardrail = new AdtGuardrail([sys], elicitation);

    const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', { packageName: 'Z_LEGACY_UTIL' });
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.denial.category).toBe('scope');
    }
    expect(elicitation.calls).toHaveLength(0);
  });

  it('gives a specific, distinguishable reason for every denial category', async () => {
    const elicitation = new FakeElicitationCapability();
    elicitation.nextAction = 'decline';
    const readOnly = system({ alias: 'prd', mode: 'read-only' });
    const guarded = system({ alias: 'qas', mode: 'guarded' });
    const scoped = system({ alias: 'sbx', mode: 'open', denyPackages: ['Z_X'] });
    const guardrail = new AdtGuardrail([readOnly, guarded, scoped], elicitation);

    const reasons = new Set<string>();
    for (const [sys, args] of [
      [readOnly, {}],
      [guarded, {}],
      [scoped, { packageName: 'Z_X' }],
    ] as const) {
      const outcome = await guardrail.evaluate(sys, 'adt_object_activate', 'C', args);
      if (!outcome.allowed) reasons.add(outcome.denial.category);
    }
    expect(reasons).toEqual(new Set(['read-only', 'declined-confirmation', 'scope']));
  });
});

describe('AdtGuardrail audit log', () => {
  function capture(sys: ResolvedSystem, elicitation: FakeElicitationCapability) {
    const logs: GuardrailLogEntry[] = [];
    return { logs, guardrail: new AdtGuardrail([sys], elicitation, (entry) => logs.push(entry)) };
  }

  it('records an approved Tier C call on a guarded system', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ alias: 'prd', mode: 'guarded' });
    const { logs, guardrail } = capture(sys, elicitation);

    await guardrail.evaluate(sys, 'adt_object_delete', 'C', { objectUri: '/x' });

    expect(logs).toEqual([
      { toolName: 'adt_object_delete', system: 'prd', tier: 'C', mode: 'guarded', decision: 'allow', denial: undefined },
    ]);
  });

  it.each([
    ['read-only', system({ mode: 'read-only' }), {}, 'read-only'],
    ['scope', system({ mode: 'open', denyPackages: ['Z_X'] }), { packageName: 'Z_X' }, 'scope'],
  ] as const)('records a denied Tier C call (%s)', async (_label, sys, args, category) => {
    const elicitation = new FakeElicitationCapability();
    const { logs, guardrail } = capture(sys, elicitation);

    await guardrail.evaluate(sys, 'adt_object_delete', 'C', args);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ decision: 'deny', denial: category, tier: 'C' });
  });

  it('records a declined confirmation and an unsupported client', async () => {
    const declining = new FakeElicitationCapability();
    declining.nextAction = 'decline';
    const sys = system({ mode: 'guarded' });
    const declined = capture(sys, declining);
    await declined.guardrail.evaluate(sys, 'adt_object_delete', 'C', {});
    expect(declined.logs[0]).toMatchObject({ decision: 'deny', denial: 'declined-confirmation' });

    const unsupported = new FakeElicitationCapability();
    unsupported.supported = false;
    const blocked = capture(sys, unsupported);
    await blocked.guardrail.evaluate(sys, 'adt_object_delete', 'C', {});
    expect(blocked.logs[0]).toMatchObject({ decision: 'deny', denial: 'no-elicitation-support' });
  });

  it('never logs a Tier A call (nothing to audit, and no guardrail ran)', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ mode: 'guarded' });
    const { logs, guardrail } = capture(sys, elicitation);

    await guardrail.evaluate(sys, 'adt_search', 'A', { query: 'ZCL*' });
    expect(logs).toHaveLength(0);
  });

  it('never puts an argument value in the log entry', async () => {
    const elicitation = new FakeElicitationCapability();
    const sys = system({ mode: 'open', denyPackages: ['Z_SECRET'] });
    const { logs, guardrail } = capture(sys, elicitation);

    const secretSource = 'REPORT y_secret. WRITE: /  "hunter2".';
    await guardrail.evaluate(sys, 'adt_object_source_write', 'C', {
      objectUri: '/sap/bc/adt/programs/programs/Y_SECRET',
      packageName: 'Z_SECRET_PKG',
      source: secretSource,
    });

    expect(logs).toHaveLength(1);
    const serialized = JSON.stringify(logs[0]);
    expect(serialized).not.toContain(secretSource);
    expect(serialized).not.toContain('Z_SECRET_PKG');
    expect(serialized).not.toContain('/sap/bc/adt/');
    expect(Object.keys(logs[0]).sort()).toEqual(['decision', 'denial', 'mode', 'system', 'tier', 'toolName']);
  });
});

describe('AdtGuardrail - package scope is resolved from the system, not self-declared', () => {
  const denySystem = () => system({ denyPackages: ['Z*'] });
  const PROTECTED_URI = '/sap/bc/adt/oo/classes/zcl_fi_posting';

  it('denies a delete in a denied package even though the caller declared no package at all', async () => {
    // The bypass this closes: packageName is an optional argument the caller supplies and that is
    // never sent to SAP, so omitting it used to skip the denyPackages check entirely.
    const resolver = jest.fn().mockResolvedValue({ packageName: 'ZFI_CORE', objectType: 'CLAS/OC' });
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: PROTECTED_URI,
      lockHandle: 'L1',
    });

    expect(outcome).toEqual({ allowed: false, denial: { category: 'scope', reason: expect.any(String) } });
    expect(resolver).toHaveBeenCalledWith('dev', PROTECTED_URI);
  });

  it('denies it just the same when the caller declares an innocuous package', async () => {
    const resolver = jest.fn().mockResolvedValue({ packageName: 'ZFI_CORE', objectType: 'CLAS/OC' });
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: PROTECTED_URI,
      packageName: 'YTEST',
      lockHandle: 'L1',
    });

    expect(outcome.allowed).toBe(false);
  });

  it('allows the call when the resolved package is genuinely outside the deny list', async () => {
    const resolver = jest.fn().mockResolvedValue({ packageName: 'YTEST_SANDBOX', objectType: 'CLAS/OC' });
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: '/sap/bc/adt/oo/classes/ycl_scratch',
      lockHandle: 'L1',
    });

    expect(outcome.allowed).toBe(true);
  });

  it('fails closed when the package cannot be resolved', async () => {
    const resolver = jest.fn().mockRejectedValue(new Error('404 object not found'));
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: PROTECTED_URI,
      lockHandle: 'L1',
    });

    expect(outcome).toMatchObject({ allowed: false, denial: { category: 'scope' } });
  });

  it('fails closed when the system reports no package for the object', async () => {
    const resolver = jest.fn().mockResolvedValue({ objectType: 'CLAS/OC' });
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: PROTECTED_URI,
      lockHandle: 'L1',
    });

    expect(outcome).toMatchObject({ allowed: false, denial: { category: 'scope' } });
  });

  it('fails closed when scope is configured but no resolver is wired at all', async () => {
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability());

    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_delete', 'C', {
      objectUri: PROTECTED_URI,
      lockHandle: 'L1',
    });

    expect(outcome).toMatchObject({ allowed: false, denial: { category: 'scope' } });
  });

  it('enforces allowObjectTypes against the resolved type, which delete/write args never carry', async () => {
    const resolver = jest.fn().mockResolvedValue({ packageName: 'YSANDBOX', objectType: 'TABL/DT' });
    const scoped = system({ allowObjectTypes: ['CLAS/OC'] });
    const guardrail = new AdtGuardrail([scoped], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(scoped, 'adt_object_delete', 'C', {
      objectUri: '/sap/bc/adt/ddic/tables/ytab',
      lockHandle: 'L1',
    });

    expect(outcome).toMatchObject({ allowed: false, denial: { category: 'scope' } });
  });

  it('does not resolve at all when the system configures no scope, so unscoped systems pay nothing', async () => {
    const resolver = jest.fn();
    const guardrail = new AdtGuardrail([system()], new FakeElicitationCapability(), () => {}, resolver);

    const outcome = await guardrail.evaluate(system(), 'adt_object_delete', 'C', { objectUri: PROTECTED_URI });

    expect(outcome.allowed).toBe(true);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('trusts create arguments, which are sent to SAP and so cannot lie only to the guardrail', async () => {
    const resolver = jest.fn();
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);

    // No objectUri: the object does not exist yet, and targetPackage is what SAP itself receives.
    const outcome = await guardrail.evaluate(denySystem(), 'adt_object_create', 'C', {
      targetPackage: 'ZFI_CORE',
      objectType: 'CLAS/OC',
      name: 'ZCL_NEW',
    });

    expect(outcome).toMatchObject({ allowed: false, denial: { category: 'scope' } });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('memoizes a resolution so a burst against one object issues a single lookup', async () => {
    const resolver = jest.fn().mockResolvedValue({ packageName: 'YSANDBOX', objectType: 'CLAS/OC' });
    const guardrail = new AdtGuardrail([denySystem()], new FakeElicitationCapability(), () => {}, resolver);
    const args = { objectUri: '/sap/bc/adt/oo/classes/ycl_scratch', lockHandle: 'L1' };

    await guardrail.evaluate(denySystem(), 'adt_object_lock', 'C', args);
    await guardrail.evaluate(denySystem(), 'adt_object_source_write', 'C', args);

    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
