import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { herbRules, type HerbSettings } from './herb-rules';
import { herbReceivedFromRep, herbValue, isHerbFund, summarizeHerb, type HerbRepDoc, type HerbRow, type HerbSummary, type HerbTally } from './herb-summary';
import { ttmRules, type TtmSettings } from './ttm-rules';

type Legacy = Record<string, unknown>;
const legacy = JSON.parse(readFileSync(new URL('./fixtures/herb-legacy.json', import.meta.url), 'utf8')) as {
  rows: Legacy[]; docs: Legacy[]; received: Record<string, number>;
  cases: Record<string, { settings: HerbSettings; ttm: TtmSettings; rep: boolean; expected: Legacy }>;
};
const s = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const n = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

const rows: HerbRow[] = legacy.rows.map((row) => ({
  rxdate: s(row.rxdate), vn: s(row.vn), an: s(row.an), hn: s(row.hn), icode: s(row.icode), drugName: s(row.drug_name), units: s(row.units),
  qty: Number(row.qty ?? 0), sumPrice: Number(row.sum_price ?? 0), unitcost: n(row.unitcost), stdprice: n(row.stdprice),
  pttype: s(row.pttype), pttypeName: s(row.pttype_name), hipdata: s(row.hipdata_code)
}));
const docs = legacy.docs as unknown as HerbRepDoc[];

/** The TypeScript summary in the legacy PHP shape (snake_case keys), to compare with the PHP output. */
function toLegacy(summary: HerbSummary): Legacy {
  const tally = (t: HerbTally) => ({ visits: t.visits, patients: t.patients, qty: t.qty, cost: t.cost, value: t.value, ontop: t.ontop, ontop_points: t.ontopPoints, received: t.received, total: t.total });
  const drug = (d: HerbSummary['drugs'][number]) => ({
    ...tally(d), icode: d.icode, name: d.name, units: d.units, ontop_listed: d.ontopListed,
    ontop_rate: d.ontopRate === null ? null : { name: d.ontopRate.name, unit: d.ontopRate.unit, std_qty: d.ontopRate.stdQty, baht: d.ontopRate.baht, points: d.ontopRate.points }
  });
  return {
    totals: { ...tally(summary.totals), received_visits: summary.totals.receivedVisits },
    groups: summary.groups.map((g) => ({ ...tally(g), key: g.key, name: g.name, drugs: g.drugs.map(drug) })),
    drugs: summary.drugs.map(drug),
    days: summary.days.map((d) => ({ ...tally(d), date: d.date }))
  };
}
/** PHP turns numeric strings into numbers in places (array keys); compare through JSON with strings normalised. */
const normalise = (value: unknown): unknown => JSON.parse(JSON.stringify(value), (_key, v: unknown) => (typeof v === 'string' && /^-?\d+$/.test(v) && v.length < 16 ? Number(v) : v));

describe('summarizeHerb matches the legacy PHP', () => {
  it('reads REP Data Drug the same way', () => {
    expect(Object.fromEntries(herbReceivedFromRep(docs))).toEqual(legacy.received);
  });
  for (const [name, { settings, ttm, rep, expected }] of Object.entries(legacy.cases)) {
    it(`gives the same summary (${name})`, () => {
      const rules = herbRules(settings, ttmRules(ttm));
      expect(normalise(toLegacy(summarizeHerb(rows, rules, rep ? herbReceivedFromRep(docs) : null)))).toEqual(normalise(expected));
    });
  }
});

