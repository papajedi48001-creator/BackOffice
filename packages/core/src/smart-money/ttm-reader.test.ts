import { describe, expect, it } from 'vitest';
import { isTtmReadOnlySql, TTM_SQL } from './ttm-reader';

describe('isTtmReadOnlySql (legacy TtmRepository::isReadOnly)', () => {
  it('lets the three queries through', () => {
    for (const sql of Object.values(TTM_SQL)) expect(isTtmReadOnlySql(sql)).toBe(true);
  });

  it('refuses anything that is not one SELECT', () => {
    expect(isTtmReadOnlySql('UPDATE ovst SET pttype = 1')).toBe(false);
    expect(isTtmReadOnlySql('SELECT 1; DELETE FROM ovst')).toBe(false);
    expect(isTtmReadOnlySql('select * from ovst for update lock')).toBe(false);
    expect(isTtmReadOnlySql('SELECT * INTO  OUTFILE "/tmp/x" FROM ovst')).toBe(false);
    expect(isTtmReadOnlySql('  select vn from ovst')).toBe(true);
    expect(isTtmReadOnlySql('SELECT updated_at FROM ovst')).toBe(true);
  });
});
