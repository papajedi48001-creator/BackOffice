import { describe, expect, it } from 'vitest';
import { HERB_SQL, herbQuery } from './herb-reader';
import { isTtmReadOnlySql } from './ttm-reader';

// Ported from the legacy tests/herb_dispense/HerbRepositoryTest.php.
describe('herbQuery', () => {
  it('binds the dates and the de-duplicated icodes as parameters', () => {
    const { sql, params } = herbQuery('2026-11-01', '2026-11-30', ['1520003', '1000302', '1520003']);
    expect(isTtmReadOnlySql(sql)).toBe(true);
    expect(params).toEqual(['2026-11-01', '2026-11-30', '1520003', '1000302']);
    expect(sql).not.toContain('1520003');
    expect(sql).toContain('IN (?, ?)');
    expect(HERB_SQL).toContain('d.unitcost');
    expect(HERB_SQL).toContain('d.stdprice');
  });

  it('refuses an empty icode list', () => {
    expect(() => herbQuery('2026-11-01', '2026-11-30', [])).toThrow(/icode/);
  });
});
