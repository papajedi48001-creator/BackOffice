'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ImcOverview } from '@backoffice/core';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { imcAutoUnit, imcBuckets, imcDate, imcInRange, imcPresets, imcRemain, type ImcGroup, type ImcUnit } from '../../../../lib/money/imc-views';
import { int, money } from '../fdh/fdh-shared';
import { ImcUpload } from './imc-upload';

type Payload = ImcOverview & { updatedAt: string | null };
type Filter = 'all' | Exclude<ImcGroup, 'ok'>;
const FILTERS: [Filter, string][] = [['all', 'ทั้งหมด'], ['soon', '≤ 30 วัน'], ['mid', '31–60 วัน'], ['done', 'ครบกำหนดแล้ว']];
type ChartUnit = 'auto' | ImcUnit;
const UNITS: [ChartUnit, string][] = [['auto', 'อัตโนมัติ'], ['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปีงบ']];
const RING = 2 * Math.PI * 31;
const DAY = 86_400_000;
/** "Traumatic brain injury (TBI)" → "TBI" for the summary card. */
const short = (disease: string) => /\(([^)]+)\)\s*$/.exec(disease)?.[1] ?? disease;
const stamp = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: [T, string][]; value: T; onChange: (value: T) => void }) {
  return <div className="money-segmented" role="group" aria-label={label}>
    {items.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

/**
 * Monitor IMC (กองทุนฟื้นฟูสมรรถภาพ): summary cards, ผู้ป่วยในทะเบียน cards with the days left to วันที่ครบกำหนดการให้บริการ,
 * รายละเอียดรายบุคคล, the claim chart (รายวัน / รายเดือน / รายปีงบ) and เรียกเก็บเทียบ REP. ผู้ดูแล Smart Money also get นำเข้าไฟล์ IMC.
 */
export function ImcMonitor({ canManage, today = bangkokToday() }: { canManage: boolean; today?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failure, setFailure] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [hideDone, setHideDone] = useState(true);
  const [unit, setUnit] = useState<ChartUnit>('auto');
  const [picked, setPicked] = useState<{ from: string; to: string } | null>(null);
  const [opened, setOpened] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailure('');
    try {
      const response = await fetch('/api/money/disability/imc', { cache: 'no-store' });
      const body = (await response.json()) as Partial<Payload> & { error?: string; message?: string };
      if (!response.ok || !body.persons) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      setData(body as Payload);
    } catch (error) {
      setFailure(`โหลดข้อมูล IMC ไม่ได้: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The range bar sticks just under the module tabs, whose height depends on how many rows they wrap to.
  const [stickTop, setStickTop] = useState<number | undefined>(undefined);
  useEffect(() => {
    const tabs = document.querySelector<HTMLElement>('.module-subnav');
    if (!tabs || typeof ResizeObserver === 'undefined') return;
    const place = () => {
      const style = getComputedStyle(tabs);
      setStickTop(style.position === 'sticky' ? (parseFloat(style.top) || 0) + tabs.getBoundingClientRect().height + 6 : undefined);
    };
    const watch = new ResizeObserver(place);
    watch.observe(tabs);
    return () => watch.disconnect();
  }, []);

  const persons = useMemo(() => (data?.persons ?? []).map((person) => ({ ...person, remain: imcRemain(person, today) })), [data, today]);
  const doneCount = persons.filter((person) => person.remain.group === 'done').length;
  const inCare = hideDone ? persons.filter((person) => person.remain.group !== 'done') : persons;
  const shown = inCare.filter((person) => filter === 'all' || person.remain.group === filter);
  // Asking for ครบกำหนดแล้ว means wanting to see them, so the switch turns off.
  const pickFilter = (next: Filter) => { setFilter(next); if (next === 'done') setHideDone(false); };
  const presets = useMemo(() => imcPresets(today, data?.lines[0]?.date ?? '', data?.lines.at(-1)?.date ?? ''), [data, today]);
  // The range starts on ทั้งหมด, so the page opens showing everything, as it did before the range bar.
  const { from, to } = picked ?? presets[0]!;
  const range = useMemo(() => imcInRange({ lines: data?.lines ?? [], reps: data?.reps ?? [] }, from, to), [data, from, to]);
  const drawn = unit === 'auto' ? imcAutoUnit(from, to) : unit;
  const groups = useMemo(() => (data ? imcBuckets(data.lines, data.services, drawn, { from, to }) : []), [data, drawn, from, to]);
  const serviceName = new Map((data?.services ?? []).map((service) => [service.code, service.name]));
  const inRange = (id: number) => range.people.get(id) ?? { visits: 0, claim: 0, paid: 0, repNos: [], lines: [] };
  const totals = data?.totals;

  return <section className="money-card imc" aria-labelledby="imc-title">
    <div className="imc-head">
      <h3 id="imc-title">Monitor IMC</h3>
      <span className="money-note" role="status">{data === null ? (failure ? '' : 'กำลังโหลดข้อมูล...') : data.updatedAt ? `ปรับปรุงล่าสุด ${stamp.format(new Date(data.updatedAt))}` : ''}</span>
      {canManage && <ImcUpload onDone={() => void load()} />}
    </div>
    {failure && <p className="money-alert" role="alert">{failure}</p>}
    {data !== null && persons.length === 0 && <div className="money-empty"><h4>ยังไม่มีข้อมูล IMC</h4>
      <p>{canManage ? 'กด "นำเข้าไฟล์ IMC" แล้วเลือกไฟล์ทะเบียนคนไข้ IMC (.csv) และไฟล์ REP (.xlsx)' : 'ติดต่อผู้ดูแล Smart Money เพื่อนำเข้าไฟล์ IMC'}</p></div>}

    {totals && persons.length > 0 && <>
      <div className="imc-range" role="group" aria-label="ช่วงวันที่" style={stickTop === undefined ? undefined : { top: stickTop }}>
        <ThaiDateInput aria-label="ตั้งแต่วันที่" value={from} max={to} onChange={(day) => { if (day) setPicked({ from: day, to }); }} />
        <span>ถึง</span>
        <ThaiDateInput aria-label="ถึงวันที่" value={to} min={from} onChange={(day) => { if (day) setPicked({ from, to: day }); }} />
        <div className="imc-range-shortcuts" role="group" aria-label="ช่วงลัด">
          {presets.map((preset) => { const on = preset.from === from && preset.to === to;
            return <button key={preset.key} type="button" className={on ? 'is-active' : ''} aria-pressed={on} onClick={() => setPicked({ from: preset.from, to: preset.to })}>{preset.label}</button>; })}
        </div>
      </div>
      <section className="money-kpis imc-kpis" aria-label="สรุป IMC">
        <div className="money-kpi"><span>ทะเบียน IMC</span><strong>{int(totals.people)} <em>คน</em></strong><small>{totals.diseases.map(([name, count]) => `${short(name)} ${int(count)}`).join(' · ')}</small></div>
        <div className="money-kpi"><span>เรียกเก็บ IMC</span><strong>{money(range.claim)} <em>บาท</em></strong><small>{`${int(range.visits)} ครั้ง${range.pending ? ` (รอประมวลผล ${int(range.pending)})` : ''}`}</small></div>
        <div className="money-kpi is-accent"><span>REP</span><strong>{money(range.paid)} <em>บาท</em></strong><small>{`ยังไม่มี REP ${money(range.noRep)} บาท`}{range.repOutside ? ` · ${int(range.repOutside)} รายการไม่อยู่ในทะเบียน` : ''}</small></div>
        <div className="money-kpi"><span>ใกล้ครบกำหนด (≤ 30 วัน)</span><strong>{int(persons.filter((person) => person.remain.group === 'soon').length)} <em>คน</em></strong><small>นัดให้บริการก่อนครบกำหนด</small></div>
      </section>

      <section className="imc-block" aria-labelledby="imc-people-title">
        <div className="imc-block-head"><h4 id="imc-people-title">ผู้ป่วยในทะเบียน</h4>
          <div className="imc-tools">
            <label className="imc-switch"><input type="checkbox" role="switch" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />{`ซ่อนคนที่จำหน่าย/ครบกำหนดแล้ว (${int(doneCount)})`}</label>
            <Segmented label="กรองผู้ป่วย" items={FILTERS} value={filter} onChange={pickFilter} />
          </div></div>
        <ul className="imc-cards" aria-label="ผู้ป่วยในทะเบียน">
          {shown.map((person, index) => {
            const span = person.due && person.discharge ? Math.max(1, (Date.parse(person.due) - Date.parse(person.discharge)) / DAY) : 1;
            const part = person.remain.group === 'done' ? 0 : Math.min(1, Math.max(0, person.remain.days / span));
            return <li key={person.id} className={`imc-person is-${person.remain.tone}`} style={{ '--i': index } as React.CSSProperties}>
              <svg className="imc-ring" viewBox="0 0 74 74" aria-hidden="true"><circle className="imc-ring-track" cx="37" cy="37" r="31" />
                <circle className="imc-ring-fill" cx="37" cy="37" r="31" strokeDasharray={RING} strokeDashoffset={RING * (1 - part)} />
                <text x="37" y="38" textAnchor="middle">{Math.max(0, person.remain.days)}</text><text className="imc-ring-unit" x="37" y="51" textAnchor="middle">วัน</text></svg>
              <div className="imc-person-body">
                <h5>{person.name}</h5>
                <small>{person.disease || '-'}</small>
                <small>{`จำหน่าย ${imcDate(person.discharge)} · ครบ ${imcDate(person.due)}`}</small>
                <small><span className={`imc-tag is-${person.remain.tone}`}>{person.remain.text}</span>{` · ${int(person.visits)} ครั้ง · ${int(person.claim)} บาท`}</small>
              </div>
            </li>;
          })}
          {shown.length === 0 && <li className="imc-none">ไม่มีผู้ป่วยในกลุ่มนี้</li>}
        </ul>
        {hideDone && doneCount > 0 && <p className="imc-hidden-note">{`ซ่อนอยู่ ${int(doneCount)} คน`}</p>}
      </section>

      <section className="imc-block" aria-labelledby="imc-detail-title">
        <h4 id="imc-detail-title">รายละเอียดรายบุคคล</h4>
        <div className="money-table-wrap"><table aria-label="รายละเอียดรายบุคคล"><thead><tr><th className="money-number">ลำดับ</th><th>ชื่อ-สกุล</th><th>วันเริ่มป่วย</th><th>วันจำหน่าย</th><th>เหลืออีก</th><th className="money-number">เรียกเก็บ</th><th className="money-number">บาท</th></tr></thead><tbody>
          {inCare.map((person, index) => { const own = inRange(person.id); const isOpen = opened === person.id;
            const toggle = () => setOpened(isOpen ? null : person.id);
            return <Fragment key={person.id}>
              <tr className={`imc-row${isOpen ? ' is-open' : ''}`} onClick={toggle}>
                <td className="money-number">{index + 1}</td>
                <td><button type="button" className="imc-row-toggle" aria-expanded={isOpen} onClick={(event) => { event.stopPropagation(); toggle(); }}>{person.name}</button><br /><small className="fdh-muted">{person.disease}</small></td>
                <td>{imcDate(person.onset)}</td><td>{imcDate(person.discharge)}</td>
                <td><span className={`imc-tag is-${person.remain.tone}`}>{person.remain.text}</span></td><td className="money-number">{`${int(own.visits)} ครั้ง`}</td><td className="money-number">{money(own.claim)}</td></tr>
              {isOpen && <tr className="imc-lines-row"><td colSpan={7}>
                {own.lines.length === 0 ? <p className="imc-none">ไม่มีการเรียกเก็บในช่วงนี้</p>
                  : <table className="imc-lines" aria-label={`รายการเรียกเก็บ ${person.name}`}><thead><tr><th>วันที่รับบริการ</th><th>รหัสบริการ</th><th>บริการ</th><th className="money-number">เรียกเก็บ (บาท)</th><th>สถานะ</th><th>REP NO</th></tr></thead><tbody>
                    {[...own.lines].reverse().map((line, at) => <tr key={at}><td>{imcDate(line.date)}</td><td className="fdh-mono">{line.code}</td><td>{serviceName.get(line.code) ?? line.code}</td>
                      <td className="money-number">{money(line.claim)}</td><td>{line.pending ? <span className="imc-tag is-warn">รอประมวลผล</span> : ''}</td>
                      <td className="fdh-mono">{line.repNo || <span className="imc-tag is-warn">ยังไม่มี REP</span>}</td></tr>)}
                  </tbody><tfoot><tr><th colSpan={3}>{`รวม ${int(own.visits)} ครั้ง`}</th><th className="money-number">{money(own.claim)}</th><th></th><th>{`REP ${money(own.paid)}`}</th></tr></tfoot></table>}
              </td></tr>}
            </Fragment>; })}
        </tbody></table></div>
      </section>

      <section className="imc-block" aria-labelledby="imc-chart-title">
        <div className="imc-block-head"><h4 id="imc-chart-title">การเรียกเก็บ IMC</h4><Segmented label="กราฟราย" items={UNITS} value={unit} onChange={setUnit} /></div>
        <GroupedBarChart ariaLabel="กราฟการเรียกเก็บ IMC" valueFormat={int} axisTitle={drawn === 'year' ? 'ปีงบประมาณ' : undefined} emptyText="ไม่มีการเรียกเก็บในช่วงนี้"
          series={data!.services.map((service, index) => ({ name: service.name, tone: index }))} groups={groups} />
      </section>

      <section className="imc-block" aria-labelledby="imc-rep-title">
        <h4 id="imc-rep-title">เรียกเก็บเทียบ REP</h4>
        <div className="money-table-wrap"><table aria-label="เรียกเก็บเทียบ REP"><thead><tr><th className="money-number">ลำดับ</th><th>ชื่อ-สกุล</th><th className="money-number">เรียกเก็บ (บาท)</th><th className="money-number">REP (บาท)</th><th>REP NO</th></tr></thead><tbody>
          {persons.map((person, index) => { const own = inRange(person.id); return <tr key={person.id}>
            <td className="money-number">{index + 1}</td><td>{person.name}</td><td className="money-number">{money(own.claim)}</td>
            <td className="money-number">{own.repNos.length ? money(own.paid) : <span className="imc-tag is-warn">ยังไม่มี REP</span>}</td><td className="fdh-mono">{own.repNos.join(', ') || '-'}</td></tr>; })}
        </tbody><tfoot><tr><th></th><th>{`รวม ${int(persons.length)} คน`}</th><th className="money-number">{money(range.claim)}</th><th className="money-number">{money(persons.reduce((sum, person) => sum + inRange(person.id).paid, 0))}</th><th></th></tr></tfoot></table></div>
      </section>
    </>}
  </section>;
}
