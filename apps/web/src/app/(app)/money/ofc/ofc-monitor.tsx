'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState } from 'react';
import type { OfcStatus, OfcSummary, OfcVisit, TtmPreset } from '@backoffice/core';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { imcAutoUnit, imcBuckets, imcDate, type ImcUnit } from '../../../../lib/money/imc-views';
import { OFC_STATUS, OFC_STATUS_ORDER, ofcChartLines } from '../../../../lib/money/ofc-views';
import { int, money } from '../fdh/fdh-shared';
import { TtmFilter } from '../ttm/ttm-filter';
import { OfcUpload } from './ofc-upload';

export type OfcOutcome = { kind: 'data'; summary: OfcSummary; updatedAt: string | null } | { kind: 'error'; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export interface OfcMonitorProps { start: string; end: string; presets: readonly TtmPreset[]; periodText: string; canManage: boolean; showConnectionLink: boolean; outcome: OfcOutcome }

type ChartUnit = 'auto' | ImcUnit;
const UNITS: [ChartUnit, string][] = [['auto', 'อัตโนมัติ'], ['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปีงบ']];
const stamp = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const amount = (value: number | null) => (value === null ? '-' : money(value));

function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: [T, string][]; value: T; onChange: (value: T) => void }) {
  return <div className="money-segmented" role="group" aria-label={label}>
    {items.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}
const StatusTag = ({ visit }: { visit: OfcVisit }) => <><span className={`imc-tag is-${OFC_STATUS[visit.status].tone}`}>{OFC_STATUS[visit.status].text}</span>{visit.errors.length > 0 && <small className="fdh-mono">{` ${visit.errors.join(', ')}`}</small>}</>;

/**
 * Monitor Instrument OFC: OFC outpatients given ADP 8610 instruments in the range (live from HOSxP), each visit matched to the
 * imported REP and Statement. Same layout as Monitor IMC; ผู้ดูแล Smart Money also get นำเข้า REP / Statement.
 */
export function OfcMonitor({ start, end, presets, periodText, canManage, showConnectionLink, outcome }: OfcMonitorProps) {
  const router = useRouter();
  const summary = outcome.kind === 'data' ? outcome.summary : null;
  return <section className="money-ttm money-ofc">
    <TtmFilter key={`filter-${start}|${end}`} path="/money/ofc" start={start} end={end} presets={presets}>
      {canManage && <OfcUpload onDone={() => router.refresh()} />}
    </TtmFilter>
    <header className="ttm-banner">
      <div><h2>Monitor Instrument OFC</h2><p>ผู้ป่วยนอกสิทธิข้าราชการ (OFC) ที่ได้รับอุปกรณ์บำบัดรักษา ADP 8610 · ข้อมูลจาก HOSxP เทียบ REP และ Statement</p></div>
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
  const [opened, setOpened] = useState<string | null>(null);
  const t = s.totals;
  const visitOf = useMemo(() => new Map(s.visits.map((visit) => [visit.vn, visit])), [s]);
  const drawn = unit === 'auto' ? imcAutoUnit(start, end) : unit;
  const groups = useMemo(() => imcBuckets(ofcChartLines(s.visits), s.items.map((item) => ({ code: item.icode })), drawn, { from: start, to: end }), [s, drawn, start, end]);
  const counts = new Map(OFC_STATUS_ORDER.map((key) => [key, s.visits.filter((visit) => visit.status === key).length]));
  const filters: ['all' | OfcStatus, string][] = [['all', 'ทั้งหมด'], ...OFC_STATUS_ORDER.map((key): [OfcStatus, string] => [key, `${OFC_STATUS[key].text} (${int(counts.get(key) ?? 0)})`])];
  const persons = status === 'all' ? s.persons : s.persons.filter((person) => person.vns.some((vn) => visitOf.get(vn)?.status === status));

  return <>
    <section className="money-kpis imc-kpis" aria-label="สรุป Instrument OFC">
      <div className="money-kpi"><span>ผู้ป่วย OFC ที่ได้รับอุปกรณ์</span><strong>{int(t.people)} <em>คน</em></strong><small>{`${int(t.visits)} ครั้ง · ${int(t.qty)} ชิ้น`}</small></div>
      <div className="money-kpi"><span>เรียกเก็บ</span><strong>{money(t.claim)} <em>บาท</em></strong><small>{`ยังไม่มี REP ${money(t.noRep)} บาท`}</small></div>
      <div className="money-kpi"><span>REP ชดเชย</span><strong>{money(t.repPaid)} <em>บาท</em></strong><small>{`ปฏิเสธ ${int(t.denied)} ครั้ง · รอ Statement ${int(t.waitStm)} ครั้ง`}{t.repOutside ? ` · ${int(t.repOutside)} รายการไม่พบใน HOSxP` : ''}</small></div>
      <div className="money-kpi is-accent"><span>Statement ค่าอวัยวะฯ</span><strong>{money(t.stmPaid)} <em>บาท</em></strong><small>{updatedAt ? `นำเข้าไฟล์ล่าสุด ${stamp.format(new Date(updatedAt))}` : 'ยังไม่ได้นำเข้า REP / Statement'}</small></div>
    </section>

    <section className="imc-block" aria-labelledby="ofc-people-title">
      <div className="imc-block-head"><h4 id="ofc-people-title">รายละเอียดรายบุคคล</h4><Segmented label="กรองสถานะ" items={filters} value={status} onChange={setStatus} /></div>
      <div className="money-table-wrap"><table aria-label="รายละเอียดรายบุคคล"><thead><tr><th className="money-number">ลำดับ</th><th>ชื่อ-สกุล</th><th>สิทธิ</th><th className="money-number">ครั้ง</th><th className="money-number">ชิ้น</th><th className="money-number">เรียกเก็บ</th><th className="money-number">REP</th><th className="money-number">Statement</th><th>ล่าสุด</th></tr></thead><tbody>
        {persons.map((person, index) => { const isOpen = opened === person.hn; const toggle = () => setOpened(isOpen ? null : person.hn);
          const visits = person.vns.map((vn) => visitOf.get(vn)!);
          return <Fragment key={person.hn}>
            <tr className={`imc-row${isOpen ? ' is-open' : ''}`} onClick={toggle}>
              <td className="money-number">{index + 1}</td>
              <td><button type="button" className="imc-row-toggle" aria-expanded={isOpen} onClick={(event) => { event.stopPropagation(); toggle(); }}>{person.name || person.hn}</button><br /><small className="fdh-muted">{`HN ${person.hn}`}</small></td>
              <td>{person.pttypeName}</td><td className="money-number">{int(person.visits)}</td><td className="money-number">{int(person.qty)}</td>
              <td className="money-number">{money(person.claim)}</td><td className="money-number">{money(person.repPaid)}</td><td className="money-number">{money(person.stmPaid)}</td><td>{imcDate(person.last)}</td></tr>
            {isOpen && <tr className="imc-lines-row"><td colSpan={9}>
              <table className="imc-lines" aria-label={`การรับอุปกรณ์ ${person.name || person.hn}`}><thead><tr><th>วันที่รับบริการ</th><th>VN</th><th>รายการ</th><th className="money-number">ชิ้น</th><th className="money-number">เรียกเก็บ</th><th className="money-number">REP</th><th className="money-number">Statement</th><th>สถานะ</th><th>REP NO</th></tr></thead><tbody>
                {visits.map((visit) => <tr key={visit.vn}><td>{imcDate(visit.date)}</td><td className="fdh-mono">{visit.vn}</td><td>{visit.items.map((item) => item.name).join(', ')}</td>
                  <td className="money-number">{int(visit.qty)}</td><td className="money-number">{money(visit.claim)}</td><td className="money-number">{amount(visit.repPaid)}</td><td className="money-number">{amount(visit.stmPaid)}</td>
                  <td><StatusTag visit={visit} /></td><td className="fdh-mono">{visit.repNos.join(', ') || '-'}</td></tr>)}
              </tbody><tfoot><tr><th colSpan={3}>{`รวม ${int(visits.length)} ครั้ง`}</th><th className="money-number">{int(person.qty)}</th><th className="money-number">{money(person.claim)}</th><th className="money-number">{money(person.repPaid)}</th><th className="money-number">{money(person.stmPaid)}</th><th></th><th></th></tr></tfoot></table>
            </td></tr>}
          </Fragment>; })}
        {persons.length === 0 && <tr><td colSpan={9} className="imc-none">ไม่มีผู้ป่วยในกลุ่มนี้</td></tr>}
      </tbody><tfoot><tr><th></th><th>{`รวม ${int(persons.length)} คน`}</th><th></th><th className="money-number">{int(persons.reduce((sum, p) => sum + p.visits, 0))}</th><th className="money-number">{int(persons.reduce((sum, p) => sum + p.qty, 0))}</th>
        <th className="money-number">{money(persons.reduce((sum, p) => sum + p.claim, 0))}</th><th className="money-number">{money(persons.reduce((sum, p) => sum + p.repPaid, 0))}</th><th className="money-number">{money(persons.reduce((sum, p) => sum + p.stmPaid, 0))}</th><th></th></tr></tfoot></table></div>
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
