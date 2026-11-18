import { NO_PACCOUNT, type DentalGroup, type DentalPeriod } from '@backoffice/contracts';
import { isExcludedFromForecast, isUcInCup } from './dental-rules';

/**
 * One HOSxP row: a visit with dental work (`dtmain`) and its main diagnosis ('' when it has none). Money columns belong to the
 * visit (`vn_stat`); ลูกหนี้ (`claimAmount`) is ค่ารักษารวม − ชำระแล้ว, never below 0. `isDenture` = งานฟันปลอม.
 */
export type DentalRow = { vn: string; vstdate: string; hn: string; patientName: string; diagCode: string; diagName: string; doctorName: string; helperName: string; isDenture: boolean; pttypeCode: string; pttypeName: string; paccountName: string | null; totalAmount: number; paidMoney: number; claimAmount: number };

type Money = { visits: number; patients: number; total: number; paid: number; claim: number };
export type DentalPeriodRow = { key: string } & Money;
/** `red`: the bar is drawn red (by ผังบัญชี: UC ใน CUP or PP; by สิทธิ: any visit on a UC ใน CUP ผังบัญชี). */
export type DentalGroupRow = { code: string; name: string } & Money & { red: boolean; dentureClaim: number; dentureVisits: number; denturePatients: number };
export type DentalDiagRow = { code: string; name: string; count: number };
export type DentalSummary = { rows: number; visits: number; patients: number; total: number; paid: number; claim: number; forecast: number; byPeriod: DentalPeriodRow[]; byGroup: DentalGroupRow[]; byDiag: DentalDiagRow[] };

export { NO_PACCOUNT };

type Bucket = { visits: number; hns: Set<string>; total: number; paid: number; claim: number };
const bucket = (): Bucket => ({ visits: 0, hns: new Set(), total: 0, paid: 0, claim: 0 });
const add = (target: Bucket, row: DentalRow) => {
  target.visits += 1; target.hns.add(row.hn);
  target.total += Number(row.totalAmount); target.paid += Number(row.paidMoney); target.claim += Number(row.claimAmount);
};
const money = ({ hns, ...rest }: Bucket): Money => ({ ...rest, patients: hns.size });

/**
 * The dashboard numbers, a port of the legacy `DentalClaimsRepository::summarize`: money, forecast, red and งานฟันปลอม once per visit (first row of each VN),
 * diagnoses on every row, patients by distinct HN. Groups by total (largest first), diagnoses by count, periods by date.
 */
export function summarizeDental(rows: DentalRow[], group: DentalGroup, period: DentalPeriod): DentalSummary {
  const visits = new Set<string>();
  const patients = new Set<string>();
  const byPeriod = new Map<string, Bucket>();
  type GroupEntry = { code: string; name: string; bucket: Bucket; red: boolean; dentureClaim: number; dentureVisits: number; dentureHns: Set<string> };
  const byGroup = new Map<string, GroupEntry>();
  let forecast = 0;
  const byDiag = new Map<string, DentalDiagRow>();

  for (const row of rows) {
    patients.add(row.hn);
    const diag = byDiag.get(row.diagCode) ?? { code: row.diagCode, name: row.diagName, count: 0 };
    diag.count += 1;
    byDiag.set(row.diagCode, diag);

    if (visits.has(row.vn)) continue;
    visits.add(row.vn);

    const periodKey = period === 'month' ? row.vstdate.slice(0, 7) : row.vstdate;
    const periodBucket = byPeriod.get(periodKey) ?? bucket();
    add(periodBucket, row);
    byPeriod.set(periodKey, periodBucket);

    const paccountRaw = row.paccountName ?? '';
    if (!isExcludedFromForecast(paccountRaw)) forecast += Number(row.claimAmount);

    const paccount = paccountRaw.trim();
    const [key, code, name] = group === 'paccount' ? [paccount || NO_PACCOUNT, '', paccount || NO_PACCOUNT] : [row.pttypeCode, row.pttypeCode, row.pttypeName];
    const groupEntry = byGroup.get(key) ?? { code, name, bucket: bucket(), red: false, dentureClaim: 0, dentureVisits: 0, dentureHns: new Set<string>() };
    add(groupEntry.bucket, row);
    if (row.isDenture) { groupEntry.dentureClaim += Number(row.claimAmount); groupEntry.dentureVisits += 1; groupEntry.dentureHns.add(row.hn); }
    if (group === 'paccount' ? isExcludedFromForecast(paccountRaw) : isUcInCup(paccountRaw)) groupEntry.red = true;
    byGroup.set(key, groupEntry);
  }

  const periods = [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => ({ key, ...money(value) }));
  const groups = [...byGroup.values()]
    .map(({ code, name, bucket: value, red, dentureClaim, dentureVisits, dentureHns }) => ({ code, name, ...money(value), red, dentureClaim, dentureVisits, denturePatients: dentureHns.size }))
    .sort((a, b) => b.total - a.total);
  const diags = [...byDiag.values()].sort((a, b) => b.count - a.count);
  const sum = (field: 'total' | 'paid' | 'claim') => periods.reduce((total, row) => total + row[field], 0);
  return { rows: rows.length, visits: visits.size, patients: patients.size, total: sum('total'), paid: sum('paid'), claim: sum('claim'), forecast, byPeriod: periods, byGroup: groups, byDiag: diags };
}
