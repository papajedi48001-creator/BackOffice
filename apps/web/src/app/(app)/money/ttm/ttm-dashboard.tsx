'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { TTM_KINDS, TTM_RIGHT_GROUPS, type TtmKind } from '@backoffice/contracts';
import type { TtmPeriodType, TtmPreset, TtmSummary } from '@backoffice/core';
import { BarChart } from '../../../../components/bar-chart';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { formatBangkokDateOnly } from '../../../../lib/bangkok-time';
import { downloadTtmExport } from '../../../../lib/money/ttm-export';
import { ttmBaht, ttmDefaultPeriod, ttmExport, ttmMatrixRows, ttmNum, ttmPeriodLabel, ttmSearchVisits, ttmVisibleGroups } from '../../../../lib/money/ttm-views';
import { TtmFilter } from './ttm-filter';
import type { TtmOutcome } from './ttm-load';

export interface TtmDashboardProps { start: string; end: string; presets: readonly TtmPreset[]; periodText: string; afterFrom: string; showConnectionLink: boolean; outcome: TtmOutcome }

const KIND_KEYS = Object.keys(TTM_KINDS) as TtmKind[];
const PERIODS: Record<TtmPeriodType, string> = { day: 'รายวัน', month: 'รายเดือน', fy: 'รายปีงบ' };
const HOSPITAL = 'โรงพยาบาลวาริชภูมิ';

/** monitor แพทย์แผนไทย: the legacy daily report (index.php + dashboard.js) in the BackOffice shell. */
export function TtmDashboard({ start, end, presets, periodText, afterFrom, showConnectionLink, outcome }: TtmDashboardProps) {
  const single = start === end;
  const summary = outcome.kind === 'data' ? outcome.summary : null;
  const query = new URLSearchParams({ start, end }).toString();
  return <section className="money-ttm">
    <h2 className="visually-hidden">monitor แพทย์แผนไทย</h2>
    <TtmFilter key={`${start}|${end}`} path="/money/ttm" start={start} end={end} presets={presets}>
      <Link className="button-secondary" href={`/money/ttm/mapping?${query}`}>ตรวจสอบการจับคู่รหัส</Link>
      {summary && summary.visits > 0 && <button type="button" className="button-secondary" onClick={() => void downloadTtmExport(ttmExport(summary, { start, end, period: periodText, afterFrom, matrixRows: ttmMatrixRows(summary.matrix) }), start, end)}>ดาวน์โหลด Excel</button>}
    </TtmFilter>
    <header className="ttm-banner">
      <div><h3>สรุปผลการดำเนินงาน{single ? 'ประจำวัน' : ''}</h3><p>กลุ่มงานแพทย์แผนไทยและการแพทย์ทางเลือก · {HOSPITAL}</p></div>
      <p className="ttm-date">{periodText}</p>
    </header>
    {outcome.kind === 'error'
      ? (outcome.code === 'NOT_CONFIGURED'
        ? <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP{showConnectionLink && <> · <Link href="/admin/connections">ตั้งค่าการเชื่อมต่อ</Link></>}</p>
        : <p className="money-alert" role="alert">ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง</p>)
      : summary!.visits === 0
        ? <p className="money-empty">ไม่พบผู้รับบริการแพทย์แผนไทยในช่วงวันที่ที่เลือก</p>
        : <TtmBody key={`${start}|${end}`} summary={summary!} start={start} end={end} single={single} afterFrom={afterFrom} query={query} />}
  </section>;
}

