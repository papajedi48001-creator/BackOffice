/**
 * Point ฟื้นฟูผู้พิการ dashboard: the view state and what each screen shows, taken from the legacy `dashboard.js` (time view,
 * filters, tags, KPIs, services, trend, ปีงบ rows, status codes, the list and the Excel sheets). Pure; the page renders it.
 */
import type { DpStoredRecord } from '@backoffice/core';
import { addDays as addBangkokDays, bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../bangkok-time';
import { byService, byStatus, filterRecords, fyRange, isFlagged, summarize, trend, type DpServiceRow, type DpStatusRow, type DpTotals, type DpTrend } from './dp-core';

export type DpMode = 'year' | 'day' | 'range';
export type DpState = { mode: DpMode; fy: string; day: string; from: string; to: string; right: string; target: string; svcType: string; service: string; statusCode: string; q: string };
export type DpPeriod = { from: string; to: string };
export type DpView = {
  base: DpStoredRecord[]; scoped: DpStoredRecord[]; kpis: DpTotals; services: DpServiceRow[]; total: DpTotals; trend: DpTrend;
  years: (DpTotals & { fy: number })[]; flags: DpStatusRow[];
};

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const int = (n: number) => (+n || 0).toLocaleString('th-TH');
const pad = (n: number) => String(n).padStart(2, '0');
/** `2025-11-13` → `13 พ.ย. 2568`; anything else `-`. */
export const dpDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? formatBangkokDateOnly(iso.slice(0, 10)) : '-');
export const addDays = (iso: string, days: number) => addBangkokDays(iso, days);
/** The last day of the month of `2024-02` or `2024-02-10`. */
export const monthEnd = (key: string) => `${key.slice(0, 7)}-${pad(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate())}`;
/** A trend bar: `3 พ.ย.` by day, `พ.ย. 68` by month. */
export const dpTrendLabel = (unit: 'day' | 'month', key: string) => (unit === 'day'
  ? `${Number(key.slice(8, 10))} ${TH_MONTHS[Number(key.slice(5, 7)) - 1]}`
  : `${TH_MONTHS[Number(key.slice(5, 7)) - 1]} ${String(Number(key.slice(0, 4)) + 543).slice(-2)}`);

export function dpBounds(records: readonly DpStoredRecord[]): DpPeriod {
  const dates = records.map((x) => x.date).sort();
  return { from: dates[0] ?? '', to: dates.at(-1) ?? '' };
}

/** The legacy `setup`: keep what was picked; otherwise the latest ปีงบ, the last day with data and the first of its month. */
export function dpInitialState(records: readonly DpStoredRecord[], previous?: DpState): DpState {
  const bounds = dpBounds(records);
  const years = dpYearOptions(records).map(([fy]) => fy);
  const s: DpState = previous ? { ...previous } : { mode: 'year', fy: '', day: '', from: '', to: '', right: '', target: '', svcType: '', service: '', statusCode: '', q: '' };
  if (!s.fy || !years.includes(Number(s.fy))) s.fy = years.length ? String(years[0]) : '';
  if (!s.day) s.day = bounds.to;
  if (!s.from) { s.from = `${bounds.to.slice(0, 8)}01`; s.to = bounds.to; }
  return s;
}

export function dpYearOptions(records: readonly DpStoredRecord[]): [number, number][] {
  const counts = new Map<number, number>();
  for (const x of records) counts.set(x.fy, (counts.get(x.fy) ?? 0) + 1);
  return [...counts].sort((a, b) => b[0] - a[0]);
}

