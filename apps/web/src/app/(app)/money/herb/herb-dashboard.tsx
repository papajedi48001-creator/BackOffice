'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { TTM_RIGHT_GROUPS, type TtmRightGroup } from '@backoffice/contracts';
import type { HerbDrug, HerbGroup, HerbSummary, HerbTally, TtmPreset } from '@backoffice/core';
import { BarChart } from '../../../../components/bar-chart';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { downloadHerbExport } from '../../../../lib/money/herb-export';
import { herbCount, herbExport, herbOntopPoints, herbRateText, herbSearchDrugs, herbVisibleGroups } from '../../../../lib/money/herb-views';
import { ttmBaht } from '../../../../lib/money/ttm-views';
import { TtmFilter } from '../ttm/ttm-filter';
import type { HerbOutcome, HerbRepState } from './herb-load';

export interface HerbDashboardProps { start: string; end: string; presets: readonly TtmPreset[]; periodText: string; pointBaht: number | null; canUpload: boolean; showConnectionLink: boolean; outcome: HerbOutcome }

const RIGHT_KEYS = Object.keys(TTM_RIGHT_GROUPS) as TtmRightGroup[];
const HOSPITAL = 'โรงพยาบาลวาริชภูมิ';
const UPLOAD = '/money/fdh/files';

/** การจ่ายยาสมุนไพร: the legacy page (index.php + dashboard.js) in the BackOffice shell. */
export function HerbDashboard({ start, end, presets, periodText, pointBaht, canUpload, showConnectionLink, outcome }: HerbDashboardProps) {
  const summary = outcome.kind === 'data' ? outcome.summary : null;
  const hasData = summary !== null && summary.totals.visits > 0;
  return <section className="money-ttm money-herb">
    <TtmFilter key={`filter-${start}|${end}`} path="/money/herb" start={start} end={end} presets={presets}>
      {canUpload && <Link className="button-secondary" href={UPLOAD} title="ไฟล์ REP ใช้ร่วมกับหน้าติดตามกองทุนย่อย FDH">อัปโหลด REP</Link>}
      {hasData && <button type="button" className="button-secondary" onClick={() => void downloadHerbExport(herbExport(summary, periodText), start, end)}>ดาวน์โหลด Excel</button>}
    </TtmFilter>
    <header className="ttm-banner">
      <div><h2>การจ่ายยาสมุนไพร</h2><p>ยาสมุนไพรทุกรายการ ทุกแผนก (ผู้ป่วยนอกและใน) · {HOSPITAL}</p></div>
      <p className="ttm-date">{periodText}</p>
    </header>
    {outcome.kind === 'error'
      ? (outcome.code === 'NOT_CONFIGURED'
        ? <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP{showConnectionLink && <> · <Link href="/admin/connections">ตั้งค่าการเชื่อมต่อ</Link></>}</p>
        : <p className="money-alert" role="alert">ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง</p>)
      : !hasData
        ? <p className="money-empty">ไม่พบการจ่ายยาสมุนไพรในช่วงวันที่ที่เลือก</p>
        : <HerbBody key={`body-${start}|${end}`} summary={summary} rep={outcome.rep} pointBaht={pointBaht} canUpload={canUpload} />}
  </section>;
}

function OntopCell({ row, pointBaht }: { row: HerbTally; pointBaht: number | null }) {
  const points = herbOntopPoints(row, pointBaht);
  return <>{ttmBaht(row.ontop)}{points && <small>{points}</small>}</>;
}
const Received = ({ value }: { value: number | null }) => (value === null ? <span className="money-muted" title="รอไฟล์ REP">รอ REP</span> : <>{ttmBaht(value)}</>);
function RateTag({ drug }: { drug: HerbDrug }) {
  const rate = herbRateText(drug);
  return rate ? <> <span className="ttm-tag is-herb" title={rate.title}>{rate.text}</span></> : null;
}