function TtmBody({ summary: s, start, end, single, afterFrom, query }: { summary: TtmSummary; start: string; end: string; single: boolean; afterFrom: string; query: string }) {
  const t = s.totals;
  const groups = ttmVisibleGroups(s.groups);
  const matrixRows = ttmMatrixRows(s.matrix);
  const groupBy = new Map(s.groups.map((group) => [group.key, group]));
  const tops = [['ผู้รับบริการทั้งหมด', s.all], ['บริการผู้ป่วยใน (IPD)', s.ipd], [`บริการนอกเวลา (หลัง ${afterFrom} น.)`, s.afterHours]] as const;
  return <>
    <div className="ttm-main">
      <section className="money-card ttm-report" aria-label="สรุปผลการดำเนินงานตามสิทธิ">
        <div className="money-table-wrap"><table className="ttm-table" aria-label="สรุปตามสิทธิการรักษา">
          <thead><tr><th>สิทธิการรักษา</th><th className="money-number">จำนวนคน <small>(ราย)</small></th><th className="money-number">ค่านวดและประคบ + อบ + พอกเข่า + หลังคลอด + หัตถการอื่น ๆ <small>(บาท)</small></th><th className="money-number">ค่ายาสมุนไพร <small>(บาท)</small></th><th className="money-number">รวมค่าบริการทั้งหมด <small>(บาท)</small></th></tr></thead>
          <tbody>
            {tops.map(([label, row]) => <tr key={label} className="is-head-row"><td>{label}</td><td className="money-number">{ttmNum(row.patients)} คน</td><td className="money-number">{ttmBaht(row.massageAmount)}<small>{ttmNum(row.massage)} คน</small></td><td className="money-number">{ttmBaht(row.herbAmount)}<small>{ttmNum(row.herb)} คน</small></td><td className="money-number">{ttmBaht(row.total)}</td></tr>)}
            {groups.map((group) => <tr key={group.key}><td>{group.name}</td><td className="money-number">{ttmNum(group.patients)}</td><td className="money-number">{ttmBaht(group.massage)}</td><td className="money-number">{ttmBaht(group.herb)}</td><td className="money-number is-total">{ttmBaht(group.total)}</td></tr>)}
            <tr className="is-head-row"><td>ค่าบริการผู้ป่วยนอก <small>(ในเวลา 50 บาท)</small></td><td className="money-number">–</td><td className="money-number">–</td><td className="money-number">–</td><td className="money-number is-total">{ttmBaht(t.opdFee)}</td></tr>
          </tbody>
          <tfoot><tr><th>รวมทั้งสิ้น</th><th className="money-number">{ttmNum(s.all.patients)}</th><th className="money-number">{ttmBaht(t.massage)}</th><th className="money-number">{ttmBaht(t.herb)}</th><th className="money-number is-grand">{ttmBaht(t.grand)}</th></tr></tfoot>
        </table></div>
      </section>
      <aside className="ttm-kpis" aria-label="สรุป">
        <div className="money-kpi is-navy"><span>ผู้รับบริการทั้งหมด</span><strong>{ttmNum(s.all.patients)} <em>ราย</em></strong><small>{`${ttmNum(s.visits)} visit · ${ttmNum(s.serviceRows)} รายการบริการ`}</small></div>
        <div className="money-kpi is-gold"><span>บริการผู้ป่วยใน (IPD)</span><strong>{ttmNum(s.ipd.patients)} <em>ราย</em></strong></div>
        <div className="money-kpi is-violet"><span>{`บริการนอกเวลา (หลัง ${afterFrom} น.)`}</span><strong>{ttmNum(s.afterHours.patients)} <em>ราย</em></strong></div>
        <div className="money-kpi"><span>ค่านวด/ประคบ/อบ/หัตถการ</span><strong>{ttmBaht(t.massage)} <em>บาท</em></strong></div>
        <div className="money-kpi is-herb"><span>ค่ายาสมุนไพร</span><strong>{ttmBaht(t.herb)} <em>บาท</em></strong></div>
        <div className="money-kpi is-muted"><span>ค่าบริการผู้ป่วยนอก</span><strong>{ttmBaht(t.opdFee)} <em>บาท</em></strong></div>
        <div className="money-kpi is-accent"><span>รวมค่าบริการทั้งหมด</span><strong>{ttmBaht(t.grand)} <em>บาท</em></strong></div>
      </aside>
    </div>

    <section className="money-card">
      <h3>จำนวนผู้รับบริการรายบริการ แยกตามสิทธิ <small>(คน · 1 คนรับได้หลายบริการ)</small></h3>
      <div className="money-table-wrap"><table className="ttm-matrix" aria-label="จำนวนผู้รับบริการรายบริการ แยกตามสิทธิ">
        <thead><tr><th>สิทธิการรักษา</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{TTM_KINDS[kind]}</th>)}<th className="money-number">ผู้รับบริการ</th></tr></thead>
        <tbody>{matrixRows.map((key) => <tr key={key}><td>{TTM_RIGHT_GROUPS[key]}</td>{KIND_KEYS.map((kind) => { const n = s.matrix[key][kind].patients; return <td key={kind} className={`money-number${n ? '' : ' is-zero'}`}>{ttmNum(n)}</td>; })}<td className="money-number is-total">{ttmNum(groupBy.get(key)?.patients ?? 0)}</td></tr>)}</tbody>
        <tfoot><tr><th>รวม</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{ttmNum(s.kinds[kind].patients)}</th>)}<th className="money-number">{ttmNum(s.all.patients)}</th></tr></tfoot>
      </table></div>
    </section>

    <section className="money-card">
      <h3>รายได้รายบริการ แยกตามสิทธิ <small>(บาท)</small></h3>
      <div className="money-table-wrap"><table className="ttm-matrix" aria-label="รายได้รายบริการ แยกตามสิทธิ">
        <thead><tr><th>สิทธิการรักษา</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{TTM_KINDS[kind]}</th>)}<th className="money-number">รวมรายได้</th></tr></thead>
        <tbody>{matrixRows.map((key) => { const sum = KIND_KEYS.reduce((total, kind) => total + s.matrix[key][kind].amount, 0); return <tr key={key}><td>{TTM_RIGHT_GROUPS[key]}</td>{KIND_KEYS.map((kind) => { const a = s.matrix[key][kind].amount; return <td key={kind} className={`money-number${a ? '' : ' is-zero'}`}>{ttmBaht(a)}</td>; })}<td className="money-number is-total">{ttmBaht(sum)}</td></tr>; })}</tbody>
        <tfoot><tr><th>รวม</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{ttmBaht(s.kinds[kind].amount)}</th>)}<th className="money-number is-grand">{ttmBaht(t.grand)}</th></tr></tfoot>
      </table></div>
    </section>

    {!single && <TtmPeriods summary={s} start={start} end={end} />}

    <div className="money-grid-2">
      <section className="money-card">
        <h3>รวมค่าบริการแยกตามสิทธิ</h3>
        <BarChart ariaLabel="รวมค่าบริการแยกตามสิทธิ" orientation="horizontal" valueFormat={ttmBaht} bars={s.groups.filter((group) => group.total > 0).map((group) => ({ label: group.name, sublabel: `(${ttmNum(group.patients)} คน)`, value: group.total }))} />
      </section>
      <section className="money-card">
        <h3>ประเภทบริการ <small>(จำนวนรายการ)</small></h3>
        <BarChart ariaLabel="ประเภทบริการ" orientation="horizontal" valueFormat={ttmNum} bars={s.byType.slice(0, 12).map((type) => ({ label: type.name, sublabel: `${ttmNum(type.patients)} คน`, value: type.count }))} />
      </section>
    </div>

    <div className="money-grid-2">
      {([['ผู้ให้บริการ', s.byDoctor], ['ประเภทการรักษา', s.byTreatment]] as const).map(([title, rows]) => <section key={title} className="money-card">
        <h3>{title}</h3>
        <div className="money-table-wrap"><table aria-label={title}>
          <thead><tr><th>{title}</th><th className="money-number">รายการ</th><th className="money-number">คน</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td className="money-number">{ttmNum(row.count)}</td><td className="money-number">{ttmNum(row.patients)}</td></tr>)}</tbody>
        </table></div>
      </section>)}
    </div>

    <TtmVisits summary={s} query={query} />
  </>;
}

