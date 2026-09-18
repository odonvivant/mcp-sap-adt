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
    expect(logs[0]).toMatchObject({ toolName: 'adt_atc_create_run', system: 'dev', tier: 'B' });
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
