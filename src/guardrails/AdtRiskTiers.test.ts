import { ADT_RISK_TIERS, compareTiers } from './AdtRiskTiers';
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
});
