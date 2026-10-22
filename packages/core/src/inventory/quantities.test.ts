import { describe, expect, it } from 'vitest';
import { bangkokDate, computeLine, formatReference, issueOrder } from './quantities';

describe('computeLine', () => {
  it('converts purchase units to issue units and prices each issue unit', () => {
    expect(computeLine({ unitKind: 'PURCHASE', quantity: 3, unitPrice: 250, purchaseUnitFactor: 100 })).toEqual({ unitFactor: 100, issueQuantity: 300, lineTotal: '750.00', unitCost: '2.5000' });
  });

  it('keeps issue units as entered', () => {
    expect(computeLine({ unitKind: 'ISSUE', quantity: 4, unitPrice: 12.5, purchaseUnitFactor: 100 })).toEqual({ unitFactor: 1, issueQuantity: 4, lineTotal: '50.00', unitCost: '12.5000' });
  });

  it('does not carry floating point error into money', () => {
    expect(computeLine({ unitKind: 'ISSUE', quantity: 3, unitPrice: 0.1 + 0.2, purchaseUnitFactor: 1 })).toMatchObject({ lineTotal: '0.90', unitCost: '0.3000' });
  });

  it('rounds the unit cost to four decimals, half up', () => {
    expect(computeLine({ unitKind: 'PURCHASE', quantity: 1, unitPrice: 100, purchaseUnitFactor: 3 }).unitCost).toBe('33.3333');
    expect(computeLine({ unitKind: 'PURCHASE', quantity: 1, unitPrice: 2, purchaseUnitFactor: 3 }).unitCost).toBe('0.6667');
  });

  it('accepts a free item', () => {
    expect(computeLine({ unitKind: 'ISSUE', quantity: 10, unitPrice: 0, purchaseUnitFactor: 1 })).toMatchObject({ lineTotal: '0.00', unitCost: '0.0000' });
  });

  it('rejects a price with more than two decimals', () => {
    expect(() => computeLine({ unitKind: 'ISSUE', quantity: 1, unitPrice: 33.333, purchaseUnitFactor: 1 })).toThrow('INVALID_LINE');
  });

  it('handles the largest allowed line exactly', () => {
    expect(computeLine({ unitKind: 'ISSUE', quantity: 1_000_000, unitPrice: 9_999_999.99, purchaseUnitFactor: 1 }).lineTotal).toBe('9999999990000.00');
  });
});

describe('bangkokDate', () => {
  it('uses the Thai calendar day, not the UTC day', () => {
    expect(bangkokDate(new Date('2026-10-21T17:30:00Z'))).toBe('2026-10-22');
    expect(bangkokDate(new Date('2026-10-21T16:59:59Z'))).toBe('2026-10-21');
  });
});

describe('formatReference', () => {
  it('pads documents to four digits and lots to six', () => {
    expect(formatReference('RC', 2569, 7)).toBe('RC-2569-0007');
    expect(formatReference('OB', 2569, 1)).toBe('OB-2569-0001');
    expect(formatReference('LT', 2569, 12)).toBe('LT-2569-000012');
  });
});

describe('issueOrder', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n));
  it('puts the earliest expiry first, lots without expiry last, and drops empty or expired lots', () => {
    const lots = [
      { id: 'late', expiryDate: '2027-01-01', receivedAt: day(2), onHandQuantity: 5 },
      { id: 'soon', expiryDate: '2026-12-01', receivedAt: day(3), onHandQuantity: 5 },
      { id: 'none', expiryDate: null, receivedAt: day(1), onHandQuantity: 5 },
      { id: 'expired', expiryDate: '2026-10-20', receivedAt: day(1), onHandQuantity: 5 },
      { id: 'empty', expiryDate: '2026-11-01', receivedAt: day(1), onHandQuantity: 0 }
    ];
    expect(issueOrder(lots, '2026-10-21').map((lot) => lot.id)).toEqual(['soon', 'late', 'none']);
  });

  it('keeps a lot that expires today and orders equal expiry by receipt time', () => {
    const lots = [
      { id: 'second', expiryDate: '2026-10-21', receivedAt: day(5), onHandQuantity: 1 },
      { id: 'first', expiryDate: '2026-10-21', receivedAt: day(4), onHandQuantity: 1 }
    ];
    expect(issueOrder(lots, '2026-10-21').map((lot) => lot.id)).toEqual(['first', 'second']);
  });
});
