import { TTM_RIGHT_GROUPS, type TtmRightGroup } from '@backoffice/contracts';
import type { HerbOntopRate, HerbRules } from './herb-rules';
import { ttmRightGroup } from './ttm-rules';

/**
 * การจ่ายยาสมุนไพร: the legacy `HerbSummary` ported line for line (parity pinned by `fixtures/herb-legacy.json`).
 *   ต้นทุน = qty × unitcost; มูลค่าจริง = qty × stdprice, or the sale price when stdprice is 0/empty;
 *   ontop = UC only, the rate per visit and icode; รับจริง = herbal Data Drug of HERB_FS cases in REP, by VN and icode; รวม = มูลค่าจริง + รับจริง.
 */
export type HerbRow = {
  rxdate: string; vn: string; an: string; hn: string; icode: string; drugName: string; units: string;
  qty: number; sumPrice: number; unitcost: number | null; stdprice: number | null; pttype: string; pttypeName: string; hipdata: string;
};
/** What the summary reads of a stored REP document (no PID, no names). */
export type HerbRepDoc = {
  doc_no: string; report_date: string;
  cases: { tran_id: string; seq: string; sub_fund: string }[];
  drugs: { tran_id: string; icode: string; type: string; paid: number }[];
};
export type HerbTally = { visits: number; patients: number; qty: number; cost: number; value: number; ontop: number; ontopPoints: number; received: number | null; total: number };
export type HerbDrug = HerbTally & { icode: string; name: string; units: string; ontopListed: boolean; ontopRate: HerbOntopRate | null };
export type HerbGroup = HerbTally & { key: TtmRightGroup; name: string; drugs: HerbDrug[] };
export type HerbDay = HerbTally & { date: string };
export type HerbSummary = { totals: HerbTally & { receivedVisits: number }; groups: HerbGroup[]; drugs: HerbDrug[]; days: HerbDay[] };

/** PHP `(float)` of a value that may come as a string. */
const phpFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(value === null || value === undefined ? '' : String(value));
  return match ? Number(match[0]) : 0;
};
/** PHP `round($x, 2)`: pre-rounded to 15 digits, halves away from zero. */
const round2 = (value: number): number => {
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const result = (Math.sign(value) * Math.round(scaled)) / 100;
  return result === 0 ? 0 : result;
};
const PHP_NUMERIC = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;
/** PHP 8 `<=>` on two strings: numerically when both are numeric, otherwise byte order. */
const phpCompare = (a: string, b: string): number => {
  if (PHP_NUMERIC.test(a) && PHP_NUMERIC.test(b)) return Math.sign(Number(a) - Number(b));
  return a < b ? -1 : a > b ? 1 : 0;
};

/** มูลค่าจริงของแถว: qty × stdprice; stdprice 0/empty → the sale price (`sum_price`). */
export function herbValue(row: Pick<HerbRow, 'qty' | 'stdprice' | 'sumPrice'>): number {
  const std = phpFloat(row.stdprice);
  return std > 0 ? phpFloat(row.qty) * std : phpFloat(row.sumPrice);
}

/** The REP case's กองทุนย่อย (comma-separated) include HERB_FS. */
export const isHerbFund = (subFund: string): boolean => subFund.toUpperCase().split(',').map((part) => part.trim()).includes('HERB_FS');

/**
 * รับจริงรายยาต่อ VN from the REP documents: HERB_FS cases only, herbal drugs only (ชนิดยา H…); Data Drug is tied to TRAN_ID and the
 * Detail sheet gives its SEQ NO (= VN). A TRAN_ID in several files takes the latest report. Returns "vn|icode" → รวมชดเชย.
 */
export function herbReceivedFromRep(repDocs: readonly HerbRepDoc[]): Map<string, number> {
  const sorted = [...repDocs].sort((a, b) => phpCompare(String(a.report_date ?? ''), String(b.report_date ?? '')) || phpCompare(String(a.doc_no ?? ''), String(b.doc_no ?? '')));
  const byTran = new Map<string, [string, number][]>();
  for (const doc of sorted) {
    const seq = new Map<string, string>();
    for (const item of doc.cases ?? []) if (isHerbFund(String(item.sub_fund ?? ''))) seq.set(String(item.tran_id ?? ''), String(item.seq ?? '').trim());
    const items = new Map<string, [string, number][]>();
    for (const drug of doc.drugs ?? []) {
      const tran = String(drug.tran_id ?? '');
      const vn = seq.get(tran) ?? '';
      const icode = String(drug.icode ?? '').trim();
      if (vn === '' || icode === '' || String(drug.type ?? '').trim().slice(0, 1).toUpperCase() !== 'H') continue;
      const list = items.get(tran) ?? [];
      list.push([`${vn}|${icode}`, phpFloat(drug.paid)]);
      items.set(tran, list);
    }
    for (const [tran, list] of items) byTran.set(tran, list); // a later report replaces
  }
  const out = new Map<string, number>();
  for (const list of byTran.values()) for (const [key, paid] of list) out.set(key, round2((out.get(key) ?? 0) + paid));
  return out;
}

