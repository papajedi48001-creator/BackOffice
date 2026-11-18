import { describe, expect, it } from 'vitest';
import { DENTURE_ICODES, isExcludedFromForecast, isUcInCup } from './dental-rules';

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