function HerbBody({ summary: s, rep, pointBaht, canUpload }: { summary: HerbSummary; rep: HerbRepState; pointBaht: number | null; canUpload: boolean }) {
  const t = s.totals;
  const points = herbOntopPoints(t, pointBaht);
  return <>
    <section className="herb-kpis" aria-label="สรุป">
      <div className="money-kpi"><span>จำนวนครั้ง</span><strong>{herbCount(t.visits)} <em>ครั้ง</em></strong><small>{`${herbCount(t.patients)} คน · ${s.drugs.length} รายการยา`}</small></div>
      <div className="money-kpi"><span>ต้นทุน</span><strong>{ttmBaht(t.cost)} <em>บาท</em></strong><small>จำนวน × ราคาทุน (unitcost)</small></div>
      <div className="money-kpi is-accent"><span>มูลค่าจริง</span><strong>{ttmBaht(t.value)} <em>บาท</em></strong><small>จำนวน × stdprice (ไม่มี → ราคาขายจริง)</small></div>
      <div className="money-kpi"><span>รับจริง (REP)</span><strong>{t.received === null ? 'รอ REP' : <>{ttmBaht(t.received)} <em>บาท</em></>}</strong>
        <small>{rep.kind === 'not-configured'
          ? 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย เปิดไฟล์ REP ไม่ได้'
          : rep.count > 0
            ? `${herbCount(t.receivedVisits)} ครั้งที่พบใน REP · จาก ${herbCount(rep.count)} ไฟล์`
            : <>ยังไม่มีไฟล์{canUpload && <> · <Link href={UPLOAD}>อัปโหลด REP</Link></>}</>}
          {rep.kind === 'files' && rep.unreadable > 0 && <span className="herb-warn">{`${herbCount(rep.unreadable)} ไฟล์เปิดไม่ได้ ติดต่อผู้ดูแลระบบ`}</span>}</small></div>
      <div className="money-kpi"><span>คาดการณ์ ontop (ชดเชยยาสมุนไพร · UC)</span><strong>{ttmBaht(t.ontop)} <em>บาท</em></strong><small>{points ? `${points} (ยังไม่แปลงเป็นบาท)` : 'เฉพาะสิทธิ UC · ชดเชยต่อครั้ง × จำนวนครั้ง'}</small></div>
    </section>
    <HerbDrugChart drugs={s.drugs} />
    <HerbRightsChart summary={s} />
    <HerbRights summary={s} pointBaht={pointBaht} />
    <HerbDrugList summary={s} pointBaht={pointBaht} />
  </>;
}

/** มูลค่าการจ่ายยาสมุนไพร แยกรายยา: มูลค่า/ต้นทุน or จำนวนครั้ง, high to low, ★ for drugs with an ontop rate. */
function HerbDrugChart({ drugs }: { drugs: readonly HerbDrug[] }) {
  const [metric, setMetric] = useState<'value' | 'visits'>('value');
  const list = [...drugs].sort((a, b) => b[metric] - a[metric]);
  const bars = list.map((drug) => {
    const rate = herbRateText(drug);
    return {
      label: `${drug.name}${drug.ontopListed ? ' ★' : ''}`, value: drug[metric], ...(metric === 'value' ? { secondary: drug.cost } : {}),
      note: [`จ่าย ${herbCount(drug.qty)} ${drug.units} · ${herbCount(drug.visits)} ครั้ง · ${herbCount(drug.patients)} คน`, rate ? `★ ${rate.text}` : ''].filter(Boolean).join(' · ')
    };
  });
  return <section className="money-card">
    <div className="money-card-head">
      <h3>มูลค่าการจ่ายยาสมุนไพร แยกรายยา <small>(บาท · เรียงจากมากไปน้อย)</small></h3>
      <div className="money-segmented" role="group" aria-label="ค่าที่แสดง">
        {([['value', 'มูลค่า/ต้นทุน'], ['visits', 'จำนวนครั้ง']] as const).map(([key, label]) => <button key={key} type="button" className={key === metric ? 'is-active' : undefined} aria-pressed={key === metric} onClick={() => setMetric(key)}>{label}</button>)}
      </div>
    </div>
    {metric === 'value'
      ? <BarChart ariaLabel="มูลค่าการจ่ายยาสมุนไพร แยกรายยา" valueFormat={ttmBaht} legend={['มูลค่าจริง (บาท)', 'ต้นทุน (บาท)']} bars={bars} />
      : <BarChart ariaLabel="จำนวนครั้งที่จ่ายยาสมุนไพร แยกรายยา" valueFormat={herbCount} bars={bars} />}
  </section>;
}

