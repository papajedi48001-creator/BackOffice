import { describe, expect, it } from 'vitest';
import { holidayBlockedMessage } from './holidays';

describe('holidayBlockedMessage', () => {
  it('names the holiday and its date in Thai', () => {
    expect(holidayBlockedMessage([{ date: '2026-12-07', name: 'วันหยุดชดเชยวันพ่อแห่งชาติ' }])).toBe('จองไม่ได้ เพราะ จันทร์ 7 ธ.ค. 2569 เป็นวันหยุด (วันหยุดชดเชยวันพ่อแห่งชาติ)');
    expect(holidayBlockedMessage([{ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }, { date: '2026-12-07', name: 'วันหยุดชดเชย' }])).toBe('จองไม่ได้ เพราะ เสาร์ 5 ธ.ค. 2569 เป็นวันหยุด (วันพ่อแห่งชาติ), จันทร์ 7 ธ.ค. 2569 เป็นวันหยุด (วันหยุดชดเชย)');
  });
});