type Bucket = { visits: Set<string>; patients: Set<string>; qty: number; cost: number; value: number; ontop: number; ontopPoints: number; received: number };
type Measure = Pick<Bucket, 'qty' | 'cost' | 'value' | 'ontop' | 'ontopPoints' | 'received'>;
type DrugInfo = { icode: string; name: string; units: string; ontopListed: boolean; ontopRate: HerbOntopRate | null };
const blank = (): Bucket => ({ visits: new Set(), patients: new Set(), qty: 0, cost: 0, value: 0, ontop: 0, ontopPoints: 0, received: 0 });
const add = (bucket: Bucket, m: Measure, visit: string, hn: string) => {
  bucket.visits.add(visit);
  if (hn !== '') bucket.patients.add(hn);
  bucket.qty += m.qty; bucket.cost += m.cost; bucket.value += m.value; bucket.ontop += m.ontop; bucket.ontopPoints += m.ontopPoints; bucket.received += m.received;
};
const finish = (bucket: Bucket, hasRep: boolean): HerbTally => {
  const value = round2(bucket.value);
  const received = round2(bucket.received);
  return {
    visits: bucket.visits.size, patients: bucket.patients.size, qty: round2(bucket.qty), cost: round2(bucket.cost), value, ontop: round2(bucket.ontop),
    ontopPoints: round2(bucket.ontopPoints), received: hasRep ? received : null, total: round2(value + received)
  };
};
const drugInfo = (row: HerbRow, icode: string, ontop: Record<string, HerbOntopRate>): DrugInfo => {
  const name = row.drugName.trim();
  const rate = Object.hasOwn(ontop, icode) ? ontop[icode]! : null;
  return { icode, name: name === '' || name === '0' ? icode : name, units: row.units, ontopListed: rate !== null, ontopRate: rate };
};
/** Value, then qty, high to low; then icode. */
const finishList = (list: Map<string, { bucket: Bucket; info: DrugInfo }>, hasRep: boolean): HerbDrug[] =>
  [...list.values()].map(({ bucket, info }) => ({ ...finish(bucket, hasRep), ...info }))
    .sort((a, b) => Math.sign(b.value - a.value) || Math.sign(b.qty - a.qty) || phpCompare(a.icode, b.icode));

/** @param received "vn|icode" → รับจริง from `herbReceivedFromRep`; null = no REP yet (รับจริง shows รอ REP and รวม = มูลค่าจริง). */
export function summarizeHerb(rows: readonly HerbRow[], rules: HerbRules, received: ReadonlyMap<string, number> | null): HerbSummary {
  const herb = new Set(rules.herbIcodes);
  const ontop = rules.ontopRates;
  const hasRep = received !== null;
  const paid = new Set<string>();
  const shared = new Set<string>();
  const found = new Set<string>();
  const all = blank();
  const groups = new Map((Object.keys(TTM_RIGHT_GROUPS) as TtmRightGroup[]).map((key) => [key, { bucket: blank(), drugs: new Map<string, { bucket: Bucket; info: DrugInfo }>() }]));
  const drugs = new Map<string, { bucket: Bucket; info: DrugInfo }>();
  const days = new Map<string, Bucket>();

  for (const row of rows) {
    const icode = row.icode;
    if (!herb.has(icode)) continue;
    const qty = phpFloat(row.qty);
    const m: Measure = { qty, cost: qty * phpFloat(row.unitcost), value: herbValue(row), ontop: 0, ontopPoints: 0, received: 0 };
    const an = row.an.trim();
    const visit = an !== '' ? `AN${an}` : `VN${row.vn}`;
    const group = ttmRightGroup(row.pttype, row.pttypeName, row.hipdata, { rightMap: rules.rightMap });
    // ontop is paid for บัตรทอง (UC) only, once per visit and drug.
    if (group === 'uc' && Object.hasOwn(ontop, icode) && !paid.has(`${visit}|${icode}`)) {
      paid.add(`${visit}|${icode}`);
      const rate = ontop[icode]!;
      m.ontop = phpFloat(rate.baht);
      m.ontopPoints = phpFloat(rate.points);
      if (rules.pointBaht !== null) m.ontop += m.ontopPoints * rules.pointBaht;
    }
    const key = `${row.vn}|${icode}`;
    if (an === '' && received?.has(key) && !shared.has(key)) {
      shared.add(key); // the same row on several days counts once
      m.received = received.get(key)!;
      found.add(visit);
    }
    const hn = row.hn;
    add(all, m, visit, hn);
    const g = groups.get(group)!;
    add(g.bucket, m, visit, hn);
    for (const list of [g.drugs, drugs]) {
      if (!list.has(icode)) list.set(icode, { bucket: blank(), info: drugInfo(row, icode, ontop) });
      add(list.get(icode)!.bucket, m, visit, hn);
    }
    const date = row.rxdate.slice(0, 10);
    if (!days.has(date)) days.set(date, blank());
    add(days.get(date)!, m, visit, hn);
  }

  return {
    totals: { ...finish(all, hasRep), receivedVisits: found.size },
    groups: [...groups].map(([key, g]) => ({ ...finish(g.bucket, hasRep), key, name: TTM_RIGHT_GROUPS[key], drugs: finishList(g.drugs, hasRep) })),
    drugs: finishList(drugs, hasRep),
    days: [...days].sort(([a], [b]) => phpCompare(a, b)).map(([date, bucket]) => ({ ...finish(bucket, hasRep), date }))
  };
}
