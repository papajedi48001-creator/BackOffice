import { describe, expect, it } from 'vitest';
import { bangkokDatesOfRange, holidayConflicts } from './holiday-days';

describe('holiday days', () => {
  it('lists every Bangkok date a UTC range touches', () => {
    expect(bangkokDatesOfRange(new Date('2026-12-04T20:00:00Z'), new Date('2026-12-06T01:00:00Z'))).toEqual(['2026-12-05', '2026-12-06']);
    expect(bangkokDatesOfRange(new Date('2026-12-04T01:00:00Z'), new Date('2026-12-04T09:00:00Z'))).toEqual(['2026-12-04']);
  });
  it('returns the holidays among the dates, in date order', () => {
    const holidays = new Map([['2026-12-10', 'วันรัฐธรรมนูญ'], ['2026-12-05', 'วันพ่อแห่งชาติ']]);
    expect(holidayConflicts(['2026-12-11', '2026-12-10', '2026-12-05'], holidays)).toEqual([{ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }, { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' }]);
    expect(holidayConflicts(['2026-12-11'], holidays)).toEqual([]);
  });
});
