import { describe, expect, it } from 'vitest';
import { dentalPresets, dentalRange } from './dental-range';

const today = '2026-11-13';

describe('dentalRange', () => {
  it('defaults to the current month', () => {
    expect(dentalRange({}, today)).toEqual({ ok: true, start: '2026-11-01', end: '2026-11-30' });
  });
  it('keeps a valid range', () => {
    expect(dentalRange({ start: '2026-10-01', end: '2027-09-30' }, today)).toEqual({ ok: true, start: '2026-10-01', end: '2027-09-30' });
  });
  it('allows a span of 366 days, like the legacy page, and refuses 367', () => {
    expect(dentalRange({ start: '2027-01-01', end: '2028-01-02' }, today)).toMatchObject({ ok: true });
    expect(dentalRange({ start: '2027-01-01', end: '2028-01-03' }, today)).toEqual({ ok: false, code: 'RANGE_TOO_LONG', start: '2027-01-01', end: '2028-01-03' });
  });
  it('refuses an end before the start', () => {
    expect(dentalRange({ start: '2026-11-10', end: '2026-11-01' }, today)).toMatchObject({ ok: false, code: 'END_BEFORE_START' });
  });
  it('refuses a date that does not exist or is not ISO', () => {
    expect(dentalRange({ start: '2569-13-40', end: '2026-11-30' }, today)).toMatchObject({ ok: false, code: 'INVALID_DATE' });
    expect(dentalRange({ start: '2026-02-30', end: '2026-03-01' }, today)).toMatchObject({ ok: false, code: 'INVALID_DATE' });
    expect(dentalRange({ start: '13/11/2569', end: '2026-11-30' }, today)).toMatchObject({ ok: false, code: 'INVALID_DATE' });
  });
  it('fills a missing side with the current month', () => {
    expect(dentalRange({ start: '2026-11-05' }, today)).toEqual({ ok: true, start: '2026-11-05', end: '2026-11-30' });
  });
});

describe('dentalPresets', () => {
  it('gives เดือนนี้, เดือนที่แล้ว and ปีงบประมาณนี้', () => {
    expect(dentalPresets(today)).toEqual([
      { label: 'เดือนนี้', start: '2026-11-01', end: '2026-11-30' },
      { label: 'เดือนที่แล้ว', start: '2026-10-01', end: '2026-10-31' },
      { label: 'ปีงบประมาณนี้', start: '2026-10-01', end: '2027-09-30' }
    ]);
  });
  it('handles January and a fiscal year that started last calendar year', () => {
    expect(dentalPresets('2027-01-05')).toEqual([
      { label: 'เดือนนี้', start: '2027-01-01', end: '2027-01-31' },
      { label: 'เดือนที่แล้ว', start: '2026-12-01', end: '2026-12-31' },
      { label: 'ปีงบประมาณนี้', start: '2026-10-01', end: '2027-09-30' }
    ]);
    expect(dentalPresets('2028-02-10')[0]).toEqual({ label: 'เดือนนี้', start: '2028-02-01', end: '2028-02-29' });
  });
});