/** สรุปตามช่วงเวลา: รายวัน / รายเดือน / รายปีงบ as a chart stacked by service and a table (amount over people). */
function TtmPeriods({ summary: s, start, end }: { summary: TtmSummary; start: string; end: string }) {
  const [current, setCurrent] = useState<TtmPeriodType>(() => ttmDefaultPeriod(start, end));
  const list = s.periods[current];
  const shownKinds = KIND_KEYS.filter((kind) => list.some((period) => period.kinds[kind].amount > 0));
  return <section className="money-card">
    <div className="money-card-head">
      <h3>สรุปตามช่วงเวลา <small>({ttmNum(list.length)} ช่วง · ตัวเลขบน = บาท, ล่าง = คน)</small></h3>
      <div className="money-segmented" role="group" aria-label="ช่วงเวลา">{(Object.keys(PERIODS) as TtmPeriodType[]).map((key) => <button key={key} type="button" className={key === current ? 'is-active' : undefined} aria-pressed={key === current} onClick={() => setCurrent(key)}>{PERIODS[key]}</button>)}</div>
    </div>
    <GroupedBarChart ariaLabel={`รายได้${PERIODS[current]}แยกตามบริการ`} stacked valueFormat={ttmBaht}
      series={shownKinds.map((kind) => ({ name: TTM_KINDS[kind], tone: KIND_KEYS.indexOf(kind) }))}
      groups={list.map((period) => ({ label: `${ttmPeriodLabel(current, period.key)} · ${ttmNum(period.patients)} คน`, title: `รวม ${ttmBaht(period.total)} บาท · ${ttmNum(period.patients)} คน`, values: shownKinds.map((kind) => period.kinds[kind].amount) }))} />
    <div className="money-table-wrap ttm-period-table"><table aria-label={`สรุป${PERIODS[current]}`}>
      <thead><tr><th>ช่วงเวลา</th><th className="money-number">ผู้รับบริการ</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{TTM_KINDS[kind]}</th>)}<th className="money-number">รวมรายได้</th></tr></thead>
      <tbody>{list.map((period) => <tr key={period.key}><td className="money-nowrap">{ttmPeriodLabel(current, period.key)}</td><td className="money-number">{ttmNum(period.patients)}</td>
        {KIND_KEYS.map((kind) => { const cell = period.kinds[kind]; return <td key={kind} className={`money-number${cell.amount ? '' : ' is-zero'}`}>{ttmNum(cell.amount)}<small>{ttmNum(cell.patients)} คน</small></td>; })}
        <td className="money-number is-total">{ttmNum(period.total)}</td></tr>)}</tbody>
      <tfoot><tr><th>รวม</th><th className="money-number">{ttmNum(s.all.patients)}</th>{KIND_KEYS.map((kind) => <th key={kind} className="money-number">{ttmNum(s.kinds[kind].amount)}<small>{ttmNum(s.kinds[kind].patients)} คน</small></th>)}<th className="money-number is-grand">{ttmNum(s.totals.grand)}</th></tr></tfoot>
    </table></div>
  </section>;
}

