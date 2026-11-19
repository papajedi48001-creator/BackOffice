import { describe, expect, it } from 'vitest';
import { formatBaht, formatQuantity, formatThaiDate } from './inventory-format';

describe('inventory formatting', () => {
  it('groups quantities and adds the unit', () => { expect(formatQuantity(1200, 'ชิ้น')).toBe('1,200 ชิ้น'); });
  it('shows baht with two decimals', () => {
    expect(formatBaht('1234.5')).toBe('1,234.50');
    expect(formatBaht('9999999990000.00')).toBe('9,999,999,990,000.00');
  });
  it('shows a Bangkok date in the Buddhist calendar', () => { expect(formatThaiDate('2026-10-22')).toBe('22 ต.ค. 2569'); });
});
