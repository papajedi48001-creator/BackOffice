import { describe, expect, it } from 'vitest';
import type { OfcRepLine, OfcStmLine } from './ofc-report';
import { summarizeOfc, type OfcRow } from './ofc-summary';

const row = (vn: string, hn: string, date: string, qty = 2, price = 4000, icode = '3000001'): OfcRow => ({ vstdate: date, vn, hn, name: `คน ${hn}`, icode, itemName: 'Insole', qty, sumPrice: price, pttype: '10', pttypeName: 'ข้าราชการ' });
const rep = (vn: string, paid: number, extra: Partial<OfcRepLine> = {}): OfcRepLine => ({ repNo: '691000117', tranId: `t${vn}`, itemNo: 1, vn, date: '2026-10-20', adp: '8610', itemName: 'Insole', qty: 2, claim: 4000, paid, deny: '', error: '', ...extra });
const stm = (vn: string, inst: number): OfcStmLine => ({ docNo: '11093_OP202610_01', repNo: '691000117', vn, date: '2026-10-20', claim: 4300, inst, total: 4300 });

describe('summarizeOfc', () => {
  const rows = [row('v1', 'h1', '2026-10-20'), row('v2', 'h2', '2026-10-20'), row('v3', 'h1', '2026-10-25', 1, 2000), row('v4', 'h3', '2026-10-26'), row('v5', 'h4', '2026-10-27')];
  const s = summarizeOfc(rows, [rep('v1', 4000), rep('v2', 0, { deny: 'Y', error: 'C438' }), rep('v4', 4000), rep('zz', 4000, { date: '2026-10-21' }), { ...rep('v1', 0, { adp: '9204', itemNo: 2 }) }], [stm('v1', 4000), stm('v9', 4000)]);

  it('gives each visit its status from REP (ADP 8610 only) and Statement ค่าอวัยวะฯ', () => {
    expect(s.visits.map((v) => [v.vn, v.status, v.repPaid, v.stmPaid])).toEqual([
      ['v5', 'none', null, null], ['v4', 'rep', 4000, null], ['v3', 'none', null, null], ['v1', 'paid', 4000, 4000], ['v2', 'denied', 0, null]
    ]);
    expect(s.visits.find((v) => v.vn === 'v2')!.errors).toEqual(['C438']);
    expect(s.visits.find((v) => v.vn === 'v1')!.repNos).toEqual(['691000117']);
  });

  it('gives each visit its Statement งวด (เลขที่เอกสาร without the hcode) and ส่วนต่าง once its result is final', () => {
    const two = summarizeOfc(rows, [rep('v1', 4000), rep('v2', 0)], [stm('v1', 3000), { ...stm('v1', 1000), docNo: '11093_OP202611_02' }, stm('v1', 0)]);
    expect(two.visits.map((v) => [v.vn, v.periods, v.diff])).toEqual([
      ['v5', [], null], ['v4', [], null], ['v3', [], null], ['v1', ['OP202610_01', 'OP202611_02'], 0], ['v2', [], -4000]
    ]);
  });

  it('totals people, visits, pieces, claim, REP and Statement, and counts REP lines outside the HOSxP visits', () => {
    expect(s.totals).toEqual({ people: 4, visits: 5, qty: 9, claim: 18000, repPaid: 8000, stmPaid: 4000, noRep: 6000, denied: 1, waitStm: 1, repOutside: 1 });
  });

  it('lists each person newest first with their visits, and each item', () => {
    expect(s.persons.map((p) => [p.hn, p.visits, p.qty, p.claim, p.last])).toEqual([
      ['h4', 1, 2, 4000, '2026-10-27'], ['h3', 1, 2, 4000, '2026-10-26'], ['h1', 2, 3, 6000, '2026-10-25'], ['h2', 1, 2, 4000, '2026-10-20']
    ]);
    expect(s.persons[2]!.vns).toEqual(['v3', 'v1']);
    expect(s.items).toEqual([{ icode: '3000001', name: 'Insole', people: 4, visits: 5, qty: 9, claim: 18000 }]);
  });
});
