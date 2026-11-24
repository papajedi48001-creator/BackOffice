'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { OfcStatus, OfcSummary, TtmPreset } from '@backoffice/core';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { imcAutoUnit, imcBuckets, imcDate, type ImcUnit } from '../../../../lib/money/imc-views';
import { OFC_STATUS, OFC_STATUS_ORDER, ofcChartLines } from '../../../../lib/money/ofc-views';
import { int, money } from '../fdh/fdh-shared';
import { TtmFilter } from '../ttm/ttm-filter';
import { OfcUpload } from './ofc-upload';

export type OfcOutcome = { kind: 'data'; summary: OfcSummary; updatedAt: string | null } | { kind: 'error'; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export interface OfcMonitorProps { start: string; end: string; presets: readonly TtmPreset[]; periodText: string; canManage: boolean; showConnectionLink: boolean; outcome: OfcOutcome; path?: string; query?: Readonly<Record<string, string>> }

type ChartUnit = 'auto' | ImcUnit;
const UNITS: [ChartUnit, string][] = [['auto', 'อัตโนมัติ'], ['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปีงบ']];
const stamp = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const amount = (value: number | null) => (value === null ? '-' : money(value));

function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: [T, string][]; value: T; onChange: (value: T) => void }) {
  return <div className="money-segmented" role="group" aria-label={label}>
    {items.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

/**
 * Monitor Instrument OFC: OFC outpatients given ADP 8610 instruments in the range (live from HOSxP), each visit matched to the
 * imported REP and Statement. Same layout as Monitor IMC; ผู้ดูแล Smart Money also get นำเข้า REP / Statement.
 */
export function OfcMonitor({ start, end, presets, periodText, canManage, showConnectionLink, outcome, path = '/money/disability', query = { tab: 'ofc' } }: OfcMonitorProps) {
  const router = useRouter();
  const summary = outcome.kind === 'data' ? outcome.summary : null;
  return <section className="money-ttm money-ofc">
    <TtmFilter key={`filter-${start}|${end}`} path={path} query={query} start={start} end={end} presets={presets}>
      {canManage && <OfcUpload onDone={() => router.refresh()} />}
    </TtmFilter>
    <header className="ttm-banner">
      <div><h3>Monitor Instrument OFC</h3><p>ผู้ป่วยนอกสิทธิข้าราชการ (OFC) ที่ได้รับอุปกรณ์บำบัดรักษา ADP 8610 · ข้อมูลจาก HOSxP เทียบ REP และ Statement</p></div>
      <p className="ttm-date">{periodText}</p>
    </header>
    {outcome.kind === 'error'
      ? (outcome.code === 'NOT_CONFIGURED'
        ? <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP{showConnectionLink && <> · <Link href="/admin/connections">ตั้งค่าการเชื่อมต่อ</Link></>}</p>
        : <p className="money-alert" role="alert">ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง</p>)
      : !summary || summary.totals.visits === 0
        ? <p className="money-empty">ไม่พบผู้ป่วย OFC ที่ได้รับอุปกรณ์ ADP 8610 ในช่วงวันที่ที่เลือก</p>
        : <OfcBody key={`body-${start}|${end}`} summary={summary} updatedAt={outcome.kind === 'data' ? outcome.updatedAt : null} start={start} end={end} />}
  </section>;
}

function OfcBody({ summary: s, updatedAt, start, end }: { summary: OfcSummary; updatedAt: string | null; start: string; end: string }) {
  const [unit, setUnit] = useState<ChartUnit>('auto');
  const [status, setStatus] = useState<'all' | OfcStatus>('all');
  const t = s.totals;
  const drawn = unit === 'auto' ? imcAutoUnit(start, end) : unit;
  const groups = useMemo(() => imcBuckets(ofcChartLines(s.visits), s.items.map((item) => ({ code: item.icode })), drawn, { from: start, to: end }), [s, drawn, start, end]);
  const counts = new Map(OFC_STATUS_ORDER.map((key) => [key, s.visits.filter((visit) => visit.status === key).length]));
  const filters: ['all' | OfcStatus, string][] = [['all', 'ทั้งหมด'], ...OFC_STATUS_ORDER.map((key): [OfcStatus, string] => [key, `${OFC_STATUS[key].text} (${int(counts.get(key) ?? 0)})`])];
  const visits = status === 'all' ? s.visits : s.visits.filter((visit) => visit.status === status);

  return <>
    <section className="money-kpis imc-kpis" aria-label="สรุป Instrument OFC">
      <div className="money-kpi"><span>ผู้ป่วย OFC ที่ได้รับอุปกรณ์</span><strong>{int(t.people)} <em>คน</em></strong><small>{`${int(t.visits)} ครั้ง · ${int(t.qty)} ชิ้น`}</small></div>
      <div className="money-kpi"><span>เรียกเก็บ</span><strong>{money(t.claim)} <em>บาท</em></strong><small>{`ยังไม่มี REP ${money(t.noRep)} บาท`}</small></div>
      <div className="money-kpi"><span>REP ชดเชย</span><strong>{money(t.repPaid)} <em>บาท</em></strong><small>{`ปฏิเสธ ${int(t.denied)} ครั้ง · รอ Statement ${int(t.waitStm)} ครั้ง`}{t.repOutside ? ` · ${int(t.repOutside)} รายการไม่พบใน HOSxP` : ''}</small></div>
      <div className="money-kpi is-accent"><span>Statement ค่าอวัยวะฯ</span><strong>{money(t.stmPaid)} <em>บาท</em></strong><small>{updatedAt ? `นำเข้าไฟล์ล่าสุด ${stamp.format(new Date(updatedAt))}` : 'ยังไม่ได้นำเข้า REP / Statement'}</small></div>
    </section>

    <section className="imc-block" aria-labelledby="ofc-visits-title">
      <div className="imc-block-head"><h4 id="ofc-visits-title">รายละเอียดรายครั้ง</h4><Segmented label="กรองสถานะ" items={filters} value={status} onChange={setStatus} /></div>
      <div className="money-table-wrap ofc-visits"><table aria-label="รายละเอียดรายครั้ง"><thead><tr><th className="money-number">ลำดับ</th><th>วันที่รับบริการ</th><th>ชื่อ-สกุล</th><th>รายการ</th><th className="money-number">ชิ้น</th><th className="money-number">เรียกเก็บ</th>
        <th className="money-number">ชดเชย REP</th><th className="money-number">ได้รับ STM</th><th className="money-number">ส่วนต่าง</th><th>สถานะ</th><th>Error</th><th>REP No.</th><th>งวด STM</th></tr></thead><tbody>
        {visits.map((visit, index) => <tr key={visit.vn}>
          <td className="money-number">{index + 1}</td><td>{imcDate(visit.date)}</td>
          <td className="ofc-wrap">{visit.name || visit.hn}<br /><small className="fdh-muted">{`HN ${visit.hn}`}</small></td>
          <td className="ofc-wrap">{visit.items.map((item) => item.name).join(', ')}</td><td className="money-number">{int(visit.qty)}</td><td className="money-number">{money(visit.claim)}</td>
          <td className="money-number">{amount(visit.repPaid)}</td><td className="money-number">{amount(visit.stmPaid)}</td>
          <td className={`money-number${visit.diff ? ' fdh-bad' : ' fdh-muted'}`}>{amount(visit.diff)}</td>
          <td><span className={`imc-tag is-${OFC_STATUS[visit.status].tone}`}>{OFC_STATUS[visit.status].text}</span></td>
          <td className="fdh-mono">{visit.errors.join(', ')}</td><td className="fdh-mono">{visit.repNos.join(', ') || '-'}</td><td className="fdh-mono">{visit.periods.join(', ') || '-'}</td></tr>)}
        {visits.length === 0 && <tr><td colSpan={13} className="imc-none">ไม่มีการรับอุปกรณ์ในกลุ่มนี้</td></tr>}
      </tbody><tfoot><tr><th colSpan={4}>{`รวม ${int(visits.length)} ครั้ง · ${int(new Set(visits.map((v) => v.hn)).size)} คน`}</th><th className="money-number">{int(visits.reduce((sum, v) => sum + v.qty, 0))}</th>
        <th className="money-number">{money(visits.reduce((sum, v) => sum + v.claim, 0))}</th><th className="money-number">{money(visits.reduce((sum, v) => sum + (v.repPaid ?? 0), 0))}</th><th className="money-number">{money(visits.reduce((sum, v) => sum + (v.stmPaid ?? 0), 0))}</th><th colSpan={5}></th></tr></tfoot></table></div>
    </section>

    <section className="imc-block" aria-labelledby="ofc-chart-title">
      <div className="imc-block-head"><h4 id="ofc-chart-title">การเรียกเก็บอุปกรณ์</h4><Segmented label="กราฟราย" items={UNITS} value={unit} onChange={setUnit} /></div>
      <GroupedBarChart ariaLabel="กราฟการเรียกเก็บอุปกรณ์ OFC" valueFormat={int} axisTitle={drawn === 'year' ? 'ปีงบประมาณ' : undefined} emptyText="ไม่มีการเรียกเก็บในช่วงนี้"
        series={s.items.map((item, index) => ({ name: item.name || item.icode, tone: index }))} groups={groups} />
    </section>

    <section className="imc-block" aria-labelledby="ofc-items-title">
      <h4 id="ofc-items-title">รายการอุปกรณ์</h4>
      <div className="money-table-wrap"><table aria-label="รายการอุปกรณ์"><thead><tr><th>รหัส</th><th>รายการ</th><th className="money-number">คน</th><th className="money-number">ครั้ง</th><th className="money-number">ชิ้น</th><th className="money-number">เรียกเก็บ (บาท)</th></tr></thead><tbody>
        {s.items.map((item) => <tr key={item.icode}><td className="fdh-mono">{item.icode}</td><td>{item.name}</td><td className="money-number">{int(item.people)}</td><td className="money-number">{int(item.visits)}</td><td className="money-number">{int(item.qty)}</td><td className="money-number">{money(item.claim)}</td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
