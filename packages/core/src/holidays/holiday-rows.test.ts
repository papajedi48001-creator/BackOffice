import { describe, expect, it } from 'vitest';
import { mapHolidayRows, resolveHolidayColumns } from './holiday-rows';

describe('HOSxP holiday rows', () => {
  it('reads the usual holiday_date and day_name columns', () => {
    expect(mapHolidayRows([{ holiday_date: new Date('2026-12-05T00:00:00Z'), day_name: ' วันพ่อแห่งชาติ ' }, { holiday_date: '2026-12-10', day_name: 'วันรัฐธรรมนูญ' }], { dateColumn: 'holiday_date', nameColumn: 'day_name' }))
      .toEqual([{ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }, { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' }]);
  });
  it('falls back to known aliases when the configured columns are missing, ignoring case', () => {
    expect(resolveHolidayColumns(['HDATE', 'Holiday_Name', 'id'], { dateColumn: 'holiday_date', nameColumn: 'day_name' })).toEqual({ dateColumn: 'HDATE', nameColumn: 'Holiday_Name' });
    expect(resolveHolidayColumns(['id', 'x'], { dateColumn: 'holiday_date', nameColumn: 'day_name' })).toBeNull();
  });
  it('honours a configured column name', () => {
    expect(mapHolidayRows([{ d: '2027-01-01 00:00:00', n: 'วันขึ้นปีใหม่', holiday_date: '1999-01-01' }], { dateColumn: 'd', nameColumn: 'n' })).toEqual([{ date: '2027-01-01', name: 'วันขึ้นปีใหม่' }]);
  });
  it('skips rows without a usable date or name, de-duplicates dates and trims long names', () => {
    const rows = mapHolidayRows([{ holiday_date: null, day_name: 'x' }, { holiday_date: 'not a date', day_name: 'x' }, { holiday_date: '2026-13-40', day_name: 'x' }, { holiday_date: '2026-12-31', day_name: '' }, { holiday_date: '2026-12-31', day_name: 'วันสิ้นปี' }, { holiday_date: '2026-12-31', day_name: 'ซ้ำ' }, { holiday_date: '2026-12-30', day_name: 'ก'.repeat(200) }], { dateColumn: 'holiday_date', nameColumn: 'day_name' });
    expect(rows).toEqual([{ date: '2026-12-31', name: 'วันสิ้นปี' }, { date: '2026-12-30', name: 'ก'.repeat(120) }]);
  });
});
