import type { OfcRepLine, OfcStmLine } from './ofc-report';

/** One HOSxP line of Monitor Instrument OFC: an instrument (ADP 8610) on an OFC outpatient visit, summed by vn and icode. */
export type OfcRow = { vstdate: string; vn: string; hn: string; name: string; icode: string; itemName: string; qty: number; sumPrice: number; pttype: string; pttypeName: string };

/** none ยังไม่มี REP · denied REP ไม่จ่าย · rep REP จ่ายแล้ว รอ Statement · paid Statement จ่ายค่าอวัยวะฯ แล้ว. */
export type OfcStatus = 'none' | 'denied' | 'rep' | 'paid';
export type OfcVisit = {
  vn: string; date: string; hn: string; name: string; pttypeName: string; items: { icode: string; name: string; qty: number; claim: number }[];
  qty: number; claim: number; repPaid: number | null; stmPaid: number | null; repNos: string[]; errors: string[]; status: OfcStatus;
  /** Statement งวด (เลขที่เอกสาร without the hcode, e.g. OP202609_02); ส่วนต่าง = paid − claim once paid or denied, else null. */
  periods: string[]; diff: number | null
};
export type OfcPerson = { hn: string; name: string; pttypeName: string; visits: number; qty: number; claim: number; repPaid: number; stmPaid: number; last: string; vns: string[] };
export type OfcItem = { icode: string; name: string; people: number; visits: number; qty: number; claim: number };
export type OfcSummary = {
  totals: { people: number; visits: number; qty: number; claim: number; repPaid: number; stmPaid: number; noRep: number; denied: number; waitStm: number; repOutside: number };
  visits: OfcVisit[]; persons: OfcPerson[]; items: OfcItem[];
};

/** The ADP code a REP line must carry to count (same as the HOSxP filter). */
const ADP = '8610';
/** The Statement งวด from its เลขที่เอกสาร: `11093_OP202609_02` → `OP202609_02`. */
const stmPeriod = (docNo: string) => docNo.trim().replace(/^\d+_/, '');
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Visits newest first, each with its REP and Statement result matched by vn (= SEQ NO); persons newest first; items by claim. */
export function summarizeOfc(rows: readonly OfcRow[], reps: readonly OfcRepLine[], stms: readonly OfcStmLine[]): OfcSummary {
  const byVn = new Map<string, OfcVisit>();
  for (const row of rows) {
    let visit = byVn.get(row.vn);
    if (!visit) {
      visit = { vn: row.vn, date: row.vstdate, hn: row.hn, name: row.name, pttypeName: row.pttypeName, items: [], qty: 0, claim: 0, repPaid: null, stmPaid: null, repNos: [], errors: [], status: 'none', periods: [], diff: null };
      byVn.set(row.vn, visit);
    }
    visit.items.push({ icode: row.icode, name: row.itemName, qty: row.qty, claim: row.sumPrice });
    visit.qty = round2(visit.qty + row.qty);
    visit.claim = round2(visit.claim + row.sumPrice);
  }
  const outside = new Set<string>();
  for (const line of reps) {
    if (line.adp !== ADP) continue;
    const visit = byVn.get(line.vn);
    if (!visit) { outside.add(line.vn || `${line.repNo}|${line.tranId}`); continue; }
    visit.repPaid = round2((visit.repPaid ?? 0) + line.paid);
    if (!visit.repNos.includes(line.repNo)) visit.repNos.push(line.repNo);
    if (line.error && !visit.errors.includes(line.error)) visit.errors.push(line.error);
  }
  for (const line of stms) {
    const visit = byVn.get(line.vn);
    if (!visit) continue;
    visit.stmPaid = round2((visit.stmPaid ?? 0) + line.inst);
    const period = stmPeriod(line.docNo);
    if (period && !visit.periods.includes(period)) visit.periods.push(period);
  }
  const visits = [...byVn.values()].sort((a, b) => (a.date === b.date ? a.vn.localeCompare(b.vn) : b.date.localeCompare(a.date)));
  for (const visit of visits) {
    visit.status = (visit.stmPaid ?? 0) > 0 ? 'paid' : visit.repPaid === null ? 'none' : visit.repPaid > 0 ? 'rep' : 'denied';
    visit.diff = visit.status === 'paid' ? round2((visit.stmPaid ?? 0) - visit.claim) : visit.status === 'denied' ? round2((visit.repPaid ?? 0) - visit.claim) : null;
  }
  const persons = new Map<string, OfcPerson>();
  const items = new Map<string, OfcItem & { hns: Set<string> }>();
  for (const visit of visits) {
    const person = persons.get(visit.hn) ?? { hn: visit.hn, name: visit.name, pttypeName: visit.pttypeName, visits: 0, qty: 0, claim: 0, repPaid: 0, stmPaid: 0, last: visit.date, vns: [] };
    person.visits++; person.qty = round2(person.qty + visit.qty); person.claim = round2(person.claim + visit.claim);
    person.repPaid = round2(person.repPaid + (visit.repPaid ?? 0)); person.stmPaid = round2(person.stmPaid + (visit.stmPaid ?? 0)); person.vns.push(visit.vn);
    persons.set(visit.hn, person);
    for (const line of visit.items) {
      const item = items.get(line.icode) ?? { icode: line.icode, name: line.name, people: 0, visits: 0, qty: 0, claim: 0, hns: new Set<string>() };
      item.hns.add(visit.hn); item.visits++; item.qty = round2(item.qty + line.qty); item.claim = round2(item.claim + line.claim);
      items.set(line.icode, item);
    }
  }
  const sum = (pick: (visit: OfcVisit) => number) => round2(visits.reduce((total, visit) => total + pick(visit), 0));
  return {
    totals: {
      people: persons.size, visits: visits.length, qty: sum((v) => v.qty), claim: sum((v) => v.claim), repPaid: sum((v) => v.repPaid ?? 0), stmPaid: sum((v) => v.stmPaid ?? 0),
      noRep: sum((v) => (v.status === 'none' ? v.claim : 0)), denied: visits.filter((v) => v.status === 'denied').length, waitStm: visits.filter((v) => v.status === 'rep').length, repOutside: outside.size
    },
    visits,
    persons: [...persons.values()].sort((a, b) => (a.last === b.last ? a.name.localeCompare(b.name, 'th') : b.last.localeCompare(a.last))),
    items: [...items.values()].map(({ hns, ...item }) => ({ ...item, people: hns.size })).sort((a, b) => b.claim - a.claim || a.icode.localeCompare(b.icode))
  };
}
