'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImcOverview } from '@backoffice/core';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { imcBuckets, imcDate, imcRemain, type ImcGroup, type ImcUnit } from '../../../../lib/money/imc-views';
import { int, money } from '../fdh/fdh-shared';
import { ImcUpload } from './imc-upload';

type Payload = ImcOverview & { updatedAt: string | null };
type Filter = 'all' | Exclude<ImcGroup, 'ok'>;
const FILTERS: [Filter, string][] = [['all', 'ทั้งหมด'], ['soon', '≤ 30 วัน'], ['mid', '31–60 วัน'], ['done', 'ครบกำหนดแล้ว']];
const UNITS: [ImcUnit, string][] = [['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปี']];
const RING = 2 * Math.PI * 31;
const DAY = 86_400_000;
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
  const [unit, setUnit] = useState<ImcUnit>('month');

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

  const persons = useMemo(() => (data?.persons ?? []).map((person) => ({ ...person, remain: imcRemain(person, today) })), [data, today]);
  const shown = persons.filter((person) => filter === 'all' || person.remain.group === filter);
  const groups = useMemo(() => (data ? imcBuckets(data.lines, data.services, unit) : []), [data, unit]);
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
      <section className="money-kpis imc-kpis" aria-label="สรุป IMC">
        <div className="money-kpi"><span>ทะเบียน IMC</span><strong>{int(totals.people)} <em>คน</em></strong><small>{totals.diseases.map(([name, count]) => `${name} ${int(count)}`).join(' · ')}</small></div>
        <div className="money-kpi"><span>เรียกเก็บ IMC</span><strong>{money(totals.claim)} <em>บาท</em></strong><small>{`${int(totals.visits)} ครั้ง${totals.pending ? ` (รอประมวลผล ${int(totals.pending)})` : ''}`}</small></div>
        <div className="money-kpi is-accent"><span>REP</span><strong>{money(totals.paid)} <em>บาท</em></strong><small>{`ยังไม่มี REP ${money(totals.noRep)} บาท`}{totals.repOutside ? ` · ${int(totals.repOutside)} รายการไม่อยู่ในทะเบียน` : ''}</small></div>
        <div className="money-kpi"><span>ใกล้ครบกำหนด (≤ 30 วัน)</span><strong>{int(persons.filter((person) => person.remain.group === 'soon').length)} <em>คน</em></strong><small>นัดให้บริการก่อนครบกำหนด</small></div>
      </section>

      <section className="imc-block" aria-labelledby="imc-people-title">
        <div className="imc-block-head"><h4 id="imc-people-title">ผู้ป่วยในทะเบียน</h4><Segmented label="กรองผู้ป่วย" items={FILTERS} value={filter} onChange={setFilter} /></div>
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
      </section>

      <section className="imc-block" aria-labelledby="imc-detail-title">
        <h4 id="imc-detail-title">รายละเอียดรายบุคคล</h4>
        <div className="money-table-wrap"><table aria-label="รายละเอียดรายบุคคล"><thead><tr><th className="money-number">ลำดับ</th><th>ชื่อ-สกุล</th><th>วันเริ่มป่วย</th><th>วันจำหน่าย</th><th>เหลืออีก</th><th className="money-number">เรียกเก็บ</th></tr></thead><tbody>
          {persons.map((person, index) => <tr key={person.id}>
            <td className="money-number">{index + 1}</td><td>{person.name}<br /><small className="fdh-muted">{person.disease}</small></td><td>{imcDate(person.onset)}</td><td>{imcDate(person.discharge)}</td>
            <td><span className={`imc-tag is-${person.remain.tone}`}>{person.remain.text}</span></td><td className="money-number">{`${int(person.visits)} ครั้ง`}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className="imc-block" aria-labelledby="imc-chart-title">
        <div className="imc-block-head"><h4 id="imc-chart-title">การเรียกเก็บ IMC</h4><Segmented label="ช่วงเวลา" items={UNITS} value={unit} onChange={setUnit} /></div>
        <GroupedBarChart ariaLabel="กราฟการเรียกเก็บ IMC" valueFormat={int} axisTitle={unit === 'year' ? 'ปีงบประมาณ' : undefined}
          series={data!.services.map((service, index) => ({ name: service.name, tone: index }))} groups={groups} />
      </section>

      <section className="imc-block" aria-labelledby="imc-rep-title">
        <h4 id="imc-rep-title">เรียกเก็บเทียบ REP</h4>
        <div className="money-table-wrap"><table aria-label="เรียกเก็บเทียบ REP"><thead><tr><th className="money-number">ลำดับ</th><th>ชื่อ-สกุล</th><th className="money-number">เรียกเก็บ (บาท)</th><th className="money-number">REP (บาท)</th><th>REP NO</th></tr></thead><tbody>
          {persons.map((person, index) => <tr key={person.id}>
            <td className="money-number">{index + 1}</td><td>{person.name}</td><td className="money-number">{money(person.claim)}</td>
            <td className="money-number">{person.repNos.length ? money(person.paid) : <span className="imc-tag is-warn">ยังไม่มี REP</span>}</td><td className="fdh-mono">{person.repNos.join(', ') || '-'}</td></tr>)}
        </tbody><tfoot><tr><th></th><th>{`รวม ${int(persons.length)} คน`}</th><th className="money-number">{money(totals.claim)}</th><th className="money-number">{money(persons.reduce((sum, person) => sum + person.paid, 0))}</th><th></th></tr></tfoot></table></div>
      </section>
    </>}
  </section>;
}
