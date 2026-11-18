import { describe, expect, it } from 'vitest';
import { ttmDayLabel, ttmPeriodText, ttmPresets, ttmRange, TTM_MAX_DAYS } from './ttm-range';

describe('ttmRange (legacy ttm_range + date_range_from_request(1830))', () => {
  it('defaults to today and an end to the start', () => {
    expect(ttmRange({}, '2026-11-18')).toEqual({ start: '2026-11-18', end: '2026-11-18' });
    expect(ttmRange({ start: '2026-11-01' }, '2026-11-18')).toEqual({ start: '2026-11-01', end: '2026-11-01' });
    expect(ttmRange({ start: '2026-02-30', end: 'x' }, '2026-11-18')).toEqual({ start: '2026-11-18', end: '2026-11-18' });
  });

  it('treats a Buddhist-era year as unreadable, since HOSxP stores ค.ศ.', () => {
    expect(ttmRange({ start: '2569-11-05', end: '2569-11-05' }, '2026-11-18')).toEqual({ start: '2026-11-18', end: '2026-11-18' });
  });

  it('swaps a reversed range and cuts one longer than 1,830 days', () => {
    expect(TTM_MAX_DAYS).toBe(1830);
    expect(ttmRange({ start: '2026-11-10', end: '2026-11-01' }, '2026-11-18')).toEqual({ start: '2026-11-01', end: '2026-11-10' });
    expect(ttmRange({ start: '2020-01-01', end: '2026-11-18' }, '2026-11-18')).toEqual({ start: '2020-01-01', end: '2025-01-04' });
    expect(ttmRange({ start: '2020-01-01', end: '2025-01-04' }, '2026-11-18').end).toBe('2025-01-04');
  });
});

describe('ttmPresets', () => {
  it('lists the 7 legacy chips', () => {
    expect(ttmPresets('2026-11-18')).toEqual([
      { label: 'วันนี้', start: '2026-11-18', end: '2026-11-18' },
      { label: 'เมื่อวาน', start: '2026-11-17', end: '2026-11-17' },
      { label: 'เดือนนี้', start: '2026-11-01', end: '2026-11-18' },
      { label: 'เดือนที่แล้ว', start: '2026-10-01', end: '2026-10-31' },
      { label: 'ปีงบประมาณนี้', start: '2026-10-01', end: '2026-11-18' },
      { label: 'ปีงบที่แล้ว', start: '2025-10-01', end: '2026-09-30' },
      { label: '3 ปีงบย้อนหลัง', start: '2024-10-01', end: '2026-11-18' }
    ]);
    expect(ttmPresets('2026-03-01').map((p) => [p.start, p.end])).toEqual([
      ['2026-03-01', '2026-03-01'], ['2026-02-28', '2026-02-28'], ['2026-03-01', '2026-03-01'], ['2026-02-01', '2026-02-28'],
      ['2025-10-01', '2026-03-01'], ['2024-10-01', '2025-09-30'], ['2023-10-01', '2026-03-01']
    ]);
  });
});

describe('labels', () => {
  it('writes the report date like the legacy banner', () => {
    expect(ttmDayLabel('2026-11-05')).toBe('วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569');
    expect(ttmPeriodText('2026-11-05', '2026-11-05')).toBe('วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569');
    expect(ttmPeriodText('2026-10-01', '2026-11-05')).toBe('1 ตุลาคม 2569 – 5 พฤศจิกายน 2569');
  });
});
