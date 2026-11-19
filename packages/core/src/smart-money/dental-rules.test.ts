import { describe, expect, it } from 'vitest';
import { applyPttypeItems, DENTAL_PTTYPE_ICODES, DENTURE_ICODES, isExcludedFromForecast, isUcInCup, RED_PTTYPES } from './dental-rules';

describe('dental ผังบัญชี rules (legacy DentalClaimsRepository)', () => {
  it('finds UC-OP ใน CUP but not นอก CUP', () => {
    expect(isUcInCup('ลูกหนี้ค่ารักษา UC-OP ใน CUP')).toBe(true);
    expect(isUcInCup('ลูกหนี้ค่ารักษา uc-op ในCUP')).toBe(true);
    expect(isUcInCup('ลูกหนี้ค่ารักษา UC-OP นอก CUP')).toBe(false);
  });
  it('leaves UC ใน CUP and PP out of the forecast, counting PP only as a word', () => {
    expect(isExcludedFromForecast('ลูกหนี้ค่ารักษา UC-OP ใน CUP')).toBe(true);
    expect(isExcludedFromForecast('ลูกหนี้ PP')).toBe(true);
    expect(isExcludedFromForecast('ลูกหนี้ P&P บริการส่งเสริม')).toBe(true);
    expect(isExcludedFromForecast('ลูกหนี้ P & P')).toBe(true);
    expect(isExcludedFromForecast('ลูกหนี้ APPLE')).toBe(false);
    expect(isExcludedFromForecast('ลูกหนี้ค่ารักษา UC-OP นอก CUP')).toBe(false);
    expect(isExcludedFromForecast('')).toBe(false);
  });
  it('lists the 10 legacy denture icodes', () => {
    expect(DENTURE_ICODES).toHaveLength(10);
    expect(DENTURE_ICODES).toContain('3015284');
  });
});

describe('dental สิทธิ rules asked by งานประกัน (2026-11-19)', () => {
  const row = { vn: '1', vstdate: '2026-11-01', hn: 'H1', patientName: '', diagCode: '', diagName: '', doctorName: '', helperName: '', isDenture: false, pttypeCode: '23', pttypeName: 'OP ส่งเสริมและป้องกันโรค', paccountName: null, totalAmount: 900, paidMoney: 100, claimAmount: 800 };

  it('shows สิทธิ 25 (PP Workload) as a red bar', () => {
    expect(RED_PTTYPES).toEqual(['25']);
  });

  it('counts สิทธิ 23 only by icode 3015628', () => {
    expect(DENTAL_PTTYPE_ICODES).toEqual({ '23': ['3015628'] });
    expect(applyPttypeItems(row, 250)).toEqual({ ...row, totalAmount: 250, paidMoney: 0, claimAmount: 250 });
  });

  it('drops a สิทธิ 23 visit without icode 3015628', () => {
    expect(applyPttypeItems(row, null)).toBeNull();
    expect(applyPttypeItems(row, 0)).toBeNull();
  });

  it('leaves every other สิทธิ as it was', () => {
    expect(applyPttypeItems({ ...row, pttypeCode: '89' }, null)).toEqual({ ...row, pttypeCode: '89' });
  });
});
