/**
 * Monitor IMC: what the page shows, built from the decrypted register lines and REP lines. A person is one HN; the HN itself is
 * not passed on (persons carry a running `id`). REP lines join the register by HN, and "ยังไม่มี REP" is the claim of register
 * lines with no REP line for the same HN and date.
 */
import type { ImcLine, ImcRepLine } from './imc-report';

export type ImcPerson = {
  id: number; name: string; disease: string; right: string; onset: string; discharge: string; due: string; status: string;
  visits: number; claim: number; paid: number; repNos: string[]; lastVisit: string;
};
export type ImcOverview = {
  persons: ImcPerson[];
  /** One entry per register line, for the chart, the date range and a person's claim lines: `person` is `ImcPerson.id`,
   * `repNo` the REP numbers of the same HN and date ('' when none), `pending` when the claim is not ผ่าน yet. */
  lines: { person: number; date: string; code: string; claim: number; pending: boolean; repNo: string }[];
  /** One entry per REP line; `person` is null for a HN outside the register. */
  reps: { person: number | null; date: string; repNo: string; paid: number }[];
  services: { code: string; name: string }[];
  totals: { people: number; visits: number; claim: number; pending: number; paid: number; noRep: number; repOutside: number; diseases: [string, number][] };
};

const round2 = (value: number) => Math.round(value * 100) / 100;
/** One IMC visit is one ให้บริการ IMC ที่บ้าน line (H9340); other lines on the same day (กายภาพบำบัด …) are services within it. */
export const IMC_VISIT_CODE = 'H9340';
const isVisit = (item: { code: string }) => item.code === IMC_VISIT_CODE;
const later = (a: ImcLine, b: ImcLine) => a.date > b.date || (a.date === b.date && a.visitNo > b.visitNo);

export function buildImcOverview(lines: readonly ImcLine[], reps: readonly ImcRepLine[]): ImcOverview {
  const byHn = new Map<string, ImcLine[]>();
  for (const item of lines) byHn.set(item.hn, [...(byHn.get(item.hn) ?? []), item]);
  const repsByHn = new Map<string, ImcRepLine[]>();
  for (const item of reps) repsByHn.set(item.hn, [...(repsByHn.get(item.hn) ?? []), item]);

  const people = [...byHn.values()].map((own) => {
    const latest = own.reduce((best, item) => (later(item, best) ? item : best));
    const paidLines = repsByHn.get(latest.hn) ?? [];
    return {
      latest, lines: own,
      claim: round2(own.reduce((sum, item) => sum + item.claim, 0)), paid: round2(paidLines.reduce((sum, item) => sum + item.paid, 0)),
      repNos: [...new Set(paidLines.map((item) => item.repNo))].sort(), lastVisit: latest.date
    };
  }).sort((a, b) => (a.latest.due || '9999').localeCompare(b.latest.due || '9999') || a.latest.name.localeCompare(b.latest.name, 'th'));

  const repDays = new Map<string, Set<string>>();
  for (const item of reps) repDays.set(`${item.hn}|${item.date}`, (repDays.get(`${item.hn}|${item.date}`) ?? new Set()).add(item.repNo));
  const idOf = new Map(people.map((person, index) => [person.latest.hn, index + 1]));
  const pending = (item: ImcLine) => item.claimStatus !== '' && item.claimStatus !== 'ผ่าน';
  const diseases = new Map<string, number>();
  for (const person of people) diseases.set(person.latest.disease || 'ไม่ระบุ', (diseases.get(person.latest.disease || 'ไม่ระบุ') ?? 0) + 1);
  const services = new Map<string, string>();
  for (const item of lines) if (!services.has(item.code)) services.set(item.code, item.service || item.code);

  return {
    persons: people.map((person, index) => ({
      id: index + 1, name: person.latest.name, disease: person.latest.disease, right: person.latest.right, onset: person.latest.onset, discharge: person.latest.discharge,
      due: person.latest.due, status: person.latest.status, visits: person.lines.filter(isVisit).length, claim: person.claim, paid: person.paid, repNos: person.repNos, lastVisit: person.lastVisit
    })),
    lines: [...lines].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)).map((item) => ({
      person: idOf.get(item.hn)!, date: item.date, code: item.code, claim: item.claim, pending: pending(item),
      repNo: [...(repDays.get(`${item.hn}|${item.date}`) ?? [])].sort().join(', ')
    })),
    reps: reps.map((item) => ({ person: idOf.get(item.hn) ?? null, date: item.date, repNo: item.repNo, paid: item.paid }))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.person ?? Infinity) - (b.person ?? Infinity) || a.repNo.localeCompare(b.repNo)),
    services: [...services].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({ code, name })),
    totals: {
      people: people.length, visits: lines.filter(isVisit).length, claim: round2(lines.reduce((sum, item) => sum + item.claim, 0)),
      pending: lines.filter(pending).length,
      paid: round2(reps.reduce((sum, item) => sum + item.paid, 0)),
      noRep: round2(lines.filter((item) => !repDays.has(`${item.hn}|${item.date}`)).reduce((sum, item) => sum + item.claim, 0)),
      repOutside: reps.filter((item) => !byHn.has(item.hn)).length,
      diseases: [...diseases].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }
  };
}
