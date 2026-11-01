import { describe, expect, it } from 'vitest';
import { updatePositionHistoryInputSchema } from './hr';

describe('ก.พ.7 ตำแหน่งและอัตราเงินเดือน', () => {
  it('takes rows with a date and a description, sorted by HR, up to 200', () => {
    const parsed = updatePositionHistoryInputSchema.parse({ entries: [{ effectiveOn: '2020-08-24', description: ' บรรจุและแต่งตั้ง ', positionNumber: '100001', positionType: 'วิชาการ', level: 'ปฏิบัติการ', salary: 15000, positionAllowance: null, reference: 'คำสั่งที่ 1/2563' }] });
    expect(parsed.entries[0]).toMatchObject({ description: 'บรรจุและแต่งตั้ง', salary: 15000 });
    expect(updatePositionHistoryInputSchema.safeParse({ entries: [{ effectiveOn: '2020-02-30', description: 'x' }] }).success).toBe(false);
    expect(updatePositionHistoryInputSchema.safeParse({ entries: [{ effectiveOn: '2020-01-01', description: '' }] }).success).toBe(false);
    expect(updatePositionHistoryInputSchema.safeParse({ entries: [{ effectiveOn: '2020-01-01', description: 'x', salary: -1 }] }).success).toBe(false);
    expect(updatePositionHistoryInputSchema.safeParse({ entries: Array.from({ length: 201 }, () => ({ effectiveOn: '2020-01-01', description: 'x' })) }).success).toBe(false);
  });
});
