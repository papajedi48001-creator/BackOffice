import { describe, expect, it } from 'vitest';
import { HERB_ONTOP, herbRules } from './herb-rules';
import { ttmRules } from './ttm-rules';

// Ported from the legacy tests/herb_dispense/HerbSummaryTest.php (ค่าตั้ง).
describe('herbRules', () => {
  const rules = herbRules();

  it('reuses the TTM herb list and carries the 2570 ontop rates', () => {
    expect(rules.herbIcodes).toContain('1520003');
    expect(rules.ontopRates['1520003']?.baht).toBe(92);
    expect(rules.ontopRates['1560021']?.points).toBe(264.5);
    expect(rules.ontopRates['1560027']).toBeUndefined();
    expect(rules.ontopRates['1630008']).toBeUndefined();
    expect(Object.keys(rules.ontopRates)).toHaveLength(38);
    expect(HERB_ONTOP).toHaveLength(38);
    expect(rules.ontopRates['1550006']).toEqual({ name: 'เพชรสังฆาต CAP 500 MG', unit: 'แคปซูล', stdQty: 100, baht: 204, points: null });
    for (const [icode, rate] of Object.entries(rules.ontopRates)) {
      expect(rules.herbIcodes).toContain(icode);
      expect((rate.baht === null) !== (rate.points === null)).toBe(true);
    }
  });

  it('reads the point rate and the herb override like the legacy page', () => {
    expect(rules.pointBaht).toBeNull();
    expect(herbRules({ point_baht: '0.5' }).pointBaht).toBe(0.5);
    expect(herbRules({ point_baht: ' 2 ' }).pointBaht).toBe(2);
    for (const bad of ['abc', '0', '-1', '', '0x10', 'Infinity']) expect(herbRules({ point_baht: bad }).pointBaht).toBeNull();
    expect(herbRules({ herb_icodes: 'A' }).herbIcodes).toEqual(['A']);
    expect(herbRules({ herb_icodes: ' ' }).herbIcodes).toEqual(rules.herbIcodes);
  });

  it('takes the herb list and สิทธิ map from the TTM settings', () => {
    const ttm = ttmRules({ herb_icodes: 'X1,X2', right_map: '99:cash' });
    expect(herbRules({}, ttm)).toMatchObject({ herbIcodes: ['X1', 'X2'], rightMap: { 99: 'cash' } });
  });
});
