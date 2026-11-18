// Ported from the legacy tests/fdh/core.test.js (node:test) without changing what each test checks.
import assert from 'node:assert';
import { describe, it as test } from 'vitest';
import * as C from './fdh-core';

describe('fdh-core (legacy parity)', () => {

const rc = (o) => Object.assign({ rep_no: '691000001', tran_id: 't', hn: 'h', an: '', pid: 'p', name: 'n', ptype: 'OP',
  visit_date: '2026-10-10', charge: 100, net: 80, error_code: '-', main_fund: '', sub_fund: 'HERB_FS', right: 'UCS', pay_mode: '', seq: 's' }, o);
const sr = (o) => Object.assign({ kind: 'normal', rep_no: '691000001', tran_id: 't', hn: 'h', pid: 'p', name: 'n', visit_date: '2026-10-10',
  maininscl: 'UCS', charge: 100, op: 0, ip_calc: 0, ip_paid: 0, hc: 0, hc_drug: 0, ae: 0, ae_drug: 0, inst: 0, dmis_calc: 0, dmis_paid: 0,
  dmis_drug: 0, palliative: 0, dmishd: 0, pp: 0, fs: 80, opbkk: 0, total: 80, source: 'FDH', seq: 's' }, o);
const payload = (cases, rows, period = '6910_OP_02', denies = []) => ({
  reps: [{ doc_no: 'eclaim_1', cases, denies }],
  stms: rows.length ? [{ doc_no: 'stm_1', period, rows }] : [],
});
const one = (cases, rows) => C.buildCases(payload(cases, rows));
const bySeq = (cs, seq) => cs.find(c => c.seq === seq);

test('splitSubFunds', () => {
  assert.deepStrictEqual(C.splitSubFunds(' DRUG_DELIVERY, TELEMED,DRUG_DELIVERY'), ['DRUG_DELIVERY', 'TELEMED']);
  assert.deepStrictEqual(C.splitSubFunds(''), []);
  assert.deepStrictEqual(C.splitSubFunds(null), []);
});

test('hasError', () => {
  assert.strictEqual(C.hasError('-'), false);
  assert.strictEqual(C.hasError(''), false);
  assert.strictEqual(C.hasError(null), false);
  assert.strictEqual(C.hasError(' - '), false);
  assert.strictEqual(C.hasError('237'), true);
  assert.strictEqual(C.hasError('DENY'), true);
});

test('current REP = highest REP No., others become history', () => {
  const cs = one([
    rc({ seq: 'A', rep_no: '691000110', error_code: '237', sub_fund: '' }),
    rc({ seq: 'A', rep_no: '691100024', error_code: '-', sub_fund: 'PP_DENT_FLUORIDE' }),
    rc({ seq: 'A', rep_no: '691000172', error_code: '171', sub_fund: '' }),
  ], []);
  assert.strictEqual(cs.length, 1);
  assert.strictEqual(cs[0].current.rep_no, '691100024');
  assert.strictEqual(cs[0].history.length, 2);
  assert.strictEqual(cs[0].history[0].rep_no, '691000172', 'history newest first');
  assert.strictEqual(cs[0].status, 'pending');
});

test('sub-fund falls back to history, then ไม่ระบุ', () => {
  const cs = one([
    rc({ seq: 'A', rep_no: '691000001', sub_fund: 'PP_DENT_FLUORIDE' }),
    rc({ seq: 'A', rep_no: '691000002', sub_fund: '', error_code: '804' }),
    rc({ seq: 'B', sub_fund: '' }),
  ], []);
  assert.deepStrictEqual(bySeq(cs, 'A').subFunds, ['PP_DENT_FLUORIDE']);
  assert.deepStrictEqual(bySeq(cs, 'B').subFunds, [C.UNSPECIFIED]);
  assert.strictEqual(C.UNSPECIFIED, 'ไม่ระบุ');
});

test('five statuses', () => {
  const cs = one([
    rc({ seq: 'paid', net: 80 }),
    rc({ seq: 'mis', net: 80 }),
    rc({ seq: 'near', net: 80 }),
    rc({ seq: 'err', error_code: '237', net: 0 }),
    rc({ seq: 'pend', net: 50 }),
    rc({ seq: 'paidLaterErr', rep_no: '691100099', error_code: 'DENY', net: 80 }),
  ], [
    sr({ seq: 'paid', total: 80 }),
    sr({ seq: 'mis', total: 79.98 }),
    sr({ seq: 'near', total: 80.005 }),
    sr({ seq: 'norep', total: 60, charge: 70 }),
    sr({ seq: 'paidLaterErr', total: 80 }),
  ]);
  assert.strictEqual(bySeq(cs, 'paid').status, 'paid');
  assert.strictEqual(bySeq(cs, 'mis').status, 'mismatch');
  assert.strictEqual(bySeq(cs, 'near').status, 'paid');
  assert.strictEqual(bySeq(cs, 'err').status, 'error');
  assert.strictEqual(bySeq(cs, 'pend').status, 'pending');
  assert.strictEqual(bySeq(cs, 'paidLaterErr').status, 'paid', 'in STM wins over REP error');
  const nr = bySeq(cs, 'norep');
  assert.strictEqual(nr.status, 'norep');
  assert.strictEqual(nr.charge, 70, 'norep charge from STM');
  assert.strictEqual(nr.repNet, 0);
  assert.deepStrictEqual(nr.subFunds, [C.UNSPECIFIED]);
  for (const k of ['norep', 'mismatch', 'paid', 'error', 'pending']) assert.ok(C.STATUS[k].label && C.STATUS[k].icon);
});

test('STM rows of one SEQ are summed across periods', () => {
  const cs = C.buildCases({
    reps: [{ doc_no: 'e', cases: [rc({ seq: 'A', net: 100 })], denies: [] }],
    stms: [{ doc_no: 's1', period: '6910_OP_02', rows: [sr({ seq: 'A', total: 60 })] },
      { doc_no: 's2', period: '6911_OP_01', rows: [sr({ seq: 'A', kind: 'appeal', total: 40 })] }],
  });
  assert.strictEqual(cs[0].stmTotal, 100);
  assert.deepStrictEqual(cs[0].periods, ['6910_OP_02', '6911_OP_01']);
  assert.strictEqual(cs[0].status, 'paid');
});

test('rows without SEQ use TRAN_ID key; denies attach by TRAN_ID', () => {
  const cs = C.buildCases(payload([rc({ seq: '', tran_id: '999', error_code: 'DENY' })], [], 'x',
    [{ tran_id: '999', fund: 'EXCEPT', code: 'DM08', category: '', qty: 0, deny: 'D611' }]));
  assert.strictEqual(cs[0].seq, 'TRAN:999');
  assert.strictEqual(cs[0].denies.length, 1);
});

test('summarize counts each case once; bySubFund counts it per sub-fund', () => {
  const cs = one([
    rc({ seq: 'A', sub_fund: 'DRUG_DELIVERY,TELEMED', charge: 100, net: 80 }),
    rc({ seq: 'B', sub_fund: 'TELEMED', charge: 50, net: 40 }),
    rc({ seq: 'C', sub_fund: '', error_code: '237', charge: 30, net: 0 }),
  ], [sr({ seq: 'A', total: 80 })]);
  const s = C.summarize(cs);
  assert.strictEqual(s.cases, 3);
  assert.strictEqual(s.charge, 180);
  assert.strictEqual(s.repNet, 120);
  assert.strictEqual(s.stmTotal, 80);
  assert.strictEqual(s.pendingNet, 40);
  assert.strictEqual(s.errorCases, 1);
  assert.strictEqual(Math.round(s.paidPct), 67);
  const g = C.bySubFund(cs);
  const tele = g.find(x => x.subFund === 'TELEMED');
  assert.strictEqual(tele.cases, 2);
  assert.strictEqual(tele.repNet, 120);
  assert.strictEqual(tele.stmTotal, 80);
  assert.strictEqual(g.find(x => x.subFund === 'DRUG_DELIVERY').cases, 1);
  assert.strictEqual(g.find(x => x.subFund === 'ไม่ระบุ').errorCases, 1);
  assert.strictEqual(g[0].subFund, 'TELEMED', 'sorted by repNet desc');
});

test('byMoneyColumn per period with total row', () => {
  const cs = C.buildCases({
    reps: [],
    stms: [{ doc_no: 's1', period: '6910_OP_02', rows: [sr({ seq: 'A', fs: 30, op: 10, total: 40 }), sr({ seq: 'B', hc_drug: 5, fs: 0, total: 5 })] },
      { doc_no: 's2', period: '6911_OP_01', rows: [sr({ seq: 'C', pp: 7, fs: 0, total: 7 })] }],
  });
  const m = C.byMoneyColumn(cs);
  assert.strictEqual(m.length, 3);
  const p1 = m.find(r => r.period === '6910_OP_02');
  assert.strictEqual(p1.fs, 30);
  assert.strictEqual(p1.hc_drug, 5);
  assert.strictEqual(p1.total, 45);
  const tot = m[m.length - 1];
  assert.strictEqual(tot.period, 'รวม');
  assert.strictEqual(tot.total, 52);
  assert.strictEqual(tot.total, C.summarize(cs).stmTotal);
  assert.deepStrictEqual(C.MONEY_COLUMNS.map(c => c.key),
    ['op', 'ip_paid', 'hc', 'hc_drug', 'ae', 'ae_drug', 'inst', 'dmis_paid', 'dmis_drug', 'palliative', 'dmishd', 'pp', 'fs', 'opbkk']);
});

test('byMoneyColumn respects filtered cases', () => {
  const cs = C.buildCases({ reps: [], stms: [{ doc_no: 's', period: 'P', rows: [sr({ seq: 'A', total: 10 }), sr({ seq: 'B', total: 20 })] }] });
  const m = C.byMoneyColumn(cs.filter(c => c.seq === 'A'));
  assert.strictEqual(m[m.length - 1].total, 10);
});

test('byErrorCode splits comma codes, only error cases', () => {
  const cs = one([
    rc({ seq: 'A', error_code: '171,237', charge: 10, sub_fund: 'X' }),
    rc({ seq: 'B', error_code: '237', charge: 5, sub_fund: 'Y' }),
    rc({ seq: 'C', error_code: '-', charge: 5 }),
  ], []);
  const e = C.byErrorCode(cs);
  assert.deepStrictEqual(e.map(x => x.code), ['237', '171']);
  assert.strictEqual(e[0].cases, 2);
  assert.strictEqual(e[0].charge, 15);
  assert.deepStrictEqual(e[0].subFunds, ['X', 'Y']);
});

test('filterCases', () => {
  const cs = one([
    rc({ seq: 'S1', hn: '450018359', name: 'นาย ก', pid: '111', tran_id: 'T1', visit_date: '2026-10-01', right: 'UCS', sub_fund: 'HERB_FS' }),
    rc({ seq: 'S2', hn: '2', name: 'นาง ข', pid: '222', tran_id: 'T2', visit_date: '2026-10-31', right: 'WEL', sub_fund: 'TELEMED', error_code: '237' }),
    rc({ seq: 'S3', hn: '3', name: 'นาง ค', pid: '333', tran_id: 'T3', visit_date: '2026-11-01', right: 'WEL', sub_fund: 'TELEMED' }),
  ], [sr({ seq: 'S1', total: 80 })]);
  const ids = f => C.filterCases(cs, f).map(c => c.seq).sort();
  assert.deepStrictEqual(ids({}), ['S1', 'S2', 'S3']);
  assert.deepStrictEqual(ids({ from: '2026-10-01', to: '2026-10-31' }), ['S1', 'S2'], 'inclusive range');
  assert.deepStrictEqual(ids({ rights: ['WEL'] }), ['S2', 'S3']);
  assert.deepStrictEqual(ids({ subFund: 'TELEMED' }), ['S2', 'S3']);
  assert.deepStrictEqual(ids({ status: 'error' }), ['S2']);
  assert.deepStrictEqual(ids({ periods: ['6910_OP_02'] }), ['S1']);
  assert.deepStrictEqual(ids({ errorCode: '237' }), ['S2']);
  for (const q of ['450018359', 'นาง ข', '222', 'S2', 'T2']) assert.ok(ids({ q }).includes(q === '450018359' ? 'S1' : 'S2'), q);
});

test('review: STM row without SEQ matches REP by TRAN_ID; noSeq counted', () => {
  const cs = C.buildCases(payload([rc({ seq: 'S1', tran_id: 'T1', net: 80 }), rc({ seq: '', tran_id: 'T9', net: 5 })],
    [sr({ seq: '', tran_id: 'T1', total: 80 })]));
  assert.strictEqual(cs.length, 2);
  assert.strictEqual(bySeq(cs, 'S1').status, 'paid');
  assert.strictEqual(C.summarize(cs).noSeq, 1);
});

test('review: empty right becomes "-" so the filter option works', () => {
  const cs = one([rc({ seq: 'A', right: '' })], []);
  assert.strictEqual(cs[0].right, '-');
  assert.strictEqual(C.filterCases(cs, { rights: ['-'] }).length, 1);
});

test('review: paidPct ignores STM money of cases without REP', () => {
  const cs = one([rc({ seq: 'A', net: 100 })], [sr({ seq: 'A', total: 50 }), sr({ seq: 'X', total: 500 })]);
  assert.strictEqual(Math.round(C.summarize(cs).paidPct), 50);
  assert.strictEqual(C.summarize(cs).stmTotal, 550);
});

test('review: equal REP No. tie-break by report date', () => {
  const cs = C.buildCases({ reps: [
    { doc_no: 'b', report_date: '2026-11-07', cases: [rc({ seq: 'A', rep_no: '691000001', error_code: '-', net: 9 })], denies: [] },
    { doc_no: 'a', report_date: '2026-11-01', cases: [rc({ seq: 'A', rep_no: '691000001', error_code: '237' })], denies: [] },
  ], stms: [] });
  assert.strictEqual(cs[0].current.doc_no, 'b');
});

test('byPerson groups visits by HN with per-fund STM money', () => {
  const cs = one([
    rc({ seq: 'A', hn: '001', name: 'นาย ก', visit_date: '2026-10-01', charge: 100, net: 80, right: 'UCS' }),
    rc({ seq: 'B', hn: '001', name: 'นาย ก', visit_date: '2026-10-20', charge: 50, net: 40, right: 'WEL' }),
    rc({ seq: 'C', hn: '002', name: 'นาง ข', charge: 10, net: 10 }),
    rc({ seq: 'D', hn: '', pid: '999', name: 'ไม่มี HN', net: 1 }),
  ], [sr({ seq: 'A', fs: 30, op: 50, total: 80 }), sr({ seq: 'B', fs: 0, pp: 40, total: 40 })]);
  const ps = C.byPerson(cs);
  assert.strictEqual(ps.length, 3);
  const p = ps[0];
  assert.strictEqual(p.hn, '001');
  assert.strictEqual(p.visits, 2);
  assert.strictEqual(p.charge, 150);
  assert.strictEqual(p.repNet, 120);
  assert.strictEqual(p.stmTotal, 120);
  assert.strictEqual(p.money.fs, 30);
  assert.strictEqual(p.money.op, 50);
  assert.strictEqual(p.money.pp, 40);
  assert.strictEqual(p.right, 'WEL', 'right from latest visit');
  assert.strictEqual(p.cases.length, 2);
  assert.ok(ps.some(x => x.key === 'PID:999'), 'no HN → PID key');
  assert.strictEqual(ps[1].hn, '002', 'sorted by stmTotal then repNet desc');
});

test('byPersonFund: one row per person and REP sub-fund, STM matched by SEQ', () => {
  const cs = one([
    rc({ seq: 'A', hn: '001', name: 'นาย ก', sub_fund: 'OPAE,OPAE-DRUG', charge: 300, net: 260 }),
    rc({ seq: 'B', hn: '001', name: 'นาย ก', sub_fund: 'OPAE', charge: 100, net: 90 }),
    rc({ seq: 'C', hn: '002', name: 'นาง ข', sub_fund: 'HERB_FS', charge: 10, net: 10 }),
  ], [sr({ seq: 'A', fs: 0, ae: 250, ae_drug: 10, total: 260 }), sr({ seq: 'B', fs: 0, ae: 90, total: 90 })]);
  const rows = C.byPersonFund(cs);
  assert.deepStrictEqual(rows.map(r => r.key), ['001|OPAE', '001|OPAE-DRUG', '002|HERB_FS']);
  const ae = rows[0];
  assert.strictEqual(ae.visits, 2);
  assert.strictEqual(ae.shared, 1, 'visit A also claims OPAE-DRUG');
  assert.strictEqual(ae.stmTotal, 350);
  assert.strictEqual(ae.repNet, 350);
  assert.strictEqual(rows[1].stmTotal, 260);
  assert.strictEqual(rows[2].pending, 1, 'no STM yet');
  assert.strictEqual(rows[2].stmTotal, 0);
  assert.strictEqual(rows[1].stmFund, 10, 'OPAE-DRUG gets the AE-DRUG column of visit A');
  assert.strictEqual(rows[0].stmFund, 90, 'OPAE alone in visit B');
  assert.strictEqual(rows[0].stmShared, 250, 'AE of visit A: OPAE-DRUG never seen alone, so shared');
  assert.deepStrictEqual(C.byPersonFund(cs, 'OPAE-DRUG').map(r => r.key), ['001|OPAE-DRUG']);
});

test('splitVisit: money per REP sub-fund within one VN', () => {
  const cs = one([
    rc({ seq: 'S1', sub_fund: 'OPAE' }), rc({ seq: 'S2', sub_fund: 'OPAE-DRUG' }), rc({ seq: 'S3', sub_fund: 'TELEMED' }),
    rc({ seq: 'M1', sub_fund: 'OPAE,OPAE-DRUG' }),
    rc({ seq: 'M2', sub_fund: 'DRUG_DELIVERY,TELEMED' }),
    rc({ seq: 'M3', sub_fund: 'OPAE,OPAE-DRUG' }),
  ], [
    sr({ seq: 'S1', fs: 0, ae: 1, total: 1 }), sr({ seq: 'S2', fs: 0, ae_drug: 1, total: 1 }), sr({ seq: 'S3', fs: 0, op: 1, total: 1 }),
    sr({ seq: 'M1', fs: 0, ae: 250, ae_drug: 10, total: 260 }),
    sr({ seq: 'M2', fs: 0, op: 100, total: 100 }),
  ]);
  const m1 = bySeq(cs, 'M1').fundSplit;
  assert.deepStrictEqual(m1.byFund, { OPAE: 250, 'OPAE-DRUG': 10 });
  assert.ok(m1.parts.every(p => p.exact));
  const m2 = bySeq(cs, 'M2').fundSplit;
  assert.strictEqual(m2.byFund.TELEMED, 0, 'DRUG_DELIVERY never seen alone → cannot tell OP apart');
  assert.deepStrictEqual(m2.parts.map(p => [p.funds.join('+'), p.amount, p.exact]), [['DRUG_DELIVERY+TELEMED', 100, false]]);
  assert.strictEqual(bySeq(cs, 'M3').fundSplit, null, 'no STM yet');
  assert.deepStrictEqual(bySeq(cs, 'S1').fundSplit.byFund, { OPAE: 1 });
});

test('splitVisit: fixed rate of a fund seen alone splits a shared column (TELEMED 50 → DRUG_DELIVERY rest)', () => {
  const tele = ['T1', 'T2', 'T3'];
  const cs = one([
    ...tele.map(seq => rc({ seq, sub_fund: 'TELEMED' })),
    rc({ seq: 'M', sub_fund: 'DRUG_DELIVERY,TELEMED' }),
    rc({ seq: 'P1', sub_fund: 'PP_CBC' }), rc({ seq: 'P2', sub_fund: 'PP_CBC' }), rc({ seq: 'P3', sub_fund: 'ANC' }),
    rc({ seq: 'PM', sub_fund: 'ANC,PP_CBC' }),
  ], [
    ...tele.map(seq => sr({ seq, fs: 0, op: 50, total: 50 })),
    sr({ seq: 'M', fs: 0, op: 100, total: 100 }),
    sr({ seq: 'P1', fs: 0, pp: 60, total: 60 }), sr({ seq: 'P2', fs: 0, pp: 70, total: 70 }), sr({ seq: 'P3', fs: 0, pp: 300, total: 300 }),
    sr({ seq: 'PM', fs: 0, pp: 400, total: 400 }),
  ]);
  const m = bySeq(cs, 'M').fundSplit;
  assert.deepStrictEqual(m.byFund, { DRUG_DELIVERY: 50, TELEMED: 50 });
  assert.ok(m.parts.every(p => p.exact));
  const pm = bySeq(cs, 'PM').fundSplit;
  assert.strictEqual(pm.byFund.ANC, 0, 'ANC seen alone only once and PP_CBC rate varies → stays shared');
  assert.strictEqual(pm.shared.ANC, 400);
});

test('byFundVisit: per REP sub-fund, VN rows sorted by HN with the fund amount', () => {
  const cs = one([
    rc({ seq: 'S1', hn: '9', sub_fund: 'OPAE' }), rc({ seq: 'S2', hn: '9', sub_fund: 'OPAE-DRUG' }),
    rc({ seq: 'A', hn: '200', sub_fund: 'OPAE,OPAE-DRUG', net: 260 }),
    rc({ seq: 'B', hn: '100', sub_fund: 'OPAE', net: 90 }),
    rc({ seq: 'C', hn: '150', sub_fund: 'OPAE', net: 70 }),
  ], [sr({ seq: 'S1', fs: 0, ae: 1, total: 1 }), sr({ seq: 'S2', fs: 0, ae_drug: 1, total: 1 }),
    sr({ seq: 'A', fs: 0, ae: 250, ae_drug: 10, total: 260 }), sr({ seq: 'B', fs: 0, ae: 90, total: 90 })]);
  const fs = C.byFundVisit(cs);
  assert.deepStrictEqual(fs.map(f => f.subFund), ['OPAE', 'OPAE-DRUG']);
  const ae = fs[0];
  assert.deepStrictEqual(ae.rows.map(r => r.case.hn), ['100', '150', '200', '9']);
  assert.deepStrictEqual(ae.rows.map(r => r.own), [90, 0, 250, 1]);
  assert.strictEqual(ae.stmFund, 341);
  assert.strictEqual(ae.persons, 4);
  assert.strictEqual(ae.pending, 1);
  assert.strictEqual(fs[1].rows.find(r => r.case.seq === 'A').own, 10);
});

test('C case fixed by a newer REP on the same VN (SEQ) is no longer error and is flagged fixedC', () => {
  const cs = one([
    rc({ seq: '691027000064', rep_no: '691000197', error_code: '756', sub_fund: '' }),
    rc({ seq: '691027000064', rep_no: '691100030', error_code: '-', sub_fund: 'HERB_FS', net: 50 }),
    rc({ seq: 'B', rep_no: '691000001', error_code: '237' }),
  ], []);
  const a = bySeq(cs, '691027000064');
  assert.strictEqual(a.status, 'pending');
  assert.strictEqual(a.fixedC, true);
  assert.strictEqual(a.errorCode, '');
  assert.strictEqual(bySeq(cs, 'B').fixedC, false);
  const s = C.summarize(cs);
  assert.strictEqual(s.errorCases, 1);
  assert.strictEqual(s.fixedC, 1);
  assert.deepStrictEqual(C.byErrorCode(cs)[0].vns, ['B']);
});

test('filterCases fixedC shows only VNs fixed after C', () => {
  const cs = one([
    rc({ seq: 'A', rep_no: '691000001', error_code: '237' }), rc({ seq: 'A', rep_no: '691000009', error_code: '-' }),
    rc({ seq: 'B', error_code: '-' }),
  ], []);
  assert.deepStrictEqual(C.filterCases(cs, { fixedC: true }).map(c => c.seq), ['A']);
});

});