/** มูลค่าการจ่ายยาสมุนไพร รายยา แยกสีตามสิทธิ: one stacked bar per drug, the total at its end. */
function HerbRightsChart({ summary: s }: { summary: HerbSummary }) {
  const groups = s.groups.filter((group) => group.visits > 0);
  const values = groups.map((group) => new Map(group.drugs.map((drug) => [drug.icode, drug.value])));
  return <section className="money-card">
    <h3>มูลค่าการจ่ายยาสมุนไพร รายยา แยกสีตามสิทธิการรักษา <small>(ตัวเลขท้ายแท่ง = รวมทุกสิทธิ)</small></h3>
    <GroupedBarChart ariaLabel="มูลค่าการจ่ายยาสมุนไพร รายยา แยกตามสิทธิ" stacked valueFormat={ttmBaht}
      series={groups.map((group) => ({ name: group.name, tone: RIGHT_KEYS.indexOf(group.key) }))}
      groups={s.drugs.map((drug) => ({ label: drug.name, title: `${drug.name}: ${groups.map((group, at) => `${group.name} ${ttmBaht(values[at]!.get(drug.icode) ?? 0)}`).join(' · ')} บาท`, values: values.map((map) => map.get(drug.icode) ?? 0) }))} />
  </section>;
}

function Cells({ row, pointBaht, total }: { row: HerbTally; pointBaht: number | null; total?: boolean }) {
  return <>
    <td className="money-number">{herbCount(row.visits)}</td><td className="money-number">{ttmBaht(row.cost)}</td><td className="money-number">{ttmBaht(row.value)}</td>
    <td className="money-number"><OntopCell row={row} pointBaht={pointBaht} /></td><td className="money-number"><Received value={row.received} /></td>
    <td className={`money-number${total ? ' is-total' : ''}`}>{ttmBaht(row.total)}</td>
  </>;
}