/** รายชื่อผู้รับบริการ with the legacy search box; searching stays in the browser. */
function TtmVisits({ summary: s, query: rangeQuery }: { summary: TtmSummary; query: string }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => ttmSearchVisits(s.visitList, query), [s.visitList, query]);
  return <section className="money-card">
    <div className="money-card-head">
      <h3>รายชื่อผู้รับบริการ ({ttmNum(s.visits)} visit)</h3>
      <div className="money-table-filters">
        <label className="visually-hidden" htmlFor={`${ids}-q`}>ค้นหาผู้รับบริการ</label>
        <input id={`${ids}-q`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา HN / ชื่อ / สิทธิ / บริการ / ผู้ให้บริการ" />
      </div>
    </div>
    <p className="visually-hidden" aria-live="polite">{query.trim() ? `พบ ${shown.length} รายการ` : ''}</p>
    <div className="money-table-wrap is-tall"><table aria-label="รายชื่อผู้รับบริการ">
      <thead><tr><th>วันที่</th><th>เวลา</th><th>HN</th><th>ชื่อ-สกุล</th><th>สิทธิ</th><th>ประเภทบริการ</th><th>การรักษา</th><th>ผู้ให้บริการ</th><th className="money-number">ค่านวด/หัตถการ</th><th className="money-number">ยาสมุนไพร</th><th className="money-number">ค่าบริการ OPD</th><th className="money-number">รวม</th></tr></thead>
      <tbody>{shown.map((v) => <tr key={v.vn}>
        <td className="money-nowrap">{formatBangkokDateOnly(v.date)}</td><td className="money-nowrap">{v.time.slice(0, 5)}</td><td>{v.hn}</td>
        <td>{v.patientName}{v.ipd && <> <span className="ttm-tag">IPD</span></>}{v.afterHours && <> <span className="ttm-tag is-night">นอกเวลา</span></>}</td>
        <td title={`${v.pttype} ${v.pttypeName}`}>{v.rightName}</td><td>{v.services}</td><td>{v.treatments}</td><td>{v.doctors}</td>
        <td className="money-number">{ttmBaht(v.massage)}</td><td className="money-number">{ttmBaht(v.herb)}</td><td className="money-number">{ttmBaht(v.opdFee)}</td><td className="money-number"><strong>{ttmBaht(v.total)}</strong></td>
      </tr>)}</tbody>
    </table></div>
    <p className="money-note">ยอดเงินรวมจาก opitemrece ของ visit ที่มารับบริการแพทย์แผนไทย เฉพาะรายการที่จัดเป็นค่านวด/หัตถการ ค่ายาสมุนไพร และค่าบริการผู้ป่วยนอก (ดูว่ารายการไหนถูกนับที่หน้า <Link href={`/money/ttm/mapping?${rangeQuery}`}>ตรวจสอบการจับคู่รหัส</Link>)</p>
  </section>;
}
