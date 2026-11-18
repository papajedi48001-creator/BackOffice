import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ttmRules, type TtmItem, type TtmSettings } from './ttm-rules';
import { summarizeTtm, type TtmServiceRow, type TtmSummary, type TtmVisit } from './ttm-summary';

type Legacy = Record<string, unknown>;
const legacy = JSON.parse(readFileSync(new URL('./fixtures/ttm-legacy.json', import.meta.url), 'utf8')) as { services: Legacy[]; visits: Legacy[]; items: Legacy[]; cases: Record<string, { settings: TtmSettings; expected: Legacy }> };
const s = (value: unknown) => (value === null || value === undefined ? '' : String(value));

const services: TtmServiceRow[] = legacy.services.map((row) => ({ vn: s(row.vn), hn: s(row.hn), an: s(row.an), serviceDate: s(row.service_date), serviceTime: s(row.service_time), typeId: s(row.health_med_service_type_id), typeName: s(row.health_med_service_type_name), doctorName: s(row.health_med_doctor_name), treatmentName: s(row.health_med_treatment_type_name), patientName: s(row.pateint_name) }));
const visits: TtmVisit[] = legacy.visits.map((row) => ({ vn: s(row.vn), an: s(row.an), pttype: s(row.pttype), pttypeName: s(row.pttype_name), hipdata: s(row.hipdata_code) }));
const items: TtmItem[] = legacy.items.map((row) => ({ vn: s(row.vn), icode: s(row.icode), income: s(row.income), incomeName: s(row.income_name), itemName: s(row.item_name), isDrug: Number(row.is_drug) === 1, qty: Number(row.qty), amount: Number(row.amount) }));

/** The TypeScript summary in the legacy PHP shape (snake_case keys, `opd_fee`), to compare with the PHP output. */
function toLegacy(summary: TtmSummary): Legacy {
  const people = (row: TtmSummary['all']) => ({ patients: row.patients, massage: row.massage, herb: row.herb, massage_amount: row.massageAmount, herb_amount: row.herbAmount, total: row.total });
  const tally = (rows: TtmSummary['byType']) => rows.map((row) => ({ name: row.name, count: row.count, patients: row.patients, ...(row.id !== undefined ? { id: row.id } : {}) }));
  return {
    service_rows: summary.serviceRows, visits: summary.visits, all: people(summary.all), ipd: people(summary.ipd), after_hours: people(summary.afterHours),
    groups: summary.groups.map((g) => ({ key: g.key, name: g.name, patients: g.patients, massage: g.massage, herb: g.herb, opd_fee: g.opdFee, total: g.total })),
    totals: { massage: summary.totals.massage, herb: summary.totals.herb, opd_fee: summary.totals.opdFee, grand: summary.totals.grand },
    daily: summary.daily.map((d) => ({ date: d.date, patients: d.patients, massage: d.massage, herb: d.herb, opd_fee: d.opdFee })),
    by_type: tally(summary.byType), by_doctor: tally(summary.byDoctor), by_treatment: tally(summary.byTreatment),
    rights: summary.rights,
    item_stats: summary.itemStats.map((i) => ({ icode: i.icode, name: i.name, income: i.income, income_name: i.incomeName, is_drug: i.isDrug, category: i.category, kind: i.kind, visits: i.visits, qty: i.qty, amount: i.amount })),
    income_stats: summary.incomeStats.map((i) => ({ income: i.income, name: i.name, amount: i.amount, by_category: i.byCategory })),
    visit_list: summary.visitList.map((v) => ({ vn: v.vn, hn: v.hn, date: v.date, time: v.time, patient_name: v.patientName, pttype: v.pttype, pttype_name: v.pttypeName, right: v.right, right_name: v.rightName, ipd: v.ipd, after_hours: v.afterHours, services: v.services, doctors: v.doctors, treatments: v.treatments, massage: v.massage, herb: v.herb, opd_fee: v.opdFee, kinds: v.kinds, total: v.total })),
    kinds: summary.kinds, matrix: summary.matrix, periods: summary.periods
  };
}

/** PHP turns numeric-string keys and values into numbers in places (array keys); compare through JSON with strings normalised. */
const normalise = (value: unknown): unknown => JSON.parse(JSON.stringify(value), (_key, v: unknown) => (typeof v === 'string' && /^-?\d+$/.test(v) && v.length < 16 ? Number(v) : v));

describe('summarizeTtm matches the legacy PHP', () => {
  for (const [name, { settings, expected }] of Object.entries(legacy.cases)) {
    it(`gives the same summary (${name} settings)`, () => {
      expect(normalise(toLegacy(summarizeTtm(services, visits, items, ttmRules(settings))))).toEqual(normalise(expected));
    });
  }
});

