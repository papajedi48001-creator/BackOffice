import { describe, expect, it } from 'vitest';
import rows from './fixtures/dental-rows.json';
import expected from './fixtures/dental-expected.json';
import { summarizeDental, type DentalRow } from './dental-summary';

type Expected = Record<string, Record<string, unknown> & { byPeriod: Record<string, number | string>[]; byGroup: Record<string, number | string>[]; byDiag: Record<string, number | string>[] }>;
const money = ['total', 'paid', 'claim'];

/** Money compared to 2 decimals, everything else exactly. */
function expectSame(actual: Record<string, unknown>, wanted: Record<string, unknown>) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(wanted).sort());
  for (const [key, value] of Object.entries(wanted)) {
    if (money.includes(key)) expect(actual[key] as number).toBeCloseTo(value as number, 2);
    else expect(actual[key]).toEqual(value);
  }
}

describe('summarizeDental matches the legacy PHP summarize', () => {
  for (const combo of Object.keys(expected)) {
    it(combo, () => {
      const [group, period] = combo.split(':') as ['pttype' | 'paccount', 'day' | 'month'];
      const actual = summarizeDental(rows as DentalRow[], group, period);
      const wanted = (expected as unknown as Expected)[combo]!;
      const { byPeriod, byGroup, byDiag, ...totals } = wanted;
      const { byPeriod: aPeriod, byGroup: aGroup, byDiag: aDiag, ...aTotals } = actual;
      expectSame(aTotals, totals);
      expect(aPeriod).toHaveLength(byPeriod.length);
      byPeriod.forEach((row, index) => expectSame(aPeriod[index]!, row));
      expect(aGroup).toHaveLength(byGroup.length);
      byGroup.forEach((row, index) => expectSame(aGroup[index]!, row));
      expect(aDiag).toEqual(byDiag);
    });
  }

  it('counts money once per visit even with several K-codes', () => {
    const [first] = rows as DentalRow[];
    const visit = (rows as DentalRow[]).filter((row) => row.vn === first!.vn);
    expect(visit.length).toBeGreaterThan(1);
    const summary = summarizeDental(visit, 'pttype', 'day');
    expect(summary).toMatchObject({ rows: visit.length, visits: 1, patients: 1, total: first!.totalAmount });
  });

  it('puts a visit without ผังบัญชี under (ไม่ระบุผังบัญชี)', () => {
    const summary = summarizeDental([{ ...(rows as DentalRow[])[0]!, paccountName: '  ' }], 'paccount', 'day');
    expect(summary.byGroup[0]).toMatchObject({ code: '', name: '(ไม่ระบุผังบัญชี)' });
  });

  it('returns zeros for no rows', () => {
    expect(summarizeDental([], 'pttype', 'month')).toEqual({ rows: 0, visits: 0, patients: 0, total: 0, paid: 0, claim: 0, byPeriod: [], byGroup: [], byDiag: [] });
  });
});
