import { checkObjectScope, toConfigPolicyConfig, GUARDED_THRESHOLD } from './GuardrailConfig';
import type { ResolvedSystem } from './SystemRegistry';

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

describe('toConfigPolicyConfig', () => {
  it('maps read-only -> deny, guarded -> ask, open -> allow, all at the Tier B threshold', () => {
    const config = toConfigPolicyConfig([
      system({ alias: 'prd', mode: 'read-only' }),
      system({ alias: 'qas', mode: 'guarded' }),
      system({ alias: 'sandbox', mode: 'open' }),
    ]);

    expect(config.scopes.prd).toEqual({ mode: 'deny', threshold: GUARDED_THRESHOLD });
    expect(config.scopes.qas).toEqual({ mode: 'ask', threshold: GUARDED_THRESHOLD });
    expect(config.scopes.sandbox).toEqual({ mode: 'allow', threshold: GUARDED_THRESHOLD });
  });
});

describe('checkObjectScope', () => {
  it('denies a package matching a denyPackages prefix', () => {
    const denial = checkObjectScope(system({ denyPackages: ['Z_LEGACY'] }), { packageName: 'Z_LEGACY_UTIL' });
    expect(denial?.reason).toMatch(/denyPackages/);
  });

  it('is case-insensitive and strips a trailing wildcard on prefixes', () => {
    const denial = checkObjectScope(system({ denyPackages: ['z_legacy*'] }), { targetPackage: 'Z_LEGACY_UTIL' });
    expect(denial).toBeDefined();
  });

  it('denies a package outside the allowPackages scope', () => {
    const denial = checkObjectScope(system({ allowPackages: ['Z*'] }), { packageName: 'Y_OTHER' });
    expect(denial?.reason).toMatch(/allowPackages/);
  });

  it('allows a package matching the allowPackages scope', () => {
    const denial = checkObjectScope(system({ allowPackages: ['Z*'] }), { packageName: 'Z_MY_APP' });
    expect(denial).toBeUndefined();
  });

  it('denies an object type outside allowObjectTypes', () => {
    const denial = checkObjectScope(system({ allowObjectTypes: ['CLAS/OC'] }), { objectType: 'PROG/P' });
    expect(denial?.reason).toMatch(/allowObjectTypes/);
  });

  it('is unaffected when args carry neither a package nor an object type', () => {
    const denial = checkObjectScope(system({ denyPackages: ['Z_LEGACY'], allowObjectTypes: ['CLAS/OC'] }), {});
    expect(denial).toBeUndefined();
  });

  it('is unaffected when no scope is configured at all', () => {
    const denial = checkObjectScope(system(), { packageName: 'ANYTHING' });
    expect(denial).toBeUndefined();
  });
});

describe('checkObjectScope - SAP namespace prefixes', () => {
  it('denies a namespaced package with a plain "Z*" deny rule', () => {
    const denial = checkObjectScope(system({ denyPackages: ['Z*'] }), { packageName: '/CUSTOMER/ZFI_CORE' });
    expect(denial?.reason).toMatch(/denyPackages/);
  });

  it('still denies the non-namespaced form with the same rule', () => {
    expect(checkObjectScope(system({ denyPackages: ['Z*'] }), { packageName: 'ZFI_CORE' })).toBeDefined();
  });

  it('is case-insensitive across the namespace too', () => {
    expect(checkObjectScope(system({ denyPackages: ['z*'] }), { packageName: '/customer/zfi_core' })).toBeDefined();
  });

  it('does not let a namespaced package escape an allowPackages scope check', () => {
    // "Y*" must still reject it - namespace normalization must not become a blanket pass.
    const denial = checkObjectScope(system({ allowPackages: ['Y*'] }), { packageName: '/CUSTOMER/ZFI_CORE' });
    expect(denial?.reason).toMatch(/allowPackages/);
  });

  it('keeps a namespaced rule scoped to its own namespace', () => {
    const sys = system({ denyPackages: ['/CUSTOMER/Z*'] });
    expect(checkObjectScope(sys, { packageName: '/CUSTOMER/ZFI_CORE' })).toBeDefined();
    // Must not be reduced to a bare "Z" and swallow every other namespace / plain Z package.
    expect(checkObjectScope(sys, { packageName: '/OTHER/ZFI_CORE' })).toBeUndefined();
    expect(checkObjectScope(sys, { packageName: 'ZFI_CORE' })).toBeUndefined();
  });

  it('trims whitespace around a configured prefix', () => {
    expect(checkObjectScope(system({ denyPackages: ['  Z*  '] }), { packageName: 'Z_LEGACY' })).toBeDefined();
  });

  it('trims whitespace around the package argument', () => {
    expect(checkObjectScope(system({ denyPackages: ['Z*'] }), { packageName: ' Z_LEGACY ' })).toBeDefined();
  });
});
