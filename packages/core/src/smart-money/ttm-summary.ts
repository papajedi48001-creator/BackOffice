import { classifyTtmItem, isTtmAfterHours, isTtmIpd, ttmFiscalYear, ttmKind, ttmRightGroup, TTM_KINDS, TTM_RIGHT_GROUPS, type TtmCategory, type TtmItem, type TtmKind, type TtmRightGroup, type TtmRules } from './ttm-rules';

/** One `health_med_service` row (the กลุ่มงาน query). `vn` may be '' (keyed by HN and date then). */
export type TtmServiceRow = { vn: string; hn: string; an: string; serviceDate: string; serviceTime: string; typeId: string; typeName: string; doctorName: string; treatmentName: string; patientName: string };
/** สิทธิ and AN of a visit (`ovst` + `pttype`). */
export type TtmVisit = { vn: string; an: string; pttype: string; pttypeName: string; hipdata: string };

export type TtmKindCell = { patients: number; amount: number };
export type TtmKindCells = Record<TtmKind, TtmKindCell>;
/** A top row of the report (ทั้งหมด, IPD, นอกเวลา): people, people with massage / herb money, and that money. */
export type TtmPeopleRow = { patients: number; massage: number; herb: number; massageAmount: number; herbAmount: number; total: number };
export type TtmGroupRow = { key: TtmRightGroup; name: string; patients: number; massage: number; herb: number; opdFee: number; total: number };
export type TtmDailyRow = { date: string; patients: number; massage: number; herb: number; opdFee: number };
export type TtmTallyRow = { name: string; count: number; patients: number; id?: string };
export type TtmRightRow = { pttype: string; name: string; hipdata: string; group: TtmRightGroup; patients: number };
export type TtmItemStat = { icode: string; name: string; income: string; incomeName: string; isDrug: boolean; category: TtmCategory | null; kind: TtmKind | null; visits: number; qty: number; amount: number };
export type TtmIncomeStat = { income: string; name: string; amount: number; byCategory: Record<TtmCategory | 'none', number> };
export type TtmVisitRow = {
  vn: string; hn: string; date: string; time: string; patientName: string; pttype: string; pttypeName: string; right: TtmRightGroup; rightName: string;
  ipd: boolean; afterHours: boolean; services: string; doctors: string; treatments: string; massage: number; herb: number; opdFee: number; kinds: Record<TtmKind, number>; total: number;
};
export type TtmPeriodRow = { key: string; patients: number; visits: number; total: number; kinds: TtmKindCells };
export type TtmPeriodType = 'day' | 'month' | 'fy';
export type TtmSummary = {
  serviceRows: number; visits: number; all: TtmPeopleRow; ipd: TtmPeopleRow; afterHours: TtmPeopleRow; groups: TtmGroupRow[];
  totals: { massage: number; herb: number; opdFee: number; grand: number }; daily: TtmDailyRow[];
  byType: TtmTallyRow[]; byDoctor: TtmTallyRow[]; byTreatment: TtmTallyRow[]; rights: TtmRightRow[]; itemStats: TtmItemStat[]; incomeStats: TtmIncomeStat[];
  visitList: TtmVisitRow[]; kinds: TtmKindCells; matrix: Record<TtmRightGroup, TtmKindCells>; periods: Record<TtmPeriodType, TtmPeriodRow[]>;
};

type Money = { massage: number; herb: number; opd_fee: number };
type PeopleBucket = { patients: Set<string>; massagePatients: Set<string>; herbPatients: Set<string>; massageAmount: number; herbAmount: number };
type KindBucket = Record<TtmKind, { patients: Set<string>; amount: number }>;
type Tally = { name: string; count: number; patients: Set<string>; id?: string };

const KIND_KEYS = Object.keys(TTM_KINDS) as TtmKind[];
const GROUP_KEYS = Object.keys(TTM_RIGHT_GROUPS) as TtmRightGroup[];
const blankMoney = (): Money => ({ massage: 0, herb: 0, opd_fee: 0 });
const blankKinds = (): KindBucket => Object.fromEntries(KIND_KEYS.map((key) => [key, { patients: new Set<string>(), amount: 0 }])) as KindBucket;
const countKinds = (kinds: KindBucket): TtmKindCells => Object.fromEntries(KIND_KEYS.map((key) => [key, { patients: kinds[key].patients.size, amount: kinds[key].amount }])) as TtmKindCells;
const blankPeople = (): PeopleBucket => ({ patients: new Set(), massagePatients: new Set(), herbPatients: new Set(), massageAmount: 0, herbAmount: 0 });
const markPatient = (bucket: PeopleBucket, hn: string, money: Money) => {
  bucket.patients.add(hn);
  bucket.massageAmount += money.massage;
  bucket.herbAmount += money.herb;
  if (money.massage > 0) bucket.massagePatients.add(hn);
  if (money.herb > 0) bucket.herbPatients.add(hn);
};
const people = (bucket: PeopleBucket): TtmPeopleRow => ({ patients: bucket.patients.size, massage: bucket.massagePatients.size, herb: bucket.herbPatients.size, massageAmount: bucket.massageAmount, herbAmount: bucket.herbAmount, total: bucket.massageAmount + bucket.herbAmount });
const tally = (list: Map<string, Tally>, key: string, hn: string): Tally => {
  const entry = list.get(key) ?? { name: key, count: 0, patients: new Set<string>() };
  entry.count += 1;
  entry.patients.add(hn);
  list.set(key, entry);
  return entry;
};
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sortByCount = (list: Map<string, Tally>): TtmTallyRow[] => [...list.values()]
  .map(({ patients, ...rest }) => ({ ...rest, patients: patients.size }))
  .sort((a, b) => b.count - a.count || byKey(a.name, b.name));

