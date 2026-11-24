import { describe, expect, it } from 'vitest';
import { OFC_ADP_CODE, OFC_HIPDATA, OFC_SQL, ofcQuery } from './ofc-reader';
import { isReadOnlySelect } from './hosxp-read-only';

describe('ofcQuery', () => {
  it('binds the dates, the ADP code and the OFC สิทธิ as parameters', () => {
    const { sql, params } = ofcQuery('2026-11-01', '2026-11-30');
    expect(isReadOnlySelect(sql)).toBe(true);
    expect(params).toEqual(['2026-11-01', '2026-11-30', '8610', 'OFC']);
    expect([OFC_ADP_CODE, OFC_HIPDATA]).toEqual(['8610', 'OFC']);
    expect(OFC_SQL).not.toMatch(/'8610'|'OFC'/);
    expect(OFC_SQL).toContain('n.nhso_adp_code = ?');
    expect(OFC_SQL).toContain('pt.hipdata_code = ?');
    expect(OFC_SQL).toContain('ov.vstdate BETWEEN ? AND ?');
  });
});