/** The สิทธิ table: each สิทธิ with visits opens its drugs from the button in its row. */
function HerbRights({ summary: s, pointBaht }: { summary: HerbSummary; pointBaht: number | null }) {
  const [open, setOpen] = useState<ReadonlySet<TtmRightGroup>>(new Set());
  const toggle = (key: TtmRightGroup) => setOpen((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const t = s.totals;
  return <section className="money-card">
    <div className="money-table-wrap"><table className="ttm-table herb-rights" aria-label="สรุปตามสิทธิการรักษา">
      <thead><tr><th>สิทธิการรักษา <small>(กดเพื่อดูรายยา)</small></th><th className="money-number">จำนวนครั้ง <small>(ครั้ง)</small></th><th className="money-number">ต้นทุน <small>(บาท)</small></th><th className="money-number">มูลค่าจริง <small>(บาท)</small></th><th className="money-number">คาดการณ์ ontop <small>(ชดเชย บาท)</small></th><th className="money-number">รับจริง <small>(จาก REP)</small></th><th className="money-number">รวม <small>(บาท)</small></th></tr></thead>
      {herbVisibleGroups(s.groups).map((group: HerbGroup) => {
        const isOpen = open.has(group.key);
        return <tbody key={group.key} className={group.visits ? undefined : 'is-empty'}>
          <tr className="herb-group-row">
            <td>{group.visits > 0 ? <button type="button" className="herb-toggle" aria-expanded={isOpen} onClick={() => toggle(group.key)}>{group.name}</button> : group.name}</td>
            <Cells row={group} pointBaht={pointBaht} total />
          </tr>
          {isOpen && group.drugs.map((drug) => <tr key={drug.icode} className="herb-drug-row">
            <td>{drug.name}<RateTag drug={drug} /> <small>{herbCount(drug.qty)} {drug.units}</small></td>
            <Cells row={drug} pointBaht={pointBaht} />
          </tr>)}
        </tbody>;
      })}
      <tfoot><tr><th>รวมทั้งสิ้น</th><th className="money-number">{herbCount(t.visits)}</th><th className="money-number">{ttmBaht(t.cost)}</th><th className="money-number">{ttmBaht(t.value)}</th><th className="money-number"><OntopCell row={t} pointBaht={pointBaht} /></th><th className="money-number"><Received value={t.received} /></th><th className="money-number is-grand">{ttmBaht(t.total)}</th></tr></tfoot>
    </table></div>
  </section>;
}

/** รายยาสมุนไพร with the legacy search box and the note on how each number is made. */
function HerbDrugList({ summary: s, pointBaht }: { summary: HerbSummary; pointBaht: number | null }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => herbSearchDrugs(s.drugs, query), [s.drugs, query]);
  return <section className="money-card">
    <div className="money-card-head">
      <h3>รายยาสมุนไพร <small>({s.drugs.length} รายการ)</small></h3>
      <div className="money-table-filters">
        <input id={`${ids}-q`} type="search" aria-label="ค้นหายา" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อยา / icode" />
      </div>
    </div>
    <p className="visually-hidden" aria-live="polite">{query.trim() ? `พบ ${shown.length} รายการ` : ''}</p>
    <div className="money-table-wrap"><table aria-label="รายยาสมุนไพร">
      <thead><tr><th>icode</th><th>ชื่อยา</th><th className="money-number">จำนวนจ่าย</th><th className="money-number">ครั้ง</th><th className="money-number">คน</th><th className="money-number">ต้นทุน</th><th className="money-number">มูลค่าจริง</th><th className="money-number">ส่วนต่าง</th><th className="money-number">คาดการณ์ ontop</th></tr></thead>
      <tbody>{shown.map((drug) => <tr key={drug.icode}>
        <td>{drug.icode}</td><td>{drug.name}<RateTag drug={drug} /></td>
        <td className="money-number">{herbCount(drug.qty)} <small>{drug.units}</small></td><td className="money-number">{herbCount(drug.visits)}</td><td className="money-number">{herbCount(drug.patients)}</td>
        <td className="money-number">{ttmBaht(drug.cost)}</td><td className="money-number">{ttmBaht(drug.value)}</td><td className="money-number">{ttmBaht(drug.value - drug.cost)}</td>
        <td className="money-number"><OntopCell row={drug} pointBaht={pointBaht} /></td>
      </tr>)}</tbody>
    </table></div>
    <p className="money-note">คาดการณ์ ontop = เฉพาะสิทธิบัตรทอง (UC) ชดเชยต่อครั้ง × จำนวนครั้งที่จ่ายยาตัวนั้น ตามไฟล์ต้นทุนยาสมุนไพร 2570 (นับ 1 ครั้งต่อ visit แม้จ่ายน้อยกว่าจำนวนมาตรฐาน) ยากลุ่ม point แสดงเป็น point จนกว่าจะตั้งอัตรา ·
      รับจริง = คอลัมน์ DRUG ของเคสกองทุนย่อย HERB_FS ในไฟล์ REP (นำเข้าที่หน้าติดตามกองทุนย่อย FDH) เฉพาะยาสมุนไพร แยกรายยาจากชีต Data Drug ชนด้วย VN และ icode · รายงาน REP มีเฉพาะ visit ที่ส่งเบิกแล้ว วันที่ยังไม่ส่งเบิกจะเป็น 0 · รวม = มูลค่าจริง + รับจริง</p>
  </section>;
}