/** The values of สิทธิหลัก, กลุ่มเป้าหมาย or ประเภทการรับบริการ, most rows first. */
export function dpCountOptions(records: readonly DpStoredRecord[], key: 'right' | 'target' | 'svc_type'): [string, number][] {
  const counts = new Map<string, number>();
  for (const x of records) { const v = x[key] || ''; if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** The dates the time view covers ('' = no limit). */
export function dpPeriod(s: DpState): DpPeriod {
  if (s.mode === 'year') return s.fy ? fyRange(Number(s.fy)) : { from: '', to: '' };
  if (s.mode === 'day') return { from: s.day, to: s.day };
  return s.from <= s.to ? { from: s.from, to: s.to } : { from: s.to, to: s.from };
}

export function dpPeriodLabel(s: DpState): string {
  const p = dpPeriod(s);
  if (s.mode === 'year') return s.fy ? `ปีงบ ${s.fy} (${dpDate(p.from)} – ${dpDate(p.to)})` : 'ทุกปีงบ';
  if (s.mode === 'day') return `วันที่ ${dpDate(s.day)}`;
  return `${dpDate(p.from)} – ${dpDate(p.to)}`;
}

/** รายวัน shows the whole month of the chosen day. */
export function dpTrendRange(s: DpState): DpPeriod {
  return s.mode === 'day' ? { from: `${s.day.slice(0, 8)}01`, to: monthEnd(s.day) } : dpPeriod(s);
}

/** "กำลังแสดง:" tags. */
export function dpActiveTags(s: DpState): string[] {
  const parts = [dpPeriodLabel(s)];
  if (s.right) parts.push(`สิทธิ ${s.right}`);
  if (s.target) parts.push(s.target);
  if (s.svcType) parts.push(s.svcType);
  if (s.service) parts.push(s.service);
  if (s.statusCode) parts.push(`สถานะ ${s.statusCode}`);
  if (s.q) parts.push(`ค้นหา "${s.q}"`);
  return parts;
}

const attrs = (s: DpState) => ({ right: s.right, target: s.target, svcType: s.svcType });

/** Everything but the list, as the legacy `apply`: services over the period and filters; the rest also by the chosen service. */
export function dpView(records: readonly DpStoredRecord[], s: DpState): DpView {
  const base = filterRecords(records, { ...attrs(s), ...dpPeriod(s) });
  const scoped = s.service ? filterRecords(base, { service: s.service }) : base;
  const range = dpTrendRange(s);
  const byYear = new Map<number, DpStoredRecord[]>();
  for (const x of filterRecords(records, { ...attrs(s), service: s.service })) { if (!byYear.has(x.fy)) byYear.set(x.fy, []); byYear.get(x.fy)!.push(x); }
  return {
    base, scoped, kpis: summarize(scoped), services: byService(base), total: summarize(base), trend: trend(scoped, range.from, range.to),
    years: [...byYear].sort((a, b) => b[0] - a[0]).map(([fy, rows]) => ({ fy, ...summarize(rows) })), flags: byStatus(scoped)
  };
}

/** รายการ: by status code and search, newest วันที่รับบริการ first, then เลขที่อ้างอิง. */
export function dpList(scoped: readonly DpStoredRecord[], statusCode: string, q: string): DpStoredRecord[] {
  return filterRecords(scoped, { statusCode, q }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ref < b.ref ? 1 : -1));
}

/** "ข้อมูล N ครั้ง · Y ปีงบ (from – to) · ปรับปรุงล่าสุด 13 พ.ย. 2569 14:05" (Bangkok time). */
export function dpStatusLine(records: readonly DpStoredRecord[], years: readonly { updatedAt: string }[]): string {
  const bounds = dpBounds(records);
  const last = years.map((year) => year.updatedAt || '').sort().pop() || '';
  return `ข้อมูล ${int(records.length)} ครั้ง · ${int(years.length)} ปีงบ (${dpDate(bounds.from)} – ${dpDate(bounds.to)})`
    + (last ? ` · ปรับปรุงล่าสุด ${formatBangkokDateOnly(bangkokToday(new Date(last)))} ${formatBangkokTime(last)}` : '');
}

export type DpExportSheets = Record<'ช่วงเวลา' | 'รายบริการ' | 'แนวโน้ม' | 'รายการ', Record<string, string | number>[]>;

/** The legacy ดาวน์โหลด Excel: ช่วงเวลา, รายบริการ (period and filters), แนวโน้ม and รายการ (as listed), with the legacy column names. */
export function dpExportSheets(s: DpState, view: DpView, list: readonly DpStoredRecord[]): DpExportSheets {
  return {
    'ช่วงเวลา': [{ 'ช่วงเวลา': dpPeriodLabel(s) }],
    'รายบริการ': view.services.map((r) => ({
      'ชื่อบริการฟื้นฟู': r.service, 'รหัส': r.code, 'จำนวนครั้ง': r.visits, 'จำนวนคน': r.persons,
      'ราคาที่ขอเบิก (AE)': r.claim, 'ราคาที่พึงเบิก (AF) ไม่รวมติดสถานะ': r.eligible, 'ส่วนต่าง': r.diff, 'ติดสถานะ (ครั้ง)': r.flagged
    })),
    'แนวโน้ม': view.trend.buckets.map((b) => ({ [view.trend.unit === 'day' ? 'วันที่' : 'เดือน']: b.key, 'จำนวนครั้ง': b.visits, 'ขอเบิก (AE)': b.claim, 'พึงเบิก (AF)': b.eligible })),
    'รายการ': list.map((x) => ({
      'วันที่รับบริการ': x.date, 'ปีงบ': x.fy, HN: x.hn, 'เลขบัตรประชาชน': x.cid, 'ชื่อ - สกุล': x.name, 'สิทธิหลัก': x.right,
      'กลุ่มเป้าหมาย': x.target, 'ประเภทการรับบริการ': x.svc_type, 'รหัสบริการฟื้นฟู': x.code, 'ชื่อบริการฟื้นฟู': x.service,
      'จำนวน': x.qty, 'ราคาที่ขอเบิก (AE)': x.claim, 'ราคาที่พึงเบิก (AF)': x.eligible, 'สถานะ': x.status, 'เลขที่อ้างอิง': x.ref, 'เจ้าหน้าที่': x.staff
    }))
  };
}

export function dpExportFileName(now: Date): string {
  return `point-disability-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
}

export { isFlagged };
