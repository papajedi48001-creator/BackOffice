import Link from 'next/link';
import type { DentalGroup, DentalPeriod } from '@backoffice/contracts';
import type { DentalPreset, DentalRow, DentalSummary } from '@backoffice/core';
import { BarChart } from '../../../../components/bar-chart';
import { formatBangkokDateOnly } from '../../../../lib/bangkok-time';
import { DentalDetailTable } from './dental-detail-table';
import { DentalDateFilter } from './dental-filters';
import { formatMoney, formatWhole } from './dental-format';

export type DentalOutcome = { kind: 'data'; rows: DentalRow[]; summary: DentalSummary } | { kind: 'range'; code: 'INVALID_DATE' | 'END_BEFORE_START' | 'RANGE_TOO_LONG' } | { kind: 'error'; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export interface DentalDashboardProps { start: string; end: string; group: DentalGroup; period: DentalPeriod; presets: DentalPreset[]; showConnectionLink: boolean; outcome: DentalOutcome }

const GROUPS: Record<DentalGroup, string> = { pttype: 'สิทธิการรักษา', paccount: 'ผังบัญชี' };
const PERIODS: Record<DentalPeriod, string> = { day: 'รายวัน', month: 'รายเดือน' };
const RANGE_MESSAGES = { INVALID_DATE: 'วันที่ไม่ถูกต้อง เลือกวันที่ใหม่', END_BEFORE_START: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม', RANGE_TOO_LONG: 'ช่วงวันที่ยาวเกิน 366 วัน เลือกช่วงที่สั้นลง' } as const;
const thaiMonth = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', month: 'short', year: 'numeric' });
const periodLabel = (key: string, period: DentalPeriod) => (period === 'month' ? thaiMonth.format(new Date(`${key}-01T00:00:00Z`)) : formatBangkokDateOnly(key));

/** Dashboard ลูกหนี้ทันตกรรม: the legacy Smart Money page in the BackOffice shell (spec 7.3, 7.5). */
export function DentalDashboard({ start, end, group, period, presets, showConnectionLink, outcome }: DentalDashboardProps) {
  const link = (change: Partial<{ start: string; end: string; group: DentalGroup; period: DentalPeriod }>) => `/money/dental?${new URLSearchParams({ start, end, group, period, ...change }).toString()}`;
  const groupLabel = GROUPS[group];
  return <section className="money-dental">
    <h2>Dashboard ลูกหนี้ทันตกรรม</h2>
    <div className="money-filter">
      <DentalDateFilter start={start} end={end} group={group} period={period} />
      <nav className="money-presets" aria-label="ช่วงวันที่ด่วน">{presets.map((preset) => <Link key={preset.label} className={`money-chip-link${preset.start === start && preset.end === end ? ' is-active' : ''}`} aria-current={preset.start === start && preset.end === end ? 'true' : undefined} href={link({ start: preset.start, end: preset.end })}>{preset.label}</Link>)}</nav>
      {outcome.kind === 'data' && outcome.rows.length > 0 && <a className="button-secondary money-export" href={`/api/money/dental/export?${new URLSearchParams({ start, end }).toString()}`}>ดาวน์โหลด CSV</a>}
    </div>
    <div className="money-toolbar">
      <nav className="money-segmented" aria-label="แยกตาม"><span>แยกตาม</span>{(Object.keys(GROUPS) as DentalGroup[]).map((key) => <Link key={key} href={link({ group: key })} className={key === group ? 'is-active' : undefined} aria-current={key === group ? 'true' : undefined}>{GROUPS[key]}</Link>)}</nav>
      <nav className="money-segmented" aria-label="ช่วงเวลา"><span>ช่วงเวลา</span>{(Object.keys(PERIODS) as DentalPeriod[]).map((key) => <Link key={key} href={link({ period: key })} className={key === period ? 'is-active' : undefined} aria-current={key === period ? 'true' : undefined}>{PERIODS[key]}</Link>)}</nav>
    </div>
    <p className="money-period">ช่วงวันที่ <strong>{formatBangkokDateOnly(start)}</strong> ถึง <strong>{formatBangkokDateOnly(end)}</strong> · รหัสโรค K00–K11 · เฉพาะลูกหนี้ (มียอดเรียกเก็บ หรือชำระไม่ครบ)</p>
    <DentalBody outcome={outcome} group={group} period={period} groupLabel={groupLabel} showConnectionLink={showConnectionLink} />
  </section>;
}

function DentalBody({ outcome, group, period, groupLabel, showConnectionLink }: { outcome: DentalOutcome; group: DentalGroup; period: DentalPeriod; groupLabel: string; showConnectionLink: boolean }) {
  if (outcome.kind === 'range') return <p className="money-alert" role="alert">{RANGE_MESSAGES[outcome.code]}</p>;
  if (outcome.kind === 'error') return outcome.code === 'NOT_CONFIGURED'
    ? <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP{showConnectionLink && <> · <Link href="/admin/connections">ตั้งค่าการเชื่อมต่อ</Link></>}</p>
    : <p className="money-alert" role="alert">ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง</p>;
  const { rows, summary } = outcome;
  if (rows.length === 0) return <p className="money-empty">ไม่พบข้อมูลในช่วงวันที่ที่เลือก</p>;
  const groupName = (row: { code: string; name: string }) => row.name || row.code || '-';
  return <>
    <section className="money-kpis" aria-label="สรุป">
      <div className="money-kpi"><span>ผู้รับบริการทันตกรรม</span><strong><span>{formatWhole(summary.patients)}</span> <em>คน</em></strong><small>{`${formatWhole(summary.visits)} visit`}</small></div>
      <div className="money-kpi"><span>ค่ารักษารวม (บาท)</span><strong>{formatMoney(summary.total)}</strong><small>inc01–inc16</small></div>
      <div className="money-kpi"><span>ชำระเงินแล้ว (บาท)</span><strong>{formatMoney(summary.paid)}</strong><small>paid_money</small></div>
      <div className="money-kpi is-accent"><span>มูลค่าลูกหนี้ / เรียกเก็บ (บาท)</span><strong>{formatMoney(summary.claim)}</strong><small>rcpt_money</small></div>
    </section>
    <section className="money-card">
      <h3>ค่ารักษารวมแยกตาม{groupLabel} <small>(ตัวเลขในวงเล็บ = จำนวนคน)</small></h3>
      <BarChart ariaLabel={`ค่ารักษารวมแยกตาม${groupLabel}`} valueFormat={formatWhole} bars={summary.byGroup.map((row) => ({ label: group === 'pttype' && row.code ? `${row.code} ${groupName(row)}` : groupName(row), sublabel: `(${formatWhole(row.patients)} คน)`, value: row.total, note: `ค่ารักษารวม ${formatMoney(row.total)} บาท · ลูกหนี้ ${formatMoney(row.claim)} บาท · ${formatWhole(row.patients)} คน (${formatWhole(row.visits)} visit)` }))} />
    </section>
    <section className="money-card">
      <h3>มูลค่า{period === 'month' ? 'รายเดือน' : 'รายวัน'}</h3>
      <BarChart ariaLabel={`มูลค่า${period === 'month' ? 'รายเดือน' : 'รายวัน'}`} orientation="vertical" legend={['ค่ารักษารวม', 'ลูกหนี้']} valueFormat={formatWhole} bars={summary.byPeriod.map((row) => ({ label: periodLabel(row.key, period), value: row.total, secondary: row.claim, note: `${formatWhole(row.patients)} คน (${formatWhole(row.visits)} visit)` }))} />
    </section>
    <div className="money-grid-2">
      <section className="money-card">
        <h3>สรุปตาม{groupLabel}</h3>
        <div className="money-table-wrap"><table aria-label={`สรุปตาม${groupLabel}`}>
          <thead><tr><th>{groupLabel}</th><th className="money-number">คน</th><th className="money-number">Visit</th><th className="money-number">ค่ารักษารวม</th><th className="money-number">ลูกหนี้</th></tr></thead>
          <tbody>{summary.byGroup.map((row) => <tr key={`${row.code}|${row.name}`}><td>{row.code && <span className="money-code">{row.code}</span>} {row.name}</td><td className="money-number">{formatWhole(row.patients)}</td><td className="money-number">{formatWhole(row.visits)}</td><td className="money-number">{formatMoney(row.total)}</td><td className="money-number">{formatMoney(row.claim)}</td></tr>)}</tbody>
          <tfoot><tr><th>รวม</th><th className="money-number">{formatWhole(summary.patients)}</th><th className="money-number">{formatWhole(summary.visits)}</th><th className="money-number">{formatMoney(summary.total)}</th><th className="money-number">{formatMoney(summary.claim)}</th></tr></tfoot>
        </table></div>
      </section>
      <section className="money-card">
        <h3>รหัสโรคที่พบบ่อย (Top 10)</h3>
        <div className="money-table-wrap"><table aria-label="รหัสโรคที่พบบ่อย (Top 10)">
          <thead><tr><th>ICD-10</th><th>ชื่อโรค</th><th className="money-number">จำนวน</th></tr></thead>
          <tbody>{summary.byDiag.slice(0, 10).map((row) => <tr key={row.code}><td><span className="money-code">{row.code}</span></td><td>{row.name}</td><td className="money-number">{formatWhole(row.count)}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
    <section className="money-card">
      <DentalDetailTable rows={rows} />
      <p className="money-note">หมายเหตุ: 1 visit ที่มีหลายรหัสโรคจะแสดงหลายแถว ยอดเงินในการ์ดสรุปและกราฟนับต่อ visit ครั้งเดียว</p>
    </section>
  </>;
}