describe('summarizeTtm', () => {
  // The legacy test's own small case.
  const svc = (vn: string, hn: string, o: Partial<TtmServiceRow> = {}): TtmServiceRow => ({ vn, hn, an: '', serviceDate: '2026-11-05', serviceTime: '09:00:00', typeId: '1', typeName: 'ในหน่วยบริการ', doctorName: 'แพทย์แผนไทย ก', treatmentName: 'นวด', patientName: 'นายทดสอบ สมมติ', ...o });
  const item = (o: Partial<TtmItem>): TtmItem => ({ vn: 'v1', icode: 'X', income: '99', incomeName: '', itemName: '', isDrug: false, qty: 1, amount: 0, ...o });
  const summary = summarizeTtm(
    [svc('v1', 'h1'), svc('v1', 'h1', { treatmentName: 'ประคบ' }), svc('v2', 'h2', { typeName: 'ผู้ป่วยใน', serviceTime: '17:10:00' }), svc('v3', 'h3', { serviceDate: '2026-11-06', doctorName: 'แพทย์แผนไทย ข' })],
    [{ vn: 'v1', an: '', pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC' }, { vn: 'v2', an: '690000001', pttype: '89', pttypeName: 'UC', hipdata: 'UCS' }, { vn: 'v3', an: '', pttype: '89', pttypeName: 'UC', hipdata: 'UCS' }],
    [item({ icode: 'M1', itemName: 'นวดไทย', amount: 250 }), item({ icode: 'H1', itemName: 'ยาสมุนไพร ก', isDrug: true, amount: 120.5 }), item({ icode: 'F1', itemName: 'ค่าบริการผู้ป่วยนอก', amount: 50 }),
      item({ icode: 'L1', itemName: 'CBC', amount: 90 }), item({ vn: 'v2', icode: 'H1', itemName: 'ยาสมุนไพร ก', isDrug: true, amount: 100 }), item({ vn: 'v3', icode: 'M1', itemName: 'นวดไทย', amount: 250 }),
      item({ vn: 'v3', icode: 'F1', itemName: 'ค่าบริการผู้ป่วยนอก', amount: 50 }), item({ vn: 'zz', icode: 'M1', itemName: 'นวดไทย', amount: 999 })],
    ttmRules()
  );

  it('counts people, money, IPD and after-hours like the daily report', () => {
    expect(summary.serviceRows).toBe(4);
    expect(summary.visits).toBe(3);
    expect(summary.all).toEqual({ patients: 3, massage: 2, herb: 2, massageAmount: 500, herbAmount: 220.5, total: 720.5 });
    expect(summary.ipd).toEqual({ patients: 1, massage: 0, herb: 1, massageAmount: 0, herbAmount: 100, total: 100 });
    expect(summary.afterHours).toEqual(summary.ipd);
    expect(summary.groups.map((g) => g.key)).toEqual(['ofc', 'lgo', 'uc', 'cash', 'sss', 'receipt', 'other']);
    expect(summary.groups[0]).toMatchObject({ patients: 1, massage: 250, herb: 120.5, total: 370.5 });
    expect(summary.totals).toEqual({ massage: 500, herb: 220.5, opdFee: 100, grand: 820.5 });
    expect(summary.byType[0]).toEqual({ name: 'ในหน่วยบริการ', count: 3, patients: 2, id: '1' });
    expect(summary.itemStats.find((i) => i.icode === 'M1')?.amount).toBe(500);
    expect(summary.itemStats.find((i) => i.icode === 'L1')?.category).toBeNull();
    expect(summary.visitList.find((v) => v.vn === 'v1')).toMatchObject({ rightName: 'สิทธิข้าราชการ', total: 420.5, treatments: 'นวด, ประคบ', ipd: false });
    expect(summary.matrix.uc.herb).toEqual({ patients: 1, amount: 100 });
    expect(summary.periods.fy).toEqual([expect.objectContaining({ key: '2570', patients: 3, total: 820.5 })]);
  });

  it('orders tallies by count, then by name', () => {
    const tied = summarizeTtm([svc('a', 'h1', { typeName: 'ข' }), svc('b', 'h2', { typeName: 'ก' })], [], [], ttmRules());
    expect(tied.byType.map((row) => row.name)).toEqual(['ก', 'ข']);
  });

  it('puts a visit without สิทธิ in สิทธิอื่น ๆ and handles no rows', () => {
    expect(summarizeTtm([svc('v9', 'h9')], [], [], ttmRules()).visitList[0]?.right).toBe('other');
    expect(summarizeTtm([], [], [], ttmRules()).visitList).toEqual([]);
  });
});