// Ported from the legacy tests/herb_dispense/HerbSummaryTest.php; made-up data only.
describe('summarizeHerb', () => {
  const rules = herbRules();
  const row = (o: Partial<HerbRow> = {}): HerbRow => ({
    rxdate: '2026-11-05', vn: 'v1', an: '', hn: 'h1', icode: '1520003', drugName: 'ฟ้าทะลายโจร 400 mg.', units: 'cap', qty: 10, sumPrice: 20,
    unitcost: 1.5, stdprice: 2, pttype: '89', pttypeName: 'UC ในเขต', hipdata: 'UCS', ...o
  });
  const ofc = { pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC' };
  const summary = summarizeHerb([
    row(),
    row({ icode: '1560027', drugName: 'สตรีหลังคลอด', qty: 1, unitcost: 30, stdprice: 50 }),
    row({ vn: 'v2', hn: 'h2', qty: 20, ...ofc }),
    row({ vn: 'v3', hn: 'h3', an: 'a1', qty: 5, rxdate: '2026-11-06', ...ofc }),
    row({ vn: 'v3', hn: 'h3', an: 'a1', qty: 5, rxdate: '2026-11-07', ...ofc }),
    row({ icode: '9999999', drugName: 'Paracetamol' }),
    row({ vn: 'v4', hn: 'h4', qty: 2, unitcost: null, stdprice: null, sumPrice: 0, pttype: 'X', pttypeName: 'ต่างด้าว', hipdata: '' })
  ], rules, null);

  it('counts visits, money and UC ontop like the legacy page', () => {
    const t = summary.totals;
    expect(t).toMatchObject({ visits: 4, patients: 4, qty: 43, cost: 1.5 * 40 + 30, value: 2 * 40 + 50, ontop: 92, received: null, total: 130 });
    const g = Object.fromEntries(summary.groups.map((x) => [x.key, x]));
    expect(Object.keys(g)).toEqual(['ofc', 'lgo', 'uc', 'cash', 'sss', 'receipt', 'other']);
    expect(g.uc).toMatchObject({ visits: 1, cost: 45, value: 70, ontop: 92 });
    expect(g.ofc).toMatchObject({ visits: 2, value: 60, ontop: 0 });
    expect(g.cash?.visits).toBe(0);
    expect(g.other).toMatchObject({ visits: 1, value: 0, ontop: 0 });
    expect(g.uc?.drugs.map((d) => d.icode)).toEqual(['1560027', '1520003']);
    expect(summary.drugs.map((d) => d.icode)).toEqual(['1520003', '1560027']);
    expect(summary.drugs[0]).toMatchObject({ qty: 42, visits: 4, ontopListed: true, name: 'ฟ้าทะลายโจร 400 mg.' });
    expect(summary.drugs[1]?.ontopListed).toBe(false);
    expect(summary.days.map((d) => [d.date, d.value])).toEqual([['2026-11-05', 110], ['2026-11-06', 10], ['2026-11-07', 10]]);
  });

  it('pays UC ontop once per visit and icode, and points only with a rate', () => {
    expect(summarizeHerb([row({ vn: 'u1' }), row({ vn: 'u1', rxdate: '2026-11-06' }), row({ vn: 'u2' })], rules, null).totals.ontop).toBe(184);
    const pts = [row({ icode: '1560021', drugName: 'เลือดงาม', qty: 42, unitcost: 0.66, stdprice: 1 }), row({ vn: 'v9', icode: '1560021', drugName: 'เลือดงาม', qty: 10, unitcost: 0.66, stdprice: 1 })];
    expect(summarizeHerb(pts, rules, null).totals).toMatchObject({ ontop: 0, ontopPoints: 529 });
    expect(summarizeHerb(pts, herbRules({ point_baht: '0.5' }), null).totals.ontop).toBe(264.5);
    expect(summarizeHerb(pts, rules, null).drugs[0]?.ontopRate?.points).toBe(264.5);
  });

  it('pays UC ontop once for an admission that spans two VNs', () => {
    expect(summarizeHerb([row({ vn: 'a', an: 'AN1' }), row({ vn: 'b', an: 'AN1', rxdate: '2026-11-06' })], rules, null).totals).toMatchObject({ visits: 1, ontop: 92 });
  });

  it('handles no rows', () => {
    const empty = summarizeHerb([], rules, null);
    expect(empty.totals.visits).toBe(0);
    expect(empty.drugs).toEqual([]);
  });

  it('takes รับจริง from HERB_FS cases and herbal drugs of REP', () => {
    expect(herbReceivedFromRep([]).size).toBe(0);
    const repDocs: HerbRepDoc[] = [
      { doc_no: 'B', report_date: '2026-11-10', cases: [{ tran_id: 't2', seq: 'v2', sub_fund: 'HERB_FS' }], drugs: [{ tran_id: 't2', icode: '1520003', type: 'H000601', paid: 92 }] },
      { doc_no: 'A', report_date: '2026-11-06',
        cases: [{ tran_id: 't1', seq: 'v1', sub_fund: 'HERB_FS,OPAE,OPAE-DRUG' }, { tran_id: 't2', seq: 'v2', sub_fund: 'HERB_FS' }, { tran_id: 't3', seq: 'v3', sub_fund: 'OPAE,OPAE-DRUG' }],
        drugs: [
          { tran_id: 't1', icode: '1520003', type: 'H000601', paid: 92 }, { tran_id: 't1', icode: '1680009', type: 'H000101', paid: 40 },
          { tran_id: 't1', icode: '1000211', type: 'DrugsFS', paid: 10 }, { tran_id: 't2', icode: '1520003', type: 'H000601', paid: 50 },
          { tran_id: 't3', icode: '1520003', type: 'H000601', paid: 92 }, { tran_id: 'zz', icode: '1520003', type: 'H000601', paid: 99 }
        ] }
    ];
    const received = herbReceivedFromRep(repDocs);
    expect(Object.fromEntries(received)).toEqual({ 'v1|1520003': 92, 'v1|1680009': 40, 'v2|1520003': 92 });
    expect(isHerbFund('HERB_FS')).toBe(true);
    expect(isHerbFund('DRUG_DELIVERY,HERB_FS,TELEMED')).toBe(true);
    expect(isHerbFund('HERB_GB')).toBe(false);
    expect(isHerbFund('')).toBe(false);
    const dup = herbReceivedFromRep([{ doc_no: 'C', report_date: '', cases: [{ tran_id: 't5', seq: 'v5', sub_fund: 'HERB_FS' }], drugs: [{ tran_id: 't5', icode: '1550043', type: 'H000102', paid: 43 }, { tran_id: 't5', icode: '1550043', type: 'H000102', paid: 0 }] }]);
    expect(Object.fromEntries(dup)).toEqual({ 'v5|1550043': 43 });

    const rx = [
      row({ qty: 20, stdprice: 2 }), row({ icode: '1560027', drugName: 'สตรีหลังคลอด', qty: 1, stdprice: 50 }), row({ icode: '1680009', drugName: 'ครีมไพล', qty: 1, stdprice: 40 }),
      row({ vn: 'v2', hn: 'h2', qty: 20, stdprice: 2, ...ofc }), row({ vn: 'v3', hn: 'h3', qty: 20, stdprice: 2 })
    ];
    expect(summarizeHerb(rx, rules, null).totals.received).toBeNull();
    const r = summarizeHerb(rx, rules, received);
    expect(r.totals).toMatchObject({ received: 224, receivedVisits: 2, total: 434 });
    const rd = Object.fromEntries(r.drugs.map((d) => [d.icode, d]));
    expect([rd['1520003']?.received, rd['1680009']?.received, rd['1560027']?.received]).toEqual([184, 40, 0]);
    const rg = Object.fromEntries(r.groups.map((g) => [g.key, g]));
    expect([rg.uc?.received, rg.ofc?.received]).toEqual([132, 92]);
    const r3 = summarizeHerb([row({ vn: 'w1', qty: 1, rxdate: '2026-10-01' }), row({ vn: 'w1', qty: 1, rxdate: '2026-10-02' }), row({ vn: 'w1', an: 'a1', icode: '1680009', qty: 1 })],
      rules, new Map([['w1|1520003', 92], ['w1|1680009', 40]]));
    expect(r3.totals.received).toBe(92);
  });

  it('uses the sale price when stdprice is 0 or empty', () => {
    expect(herbValue({ qty: 10, stdprice: 3, sumPrice: 99 })).toBe(30);
    expect(herbValue({ qty: 10, stdprice: 0, sumPrice: 99 })).toBe(99);
    expect(herbValue({ qty: 10, stdprice: null, sumPrice: 99 })).toBe(99);
    expect(summarizeHerb([row({ icode: '1680024', qty: 42, stdprice: 0, sumPrice: 84, ...ofc })], rules, null).totals.value).toBe(84);
  });
});