type VisitAcc = {
  vn: string; hn: string; date: string; time: string; patientName: string; pttype: string; pttypeName: string; hipdata: string; right: TtmRightGroup;
  ipd: boolean; afterHours: boolean; services: Set<string>; doctors: Set<string>; treatments: Set<string>; money: Money; kinds: Record<TtmKind, number>;
};

/**
 * The daily-report numbers, a port of the legacy `TtmSummary::summarize`: service rows grouped by visit, each counted charge line added
 * to its visit's หมวด and รายบริการ, people by distinct HN. Group totals leave out the OPD fee; a person counts in a รายบริการ when that
 * money is above 0. Lines of a visit with no service row are left out.
 */
export function summarizeTtm(services: readonly TtmServiceRow[], visits: readonly TtmVisit[], items: readonly TtmItem[], rules: TtmRules): TtmSummary {
  const visitInfo = new Map(visits.map((visit) => [visit.vn, visit]));

  const byVn = new Map<string, VisitAcc>();
  const byType = new Map<string, Tally>();
  const byDoctor = new Map<string, Tally>();
  const byTreatment = new Map<string, Tally>();
  for (const service of services) {
    const hn = service.hn;
    const vn = service.vn === '' ? `hn:${hn}:${service.serviceDate}` : service.vn;
    const info = visitInfo.get(vn) ?? { vn, an: '', pttype: '', pttypeName: '', hipdata: '' };
    let row = byVn.get(vn);
    if (!row) {
      row = {
        vn, hn, date: service.serviceDate, time: service.serviceTime, patientName: service.patientName,
        pttype: info.pttype, pttypeName: info.pttypeName, hipdata: info.hipdata, right: ttmRightGroup(info.pttype, info.pttypeName, info.hipdata, rules),
        ipd: false, afterHours: false, services: new Set(), doctors: new Set(), treatments: new Set(), money: blankMoney(),
        kinds: Object.fromEntries(KIND_KEYS.map((key) => [key, 0])) as Record<TtmKind, number>
      };
      byVn.set(vn, row);
    }
    if (isTtmIpd(service, info.an)) row.ipd = true;
    if (isTtmAfterHours(service, rules)) row.afterHours = true;
    const type = service.typeName.trim() || '(ไม่ระบุประเภท)';
    const doctor = service.doctorName.trim() || '(ไม่ระบุผู้ให้บริการ)';
    const treatment = service.treatmentName.trim();
    row.services.add(type);
    row.doctors.add(doctor);
    if (treatment !== '') row.treatments.add(treatment);
    tally(byType, type, hn).id = service.typeId;
    tally(byDoctor, doctor, hn);
    tally(byTreatment, treatment !== '' ? treatment : '(ไม่ระบุ)', hn);
  }

  const itemStats = new Map<string, TtmItemStat>();
  const incomeStats = new Map<string, TtmIncomeStat>();
  for (const item of items) {
    const row = byVn.get(item.vn);
    if (!row) continue;
    const amount = Number(item.amount);
    const category = classifyTtmItem(item, rules);
    const kind = ttmKind(item, category, rules);
    if (category !== null && kind !== null) {
      row.money[category] += amount;
      row.kinds[kind] += amount;
    }
    const stat = itemStats.get(item.icode) ?? { icode: item.icode, name: item.itemName, income: item.income, incomeName: item.incomeName, isDrug: item.isDrug, category, kind, visits: 0, qty: 0, amount: 0 };
    stat.visits += 1;
    stat.qty += Number(item.qty);
    stat.amount += amount;
    itemStats.set(item.icode, stat);
    const income = incomeStats.get(item.income) ?? { income: item.income, name: item.incomeName, amount: 0, byCategory: { massage: 0, herb: 0, opd_fee: 0, none: 0 } };
    income.amount += amount;
    income.byCategory[category ?? 'none'] += amount;
    incomeStats.set(item.income, income);
  }

  const groups = new Map(GROUP_KEYS.map((key) => [key, { patients: new Set<string>(), money: blankMoney() }]));
  const all = blankPeople();
  const ipd = blankPeople();
  const after = blankPeople();
  const daily = new Map<string, { patients: Set<string>; money: Money }>();
  const rights = new Map<string, { pttype: string; name: string; hipdata: string; group: TtmRightGroup; patients: Set<string> }>();
  const matrix = Object.fromEntries(GROUP_KEYS.map((key) => [key, blankKinds()])) as Record<TtmRightGroup, KindBucket>;
  const kindAll = blankKinds();
  const periods: Record<TtmPeriodType, Map<string, { patients: Set<string>; visits: number; total: number; kinds: KindBucket }>> = { day: new Map(), month: new Map(), fy: new Map() };
  for (const row of byVn.values()) {
    const { hn, money } = row;
    const group = groups.get(row.right)!;
    group.patients.add(hn);
    for (const key of ['massage', 'herb', 'opd_fee'] as const) group.money[key] += money[key];
    markPatient(all, hn, money);
    if (row.ipd) markPatient(ipd, hn, money);
    if (row.afterHours) markPatient(after, hn, money);

    const day = daily.get(row.date) ?? { patients: new Set<string>(), money: blankMoney() };
    day.patients.add(hn);
    for (const key of ['massage', 'herb', 'opd_fee'] as const) day.money[key] += money[key];
    daily.set(row.date, day);

    for (const kind of KIND_KEYS) {
      const value = row.kinds[kind];
      if (value > 0) {
        matrix[row.right][kind].patients.add(hn); matrix[row.right][kind].amount += value;
        kindAll[kind].patients.add(hn); kindAll[kind].amount += value;
      }
    }
    const keys: Record<TtmPeriodType, string> = { day: row.date, month: row.date.slice(0, 7), fy: String(ttmFiscalYear(row.date)) };
    for (const type of ['day', 'month', 'fy'] as const) {
      const period = periods[type].get(keys[type]) ?? { patients: new Set<string>(), visits: 0, total: 0, kinds: blankKinds() };
      period.patients.add(hn);
      period.visits += 1;
      for (const kind of KIND_KEYS) {
        const value = row.kinds[kind];
        if (value > 0) { period.kinds[kind].patients.add(hn); period.kinds[kind].amount += value; period.total += value; }
      }
      periods[type].set(keys[type], period);
    }

    const right = rights.get(row.pttype) ?? { pttype: row.pttype, name: row.pttypeName, hipdata: row.hipdata, group: row.right, patients: new Set<string>() };
    right.patients.add(hn);
    rights.set(row.pttype, right);
  }

  const groupRows: TtmGroupRow[] = GROUP_KEYS.map((key) => {
    const { patients, money } = groups.get(key)!;
    return { key, name: TTM_RIGHT_GROUPS[key], patients: patients.size, massage: money.massage, herb: money.herb, opdFee: money.opd_fee, total: money.massage + money.herb };
  });
  const totals = { massage: 0, herb: 0, opdFee: 0 };
  for (const group of groupRows) { totals.massage += group.massage; totals.herb += group.herb; totals.opdFee += group.opdFee; }
  const sorted = <T>(map: Map<string, T>) => [...map.entries()].sort(([a], [b]) => byKey(a, b));

  return {
    serviceRows: services.length,
    visits: byVn.size,
    all: people(all), ipd: people(ipd), afterHours: people(after),
    groups: groupRows,
    totals: { ...totals, grand: totals.massage + totals.herb + totals.opdFee },
    daily: sorted(daily).map(([date, { patients, money }]) => ({ date, patients: patients.size, massage: money.massage, herb: money.herb, opdFee: money.opd_fee })),
    byType: sortByCount(byType), byDoctor: sortByCount(byDoctor), byTreatment: sortByCount(byTreatment),
    rights: [...rights.values()].map(({ patients, ...rest }) => ({ ...rest, patients: patients.size })).sort((a, b) => b.patients - a.patients),
    itemStats: [...itemStats.values()].sort((a, b) => b.amount - a.amount),
    incomeStats: [...incomeStats.values()].sort((a, b) => b.amount - a.amount),
    visitList: [...byVn.values()].map((row) => ({
      vn: row.vn, hn: row.hn, date: row.date, time: row.time, patientName: row.patientName, pttype: row.pttype, pttypeName: row.pttypeName, right: row.right,
      rightName: TTM_RIGHT_GROUPS[row.right], ipd: row.ipd, afterHours: row.afterHours, services: [...row.services].join(', '), doctors: [...row.doctors].join(', '),
      treatments: [...row.treatments].join(', '), massage: row.money.massage, herb: row.money.herb, opdFee: row.money.opd_fee, kinds: row.kinds,
      total: row.money.massage + row.money.herb + row.money.opd_fee
    })),
    kinds: countKinds(kindAll),
    matrix: Object.fromEntries(GROUP_KEYS.map((key) => [key, countKinds(matrix[key])])) as Record<TtmRightGroup, TtmKindCells>,
    periods: Object.fromEntries((['day', 'month', 'fy'] as const).map((type) => [type, sorted(periods[type]).map(([key, period]) => ({ key, patients: period.patients.size, visits: period.visits, total: period.total, kinds: countKinds(period.kinds) }))])) as Record<TtmPeriodType, TtmPeriodRow[]>
  };
}
