import { describe, expect, it } from 'vitest';
import { checkPicks, fiscalYearBE, formatDocNo, formatQuantity, nextRequisitionStatus, pickFefo, unitCost, type LotOption } from './lab-rules';

const lots: LotOption[] = [
  { lotId: 'dec', expiryDate: '2026-12-01', createdAt: '2026-01-01T00:00:00Z', available: 5 },
  { lotId: 'none', expiryDate: null, createdAt: '2025-01-01T00:00:00Z', available: 10 },
  { lotId: 'nov', expiryDate: '2026-11-20', createdAt: '2026-02-01T00:00:00Z', available: 3 },
  { lotId: 'old', expiryDate: '2026-11-01', createdAt: '2025-06-01T00:00:00Z', available: 50 }
];

describe('pickFefo', () => {
  it('takes the earliest expiry first, skips expired lots and keeps lots without expiry last', () => {
    expect(pickFefo(lots, 6, '2026-11-10')).toEqual({ ok: true, picks: [{ lotId: 'nov', quantity: 3 }, { lotId: 'dec', quantity: 3 }] });
    expect(pickFefo(lots, 12, '2026-11-10')).toEqual({ ok: true, picks: [{ lotId: 'nov', quantity: 3 }, { lotId: 'dec', quantity: 5 }, { lotId: 'none', quantity: 4 }] });
  });
  it('orders equal expiry by the older lot first', () => {
    const same: LotOption[] = [{ lotId: 'b', expiryDate: '2027-01-01', createdAt: '2026-05-01T00:00:00Z', available: 1 }, { lotId: 'a', expiryDate: '2027-01-01', createdAt: '2026-04-01T00:00:00Z', available: 1 }];
    expect(pickFefo(same, 1, '2026-11-10')).toEqual({ ok: true, picks: [{ lotId: 'a', quantity: 1 }] });
  });
  it('refuses more than the unexpired stock', () => {
    expect(pickFefo(lots, 19, '2026-11-10')).toEqual({ ok: false, code: 'INSUFFICIENT_STOCK' });
  });
  it('lets a lot be used on its expiry date', () => {
    expect(pickFefo(lots, 1, '2026-11-01')).toEqual({ ok: true, picks: [{ lotId: 'old', quantity: 1 }] });
  });
});

describe('checkPicks', () => {
  it('accepts picks within each lot', () => {
    expect(checkPicks(lots, [{ lotId: 'none', quantity: 10 }], '2026-11-10')).toEqual({ ok: true });
  });
  it('refuses an expired lot, an unknown lot and more than a lot holds', () => {
    expect(checkPicks(lots, [{ lotId: 'old', quantity: 1 }], '2026-11-10')).toEqual({ ok: false, code: 'LOT_EXPIRED' });
    expect(checkPicks(lots, [{ lotId: 'x', quantity: 1 }], '2026-11-10')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(checkPicks(lots, [{ lotId: 'nov', quantity: 2 }, { lotId: 'nov', quantity: 2 }], '2026-11-10')).toEqual({ ok: false, code: 'INSUFFICIENT_STOCK' });
  });
});

describe('units, costs and documents', () => {
  it('fixes the cost of one usage unit to 4 decimals, rounding half up', () => {
    expect(unitCost(1250, 12)).toBe('104.1667');
    expect(unitCost(1250, 10)).toBe('125.0000');
    expect(unitCost(0.01, 2)).toBe('0.0050');
  });
  it('shows a quantity in usage units and, when it spans a pack, in packs too', () => {
    expect(formatQuantity(25, 'ขวด', 'กล่อง', 10)).toBe('25 ขวด (2 กล่อง 5 ขวด)');
    expect(formatQuantity(20, 'ขวด', 'กล่อง', 10)).toBe('20 ขวด (2 กล่อง)');
    expect(formatQuantity(5, 'ขวด', 'กล่อง', 10)).toBe('5 ขวด');
    expect(formatQuantity(5, 'ชิ้น', 'ชิ้น', 1)).toBe('5 ชิ้น');
    expect(formatQuantity(1500, 'test', 'กล่อง', 100)).toBe('1,500 test (15 กล่อง)');
  });
  it('numbers documents by the Thai fiscal year starting 1 October', () => {
    expect(fiscalYearBE('2026-09-30')).toBe(2569);
    expect(fiscalYearBE('2026-10-01')).toBe(2570);
    expect(formatDocNo('LR', 2570, 1)).toBe('LR-2570-0001');
    expect(formatDocNo('LQ', 2570, 12345)).toBe('LQ-2570-12345');
  });
});

describe('nextRequisitionStatus', () => {
  it('follows submitted → approved → issued and returned → resubmitted', () => {
    expect(nextRequisitionStatus('SUBMITTED', 'APPROVE')).toBe('APPROVED');
    expect(nextRequisitionStatus('SUBMITTED', 'RETURN')).toBe('RETURNED');
    expect(nextRequisitionStatus('SUBMITTED', 'REJECT')).toBe('REJECTED');
    expect(nextRequisitionStatus('RETURNED', 'RESUBMIT')).toBe('SUBMITTED');
    expect(nextRequisitionStatus('APPROVED', 'ISSUE')).toBe('ISSUED');
    expect(nextRequisitionStatus('RETURNED', 'CANCEL')).toBe('CANCELLED');
  });
  it('refuses every other move', () => {
    expect(nextRequisitionStatus('ISSUED', 'CANCEL')).toBeNull();
    expect(nextRequisitionStatus('APPROVED', 'CANCEL')).toBeNull();
    expect(nextRequisitionStatus('SUBMITTED', 'ISSUE')).toBeNull();
    expect(nextRequisitionStatus('REJECTED', 'RESUBMIT')).toBeNull();
  });
});
