import Link from 'next/link';
import { TTM_CATEGORIES, TTM_RIGHT_GROUPS, type TtmCategory } from '@backoffice/core';
import { ttmConfigText } from '../../../../../lib/money/ttm-config';
import { ttmBaht, ttmNum } from '../../../../../lib/money/ttm-views';
import { moneyContext, MoneyPageMessage } from '../../money-page';
import { TtmFilter } from '../ttm-filter';
import { loadTtmPage } from '../ttm-load';
import { TtmItemTable } from './ttm-item-table';

export const dynamic = 'force-dynamic';
const TITLE = 'ตรวจสอบการจับคู่รหัส · แพทย์แผนไทย';

/** ตรวจสอบการจับคู่รหัส: what each icode, income and pttype counts as (legacy mapping.php). Same rights as the dashboard. */
export default async function TtmMappingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext({ page: 'ttm' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const { start, end, presets, rules, outcome } = await loadTtmPage(context.database, await searchParams);
  const query = new URLSearchParams({ start, end }).toString();
  const s = outcome.kind === 'data' ? outcome.summary : null;
  return <section className="money-ttm">
    <h2>{TITLE}</h2>
    <TtmFilter key={`${start}|${end}`} path="/money/ttm/mapping" start={start} end={end} presets={presets}>
      <Link className="button-secondary" href={`/money/ttm?${query}`}>← กลับ dashboard</Link>
    </TtmFilter>
    <p className="money-period">หน้านี้แสดงว่าระบบนับรายการไหนเป็นหมวดไหน ใช้เทียบกับรายงานประจำวันของกลุ่มงาน ถ้าไม่ตรงให้ผู้ดูแลระบบตั้งค่า <code>TTM_*</code> ในค่าตั้งของเซิร์ฟเวอร์แล้วเริ่มระบบใหม่ · ระบบอ่านข้อมูลจาก HOSxP อย่างเดียว ไม่แก้ไขฐานข้อมูล</p>
    <section className="money-card">
      <h3>ค่าที่ตั้งไว้ตอนนี้</h3>
      <pre className="ttm-config">{ttmConfigText(rules)}</pre>
    </section>
    {outcome.kind === 'error'
      ? <p className="money-alert" role="alert">{outcome.code === 'NOT_CONFIGURED' ? 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP' : 'ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง'}</p>
      : s!.visits === 0
        ? <p className="money-empty">ไม่พบผู้รับบริการแพทย์แผนไทยในช่วงวันที่ที่เลือก</p>
        : <>
          <section className="money-kpis" aria-label="สรุป">
            <div className="money-kpi"><span>ค่านวด/หัตถการ</span><strong>{ttmBaht(s!.totals.massage)}</strong></div>
            <div className="money-kpi"><span>ค่ายาสมุนไพร</span><strong>{ttmBaht(s!.totals.herb)}</strong></div>
            <div className="money-kpi"><span>ค่าบริการผู้ป่วยนอก</span><strong>{ttmBaht(s!.totals.opdFee)}</strong></div>
            <div className="money-kpi is-accent"><span>ไม่นับ (รายการอื่นใน visit เดียวกัน)</span><strong>{ttmBaht(s!.incomeStats.reduce((total, income) => total + income.byCategory.none, 0))}</strong></div>
          </section>
          <section className="money-card">
            <h3>แยกตามหมวดรายได้ (income) <small>ใส่รหัสใน TTM_MASSAGE_INCOME / TTM_HERB_INCOME</small></h3>
            <div className="money-table-wrap"><table aria-label="แยกตามหมวดรายได้">
              <thead><tr><th>income</th><th>ชื่อหมวด</th><th className="money-number">รวม</th><th className="money-number">ค่านวด/หัตถการ</th><th className="money-number">ยาสมุนไพร</th><th className="money-number">ค่าบริการ OPD</th><th className="money-number">ไม่นับ</th></tr></thead>
              <tbody>{s!.incomeStats.map((income) => <tr key={income.income}><td><span className="money-code">{income.income}</span></td><td>{income.name}</td><td className="money-number">{ttmBaht(income.amount)}</td>
                {(['massage', 'herb', 'opd_fee', 'none'] as const).map((key) => <td key={key} className="money-number">{ttmBaht(income.byCategory[key])}</td>)}</tr>)}</tbody>
            </table></div>
          </section>
          <section className="money-card">
            <TtmItemTable items={s!.itemStats} categories={TTM_CATEGORIES as Record<TtmCategory, string>} />
          </section>
          <div className="money-grid-2">
            <section className="money-card">
              <h3>สิทธิ (pttype) → กลุ่มสิทธิ <small>แก้ด้วย TTM_RIGHT_MAP</small></h3>
              <div className="money-table-wrap"><table aria-label="สิทธิ → กลุ่มสิทธิ">
                <thead><tr><th>pttype</th><th>ชื่อสิทธิ</th><th>hipdata</th><th>กลุ่มบนรายงาน</th><th className="money-number">คน</th></tr></thead>
                <tbody>{s!.rights.map((right) => <tr key={right.pttype}><td><span className="money-code">{right.pttype}</span></td><td>{right.name}</td><td>{right.hipdata}</td><td>{TTM_RIGHT_GROUPS[right.group]} <small className="money-code">{right.group}</small></td><td className="money-number">{ttmNum(right.patients)}</td></tr>)}</tbody>
              </table></div>
            </section>
            <section className="money-card">
              <h3>ประเภทบริการ</h3>
              <div className="money-table-wrap"><table aria-label="ประเภทบริการ">
                <thead><tr><th>type_id</th><th>ประเภทบริการ</th><th className="money-number">รายการ</th><th className="money-number">คน</th></tr></thead>
                <tbody>{s!.byType.map((type) => <tr key={type.name}><td><span className="money-code">{type.id ?? ''}</span></td><td>{type.name}</td><td className="money-number">{ttmNum(type.count)}</td><td className="money-number">{ttmNum(type.patients)}</td></tr>)}</tbody>
              </table></div>
            </section>
          </div>
        </>}
  </section>;
}
