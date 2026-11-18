/**
 * Point ฟื้นฟูผู้พิการ dashboard calculator: a port of the legacy `dp-core.js` with the same names and formulas. Pure functions;
 * the dashboard runs them in the browser over every record.
 */
import type { DpStoredRecord } from '@backoffice/core';

/** The record fields the calculator reads. */
export type DpRow = Pick<DpStoredRecord, 'ref' | 'date' | 'fy' | 'cid' | 'name' | 'hn' | 'right' | 'target' | 'svc_type' | 'code' | 'service' | 'qty' | 'claim' | 'eligible' | 'status'>;
export type DpFilter = { from?: string; to?: string; right?: string; target?: string; svcType?: string; service?: string; flagged?: boolean; statusCode?: string; q?: string };
export type DpTotals = { visits: number; persons: number; qty: number; claim: number; eligible: number; flagged: number; flaggedClaim: number; flaggedEligible: number; diff: number };
export type DpServiceRow = DpTotals & { service: string; code: string };
export type DpStatusRow = DpTotals & { code: string };
export type DpBucket = DpTotals & { key: string };
export type DpTrend = { unit: 'day' | 'month'; buckets: DpBucket[] };

/** A range up to this many days shows the trend by day; longer, by month. */
export const DAILY_MAX_DAYS = 62;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ปีงบประมาณ พ.ศ. (ต.ค.–ก.ย.) of an ISO date. */
export function fiscalYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y + 543 + (m >= 10 ? 1 : 0);
}

/** The ISO dates of one ปีงบ พ.ศ. */
export function fyRange(fy: number): { from: string; to: string } {
  const y = fy - 543;
  return { from: `${y - 1}-10-01`, to: `${y}-09-30` };
}

/** ติดสถานะ: the row carries a status code. */
export const isFlagged = (rec: Pick<DpRow, 'status'>) => !!(rec.status && String(rec.status).trim());
const codesOf = (status: string) => String(status || '').split(',').map((v) => v.trim());

export function filterRecords<T extends DpRow>(recs: readonly T[], f: DpFilter): T[] {
  const q = (f.q || '').trim().toLowerCase();
  return recs.filter((x) =>
    (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to)
    && (!f.right || x.right === f.right) && (!f.target || x.target === f.target)
    && (!f.svcType || x.svc_type === f.svcType) && (!f.service || x.service === f.service)
    && (!f.flagged || isFlagged(x))
    && (!f.statusCode || codesOf(x.status).includes(f.statusCode))
    && (!q || [x.hn, x.cid, x.name, x.ref, x.code, x.service, x.status].some((v) => String(v || '').toLowerCase().includes(q))));
}

type Group = DpTotals & { people: Set<string> };
const blank = (): Group => ({ visits: 0, persons: 0, qty: 0, claim: 0, eligible: 0, flagged: 0, flaggedClaim: 0, flaggedEligible: 0, diff: 0, people: new Set() });
function add(g: Group, x: DpRow): void {
  g.visits++;
  g.qty += Number(x.qty) || 0;
  g.claim += Number(x.claim) || 0;
  g.people.add(x.cid || x.hn || x.ref);
  if (isFlagged(x)) { g.flagged++; g.flaggedClaim += Number(x.claim) || 0; g.flaggedEligible += Number(x.eligible) || 0; }
  else g.eligible += Number(x.eligible) || 0;
}
function done<T extends Group>(g: T): Omit<T, 'people'> {
  const { people, ...rest } = g;
  const out = { ...rest, persons: people.size, qty: r2(rest.qty), claim: r2(rest.claim), eligible: r2(rest.eligible), flaggedClaim: r2(rest.flaggedClaim), flaggedEligible: r2(rest.flaggedEligible) };
  out.diff = r2(out.claim - out.eligible);
  return out;
}

/** รวม: ครั้ง, คน, ขอเบิก (AE every row), พึงเบิก (AF without ติดสถานะ), ติดสถานะ. */
export function summarize(recs: readonly DpRow[]): DpTotals {
  const g = blank();
  for (const x of recs) add(g, x);
  return done(g);
}

/** By ชื่อบริการฟื้นฟู, most visits first. */
export function byService(recs: readonly DpRow[]): DpServiceRow[] {
  const m = new Map<string, Group & { service: string; code: string; codes: Set<string> }>();
  for (const x of recs) {
    const k = x.service || '(ไม่ระบุ)';
    if (!m.has(k)) m.set(k, { ...blank(), service: k, code: x.code || '', codes: new Set() });
    const g = m.get(k)!;
    if (x.code) g.codes.add(x.code);
    add(g, x);
  }
  return [...m.values()].map(({ codes, ...g }) => done({ ...g, code: [...codes].sort().join(', ') }))
    .sort((a, b) => b.visits - a.visits || b.claim - a.claim || (a.service < b.service ? -1 : 1));
}

/** By status code (one row may carry several). */
export function byStatus(recs: readonly DpRow[]): DpStatusRow[] {
  const m = new Map<string, Group & { code: string }>();
  for (const x of recs) {
    if (!isFlagged(x)) continue;
    for (const code of codesOf(x.status).filter(Boolean)) {
      if (!m.has(code)) m.set(code, { ...blank(), code });
      add(m.get(code)!, x);
    }
  }
  return [...m.values()].map((g) => done(g)).sort((a, b) => b.visits - a.visits || (a.code < b.code ? -1 : 1));
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** แนวโน้ม by day (range ≤ 62 days) or by month, with empty days or months as 0; without a range, the data's own bounds. */
export function trend(recs: readonly DpRow[], from: string, to: string): DpTrend {
  if (!from || !to) {
    const dates = recs.map((x) => x.date).filter(Boolean).sort();
    if (!dates.length) return { unit: 'day', buckets: [] };
    from = from || dates[0]!;
    to = to || dates.at(-1)!;
  }
  const days = Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000) + 1;
  const unit = days <= DAILY_MAX_DAYS ? 'day' : 'month';
  const keyOf = (iso: string) => (unit === 'day' ? iso.slice(0, 10) : iso.slice(0, 7));
  const m = new Map<string, Group & { key: string }>();
  if (unit === 'day') {
    for (let d = toDate(from); d <= toDate(to); d.setUTCDate(d.getUTCDate() + 1)) m.set(isoOf(d), { ...blank(), key: isoOf(d) });
  } else {
    let y = Number(from.slice(0, 4));
    let mo = Number(from.slice(5, 7));
    const endKey = to.slice(0, 7);
    for (;;) { const k = `${y}-${pad(mo)}`; m.set(k, { ...blank(), key: k }); if (k >= endKey) break; mo++; if (mo > 12) { mo = 1; y++; } }
  }
  for (const x of recs) {
    const g = m.get(keyOf(x.date || ''));
    if (g) add(g, x);
  }
  return { unit, buckets: [...m.values()].map((g) => done(g)) };
}
