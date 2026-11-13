import type { DentalGroup, DentalPeriod } from '@backoffice/contracts';

/** One HOSxP row: a visit × one K00–K11 diagnosis. Money columns belong to the visit (`vn_stat`), so they repeat per diagnosis. */
export type DentalRow = { vn: string; vstdate: string; hn: string; patientName: string; diagCode: string; diagName: string; pttypeCode: string; pttypeName: string; paccountName: string | null; totalAmount: number; paidMoney: number; claimAmount: number };

type Money = { visits: number; patients: number; total: number; paid: number; claim: number };
export type DentalPeriodRow = { key: string } & Money;
export type DentalGroupRow = { code: string; name: string } & Money;
export type DentalDiagRow = { code: string; name: string; count: number };
export type DentalSummary = { rows: number; visits: number; patients: number; total: number; paid: number; claim: number; byPeriod: DentalPeriodRow[]; byGroup: DentalGroupRow[]; byDiag: DentalDiagRow[] };

export const NO_PACCOUNT = '(ไม่ระบุผังบัญชี)';

type Bucket = { visits: number; hns: Set<string>; total: number; paid: number; claim: number };
const bucket = (): Bucket => ({ visits: 0, hns: new Set(), total: 0, paid: 0, claim: 0 });
const add = (target: Bucket, row: DentalRow) => {
  target.visits += 1; target.hns.add(row.hn);
  target.total += Number(row.totalAmount); target.paid += Number(row.paidMoney); target.claim += Number(row.claimAmount);
};
const money = ({ hns, ...rest }: Bucket): Money => ({ ...rest, patients: hns.size });

/**
 * The dashboard numbers, a port of the legacy `DentalClaimsRepository::summarize`: money once per visit (first row of each VN),
 * diagnoses on every row, patients by distinct HN. Groups by total (largest first), diagnoses by count, periods by date.
 */
export function summarizeDental(rows: DentalRow[], group: DentalGroup, period: DentalPeriod): DentalSummary {
  const visits = new Set<string>();
  const patients = new Set<string>();
  const byPeriod = new Map<string, Bucket>();
  const byGroup = new Map<string, { code: string; name: string; bucket: Bucket }>();
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

    const paccount = (row.paccountName ?? '').trim();
    const [key, code, name] = group === 'paccount' ? [paccount || NO_PACCOUNT, '', paccount || NO_PACCOUNT] : [row.pttypeCode, row.pttypeCode, row.pttypeName];
    const groupEntry = byGroup.get(key) ?? { code, name, bucket: bucket() };
    add(groupEntry.bucket, row);
    byGroup.set(key, groupEntry);
  }

  const periods = [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => ({ key, ...money(value) }));
  const groups = [...byGroup.values()].map(({ code, name, bucket: value }) => ({ code, name, ...money(value) })).sort((a, b) => b.total - a.total);
  const diags = [...byDiag.values()].sort((a, b) => b.count - a.count);
  const sum = (field: 'total' | 'paid' | 'claim') => periods.reduce((total, row) => total + row[field], 0);
  return { rows: rows.length, visits: visits.size, patients: patients.size, total: sum('total'), paid: sum('paid'), claim: sum('claim'), byPeriod: periods, byGroup: groups, byDiag: diags };
}
