import { describe, expect, it } from 'vitest';
import { byService, byStatus, filterRecords, fiscalYear, fyRange, isFlagged, summarize, trend, type DpRow } from './dp-core';

// The legacy tests/disability_point/core.test.js, unchanged in meaning.
const r = (o: Partial<DpRow>): DpRow => ({ ref: 'x', date: '2025-10-05', fy: 2569, cid: '1', name: 'ทดสอบ', hn: 'h1', right: 'UCS',
  target: 'กลุ่มที่ 3', svc_type: 'ผู้ป่วยนอก', code: 'H9339', service: 'กายภาพบำบัด', qty: 1, claim: 160, eligible: 150, status: '', ...o });

describe('dp-core (port of the legacy dashboard calculator)', () => {
  it('fiscalYear', () => {
    expect(fiscalYear('2025-10-01')).toBe(2569);
    expect(fiscalYear('2025-09-30')).toBe(2568);
  });

  it('fyRange', () => {
    expect(fyRange(2569)).toEqual({ from: '2025-10-01', to: '2026-09-30' });
  });

  it('isFlagged', () => {
    expect(isFlagged(r({}))).toBe(false);
    expect(isFlagged(r({ status: 'D24' }))).toBe(true);
  });

  it('filterRecords by date range, fields and search', () => {
    const recs = [r({ ref: '1', date: '2025-10-01' }), r({ ref: '2', date: '2025-10-15', right: 'WEL', hn: 'h2', name: 'สมมติ' }), r({ ref: '3', date: '2025-11-01', status: 'D24', service: 'จิตบำบัด' })];
    const refs = (a: DpRow[]) => a.map((x) => x.ref);
    expect(refs(filterRecords(recs, { from: '2025-10-01', to: '2025-10-15' }))).toEqual(['1', '2']);
    expect(refs(filterRecords(recs, { from: '2025-10-15', to: '2025-10-15' }))).toEqual(['2']);
    expect(refs(filterRecords(recs, { right: 'WEL' }))).toEqual(['2']);
    expect(refs(filterRecords(recs, { service: 'จิตบำบัด' }))).toEqual(['3']);
    expect(refs(filterRecords(recs, { flagged: true }))).toEqual(['3']);
    expect(refs(filterRecords(recs, { q: 'สมมติ' }))).toEqual(['2']);
    expect(refs(filterRecords(recs, { q: 'h2' }))).toEqual(['2']);
    expect(refs(filterRecords(recs, {}))).toEqual(['1', '2', '3']);
    expect(refs(filterRecords(recs.concat(r({ ref: '4', status: '305,D24' })), { statusCode: 'D24' }))).toEqual(['3', '4']);
    expect(refs(filterRecords(recs, { statusCode: 'D2' }))).toEqual([]);
  });

  it('summarize: flagged rows count toward visits and claim but not eligible', () => {
    const s = summarize([r({ ref: '1', cid: 'a' }), r({ ref: '2', cid: 'a', claim: 300, eligible: 150 }), r({ ref: '3', cid: 'b', status: '305', claim: 150, eligible: 150 })]);
    expect([s.visits, s.persons, s.claim, s.eligible, s.flagged, s.flaggedEligible, s.diff]).toEqual([3, 2, 610, 300, 1, 150, 310]);
  });

  it('byService groups by name, sorted by visits', () => {
    const rows = byService([
      r({ ref: '1', cid: 'a' }), r({ ref: '2', cid: 'b' }), r({ ref: '3', cid: 'a', status: 'D24' }),
      r({ ref: '4', service: 'จิตบำบัด (รหัสรายบุคคล)', code: 'H9449.1', claim: 300, eligible: 300 })
    ]);
    expect(rows.map((x) => x.service)).toEqual(['กายภาพบำบัด', 'จิตบำบัด (รหัสรายบุคคล)']);
    const pt = rows[0]!;
    expect([pt.code, pt.visits, pt.persons, pt.claim, pt.eligible, pt.flagged]).toEqual(['H9339', 3, 2, 480, 300, 1]);
  });

  it('trend: daily for short ranges, monthly for long, empty buckets filled', () => {
    const recs = [r({ ref: '1', date: '2025-10-01' }), r({ ref: '2', date: '2025-10-03', status: 'D24' })];
    const d = trend(recs, '2025-10-01', '2025-10-03');
    expect(d.unit).toBe('day');
    expect(d.buckets.map((b) => [b.key, b.visits, b.eligible])).toEqual([['2025-10-01', 1, 150], ['2025-10-02', 0, 0], ['2025-10-03', 1, 0]]);
    const m = trend(recs.concat(r({ ref: '3', date: '2025-12-20' })), '2025-10-01', '2026-09-30');
    expect(m.unit).toBe('month');
    expect(m.buckets).toHaveLength(12);
    expect(m.buckets.slice(0, 3).map((b) => [b.key, b.visits])).toEqual([['2025-10', 2], ['2025-11', 0], ['2025-12', 1]]);
  });

  it('trend without range uses data bounds', () => {
    const t = trend([r({ ref: '1', date: '2024-01-10' }), r({ ref: '2', date: '2026-02-01' })], '', '');
    expect(t.unit).toBe('month');
    expect(t.buckets[0]!.key).toBe('2024-01');
    expect(t.buckets.at(-1)!.key).toBe('2026-02');
    expect(trend([], '', '').buckets).toEqual([]);
  });

  it('byStatus counts each code', () => {
    expect(byStatus([r({ ref: '1', status: 'D24' }), r({ ref: '2', status: 'D24,305' }), r({ ref: '3' })]).map((x) => [x.code, x.visits])).toEqual([['D24', 2], ['305', 1]]);
  });
});
