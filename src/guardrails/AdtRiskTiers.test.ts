import { ADT_RISK_TIERS, compareTiers, riskTierFor, type RiskTier } from './AdtRiskTiers';
import { allTools } from '../tools';

describe('AdtRiskTiers', () => {
  it('has exactly one tier entry per registered tool (no silent default, no orphaned entry)', () => {
    const registeredNames = allTools.map((tool) => tool.name).sort();
    const tableNames = Object.keys(ADT_RISK_TIERS).sort();
    expect(tableNames).toEqual(registeredNames);
  });

  it('only ever assigns A, B, or C', () => {
    for (const tier of Object.values(ADT_RISK_TIERS)) {
      expect(['A', 'B', 'C']).toContain(tier);
    }
  });

  it('compareTiers orders A < B < C', () => {
    expect(compareTiers('A', 'B')).toBeLessThan(0);
    expect(compareTiers('B', 'C')).toBeLessThan(0);
    expect(compareTiers('C', 'A')).toBeGreaterThan(0);
    expect(compareTiers('B', 'B')).toBe(0);
  });

  it('gates the trace tools that expose other users captured SQL at Tier B, not A', () => {
    expect(ADT_RISK_TIERS.adt_traces_hit_list).toBe('B');
    expect(ADT_RISK_TIERS.adt_traces_db_access).toBe('B');
    // Same confidentiality class that already justifies gating table reads.
    expect(ADT_RISK_TIERS.adt_traces_db_access).toBe(ADT_RISK_TIERS.adt_ddic_table_contents);
  });

  it('never resolves an Object.prototype member name to a tier', () => {
    for (const name of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(riskTierFor(name)).toBeUndefined();
      expect(ADT_RISK_TIERS[name]).toBeUndefined();
    }
  });

  it('compareTiers refuses an unrecognized tier instead of ranking it below the gate threshold', () => {
    for (const bogus of ['', 'D', 'a', 'constructor', undefined] as unknown as RiskTier[]) {
      expect(() => compareTiers(bogus, 'B')).toThrow(/unknown risk tier/);
    }
  });
});
