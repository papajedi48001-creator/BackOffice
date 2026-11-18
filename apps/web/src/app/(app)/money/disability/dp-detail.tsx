'use client';

import type { DpStoredRecord } from '@backoffice/core';
import type { DpStatusRow } from '../../../../lib/money/dp-core';
import { dpDate, isFlagged } from '../../../../lib/money/dp-views';
import { int, money, Pager, paged } from '../fdh/fdh-shared';

export type DpTab = 'list' | 'flag';

/** รายละเอียด: the legacy tabs รายการ (search, service/status tags, 50 per page) and ติดสถานะ (codes). */
export function DpDetail({ tab, onTab, page, onPage, list, flags, service, statusCode, q, onQuery, onClear, onCode, onExport }: {
  tab: DpTab; onTab: (tab: DpTab) => void; page: number; onPage: (page: number) => void; list: readonly DpStoredRecord[]; flags: readonly DpStatusRow[]; service: string; statusCode: string;
  q: string; onQuery: (q: string) => void; onClear: (key: 'service' | 'statusCode') => void; onCode: (code: string) => void; onExport: () => void;
}) {
  const shown = paged(list, page);
  return <section className="money-card" id="dp-detail" aria-label="รายละเอียด">
    <div className="money-card-head">
      <div className="nhso-tabs" role="tablist" aria-label="มุมมองรายละเอียด">
        {([['list', 'รายการ'], ['flag', 'ติดสถานะ']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => onTab(key)}>{label}</button>)}
      </div>
      <button type="button" onClick={onExport}>ดาวน์โหลด Excel</button>
    </div>
    <div role="tabpanel">
      {tab === 'list' && <>
        <div className="fdh-tools">
          <input type="search" className="money-search" value={q} placeholder="ค้นหา HN / ชื่อ / เลขบัตร / เลขที่อ้างอิง / รหัสบริการ" aria-label="ค้นหา" onChange={(event) => { onPage(0); onQuery(event.target.value); }} />
          {service && <span className="fdh-tag">{service} <button type="button" className="link-button" aria-label="ล้างบริการ" onClick={() => { onPage(0); onClear('service'); }}>✕</button></span>}
          {statusCode && <span className="fdh-tag">สถานะ {statusCode} <button type="button" className="link-button" aria-label="ล้างสถานะ" onClick={() => { onPage(0); onClear('statusCode'); }}>✕</button></span>}
        </div>
        <div className="money-table-wrap is-tall"><table aria-label="รายการ"><thead><tr><th>วันที่รับบริการ</th><th>HN</th><th>ชื่อ - สกุล</th><th>สิทธิ</th><th>ประเภท</th><th>รหัส</th><th>ชื่อบริการฟื้นฟู</th>
          <th className="money-number">จำนวน</th><th className="money-number">ขอเบิก</th><th className="money-number">พึงเบิก</th><th>สถานะ</th><th>เลขที่อ้างอิง</th><th>เจ้าหน้าที่</th></tr></thead><tbody>
          {shown.rows.map((x) => <tr key={x.ref}>
            <td className="money-nowrap">{dpDate(x.date)}</td><td className="fdh-mono">{x.hn}</td><td>{x.name}</td><td>{x.right}</td><td>{x.svc_type}</td><td className="fdh-mono">{x.code}</td><td>{x.service}</td>
            <td className="money-number">{int(x.qty)}</td><td className="money-number">{money(x.claim)}</td><td className={`money-number${isFlagged(x) ? ' fdh-muted' : ' fdh-ok'}`}>{money(x.eligible)}</td>
            <td>{isFlagged(x) ? <span className="fdh-code">{x.status}</span> : ''}</td><td className="fdh-mono">{x.ref}</td><td>{x.staff}</td>
          </tr>)}
          {list.length === 0 && <tr><td colSpan={13} className="fdh-muted">ไม่มีรายการ</td></tr>}
        </tbody></table></div>
        {list.length > 0 && <Pager text={`${int(list.length)} รายการ`} page={shown.page} pages={shown.pages} onPage={onPage} />}
      </>}
      {tab === 'flag' && <>
        <p className="money-note">แถวที่ช่อง &quot;สถานะ&quot; ในไฟล์มีรหัส (คำอธิบายรหัสไม่มีในไฟล์) ระบบนับครั้งและราคาขอเบิกตามปกติ แต่ไม่รวมในยอดพึงเบิก · กดรหัสเพื่อดูรายการ</p>
        <div className="money-table-wrap"><table aria-label="ติดสถานะ"><thead><tr><th>รหัสสถานะ</th><th className="money-number">ครั้ง</th><th className="money-number">คน</th><th className="money-number">ขอเบิก</th><th className="money-number">พึงเบิกตามไฟล์</th></tr></thead><tbody>
          {flags.map((row) => <tr key={row.code} className={statusCode === row.code ? 'is-selected' : ''}>
            <td><button type="button" className="link-button" aria-pressed={statusCode === row.code} onClick={() => { onPage(0); onCode(row.code); }}><span className="fdh-code">{row.code}</span></button></td>
            <td className="money-number">{int(row.visits)}</td><td className="money-number">{int(row.persons)}</td><td className="money-number">{money(row.claim)}</td><td className="money-number">{money(row.flaggedEligible)}</td>
          </tr>)}
          {flags.length === 0 && <tr><td colSpan={5} className="fdh-muted">ไม่มีแถวที่ติดสถานะในช่วงนี้</td></tr>}
        </tbody></table></div>
      </>}
    </div>
  </section>;
}
