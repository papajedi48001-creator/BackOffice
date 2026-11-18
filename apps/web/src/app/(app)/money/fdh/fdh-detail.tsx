'use client';

import { useMemo, useState } from 'react';
import { byPersonFund, type ErrorGroup, type FdhCase, type FundVisitGroup, type PersonFundGroup } from '../../../../lib/money/fdh-core';
import { fdhDate, fundRowMatches, personMatches } from '../../../../lib/money/fdh-views';
import type { FdhOpen } from './fdh-dialog';
import { int, money, Pager, paged, StatusBadge } from './fdh-shared';

export type FdhTab = 'cases' | 'people' | 'funds' | 'errors';
const TABS: [FdhTab, string][] = [['cases', 'รายเคส'], ['people', 'รายบุคคล'], ['funds', 'รายกองทุนย่อย'], ['errors', 'Error Code']];

function Cases({ view, q, onQuery, chips, onOpen }: { view: readonly FdhCase[]; q: string; onQuery: (q: string) => void; chips: React.ReactNode; onOpen: (open: FdhOpen) => void }) {
  const [page, setPage] = useState(0);
  const shown = paged(view, page);
  return <>
    <div className="fdh-tools">
      <input type="search" className="money-search" value={q} placeholder="ค้นหา VN / HN / ชื่อ / PID / TRAN_ID" aria-label="ค้นหา" onChange={(event) => { setPage(0); onQuery(event.target.value); }} />
      {chips}
    </div>
    <div className="money-table-wrap is-tall"><table aria-label="รายเคส"><thead><tr><th>สถานะ</th><th>VN</th><th>วันรับบริการ</th><th>HN</th><th>ชื่อ - สกุล</th><th>สิทธิ</th><th>กองทุนย่อย</th>
      <th className="money-number">เรียกเก็บ</th><th className="money-number">ชดเชย REP</th><th className="money-number">ได้รับ STM</th><th className="money-number">ส่วนต่าง</th><th>Error</th><th>REP No.</th><th>งวด STM</th></tr></thead><tbody>
      {shown.rows.map((c) => <tr key={c.seq}>
        <td><StatusBadge status={c.status} />{c.fixedC && <span className="fdh-tag is-fixed" title="เคยติด C แล้ว REP ใหม่ผ่าน">แก้แล้ว</span>}</td>
        <td><button type="button" className="link-button fdh-mono" onClick={() => onOpen({ kind: 'case', case: c })}>{c.seq}</button></td>
        <td className="money-nowrap">{fdhDate(c.visitDate)}</td><td>{c.hn}</td><td>{c.name}</td><td>{c.right}</td>
        <td>{c.subFunds.map((fund) => <span key={fund} className="fdh-tag">{fund}</span>)}</td>
        <td className="money-number">{money(c.charge)}</td><td className="money-number">{money(c.repNet)}</td>
        <td className="money-number">{c.stm.length ? money(c.stmTotal) : <span className="fdh-muted">-</span>}</td>
        <td className={`money-number${c.diff ? ' fdh-bad' : ' fdh-muted'}`}>{c.stm.length && c.current ? money(c.diff) : '-'}</td>
        <td>{c.errorCode && <span className="money-code">{c.errorCode}</span>}</td>
        <td>{c.current ? <>{String(c.current.rep_no ?? '')}{c.history.length > 0 && <small className="fdh-muted"> +{c.history.length}</small>}</> : '-'}</td>
        <td>{c.periods.join(', ') || '-'}</td></tr>)}
      {shown.rows.length === 0 && <tr><td colSpan={14} className="fdh-muted">ไม่พบเคสตามตัวกรอง</td></tr>}
    </tbody></table></div>
    <Pager text={`${int(view.length)} เคส`} page={shown.page} pages={shown.pages} onPage={setPage} />
  </>;
}

export type PeopleQuery = { q: string; sub: string };

/** รายบุคคล rows as searched: also what the Excel sheet รายบุคคลแยกกองทุน holds (legacy `people.filter(personMatches)`). */
export function peopleRows(cases: readonly FdhCase[], query: PeopleQuery): { subs: string[]; only: string; list: PersonFundGroup[] } {
  const subs = [...new Set(cases.flatMap((c) => c.subFunds))].sort();
  const only = subs.includes(query.sub) ? query.sub : '';
  return { subs, only, list: byPersonFund(cases, only).filter((p) => personMatches(p, query.q.trim())) };
}

function People({ cases, query, onQuery, onOpen }: { cases: readonly FdhCase[]; query: PeopleQuery; onQuery: (query: PeopleQuery) => void; onOpen: (open: FdhOpen) => void }) {
  const [page, setPage] = useState(0);
  const { subs, only, list } = useMemo(() => peopleRows(cases, query), [cases, query]);
  const q = query.q;
  const setQ = (value: string) => onQuery({ ...query, q: value });
  const setSub = (value: string) => onQuery({ ...query, sub: value });
  const shown = paged(list, page);
  let previous: string | null = null;
  return <>
    <div className="fdh-tools">
      <input type="search" className="money-search" value={q} placeholder="ค้นหา HN / ชื่อ / PID" aria-label="ค้นหารายบุคคล" onChange={(event) => { setQ(event.target.value); setPage(0); }} />
      <select aria-label="กองทุนย่อย (REP)" value={only} onChange={(event) => { setSub(event.target.value); setPage(0); }}>
        <option value="">ทุกกองทุนย่อย (REP)</option>{subs.map((fund) => <option key={fund} value={fund}>{fund}</option>)}
      </select>
    </div>
    <p className="money-note">กองทุนย่อยตามชื่อในไฟล์ REP คอลัมน์ P · ยอดได้รับชนกับ STM ด้วย SEQ (คอลัมน์ AP) · ยอดกองทุนนี้แยกจากคอลัมน์เงินของ STM (OP, AE, PP ...) ถ้าหลายกองทุนใน VN เดียวลงคอลัมน์เดียวกัน จะแสดงเป็นยอดรวมกับกองทุนอื่น · กดกองทุนย่อยเพื่อดูทุก visit</p>
    <div className="money-table-wrap is-tall"><table aria-label="รายบุคคล"><thead><tr><th>HN</th><th>ชื่อ - สกุล</th><th>สิทธิ</th><th>กองทุนย่อย (REP)</th><th className="money-number">ครั้ง</th><th className="money-number">เรียกเก็บ</th>
      <th className="money-number">ชดเชย REP<br /><small>ทั้ง visit</small></th><th className="money-number">ได้รับ STM<br /><small>กองทุนนี้</small></th><th className="money-number" title="กองทุนที่ลงคอลัมน์ STM เดียวกับกองทุนอื่น แยกยอดไม่ได้">ยอดรวมกับ<br /><small>กองทุนอื่น</small></th><th className="money-number">รอ STM<br /><small>(ครั้ง)</small></th></tr></thead><tbody>
      {shown.rows.map((p) => {
        const first = p.personKey !== previous; previous = p.personKey;
        return <tr key={p.key} className={first ? 'fdh-first' : 'fdh-cont'}>
          <td>{first ? p.hn || '-' : ''}</td><td>{first ? p.name : ''}</td><td>{first ? p.right : ''}</td>
          <td><button type="button" className="link-button fdh-tag" onClick={() => onOpen({ kind: 'person', person: p })}>{p.subFund}</button></td>
          <td className="money-number">{int(p.visits)}</td><td className="money-number">{money(p.charge)}</td><td className="money-number">{money(p.repNet)}</td>
          <td className="money-number fdh-ok">{money(p.stmFund)}</td>
          <td className={`money-number${p.stmShared ? '' : ' fdh-muted'}`}>{p.stmShared ? money(p.stmShared) : '-'}</td>
          <td className={`money-number${p.pending ? '' : ' fdh-muted'}`}>{p.pending ? int(p.pending) : '-'}</td></tr>;
      })}
      {shown.rows.length === 0 && <tr><td colSpan={10} className="fdh-muted">ไม่พบข้อมูลตามตัวกรอง</td></tr>}
    </tbody></table></div>
    <Pager text={`${int(new Set(list.map((p) => p.personKey)).size)} คน · ${int(list.length)} แถว (คน × กองทุน)`} page={shown.page} pages={shown.pages} onPage={setPage} />
  </>;
}

function Funds({ funds, onOpen }: { funds: readonly FundVisitGroup[]; onOpen: (open: FdhOpen) => void }) {
  const [chosen, setChosen] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const current = funds.find((g) => g.subFund === chosen) ?? funds[0] ?? null;
  const list = current ? current.rows.filter((row) => fundRowMatches(row, q.trim())) : [];
  const shown = paged(list, page);
  let previous: string | null = null;
  return <>
    <p className="money-note">กองทุนย่อยตามชื่อในไฟล์ REP คอลัมน์ P · ยอดได้รับชนกับ STM ด้วย SEQ (คอลัมน์ AP) แล้วแยกตามคอลัมน์เงินของ STM · กดกองทุนเพื่อดู HN / VN ที่เบิกกองทุนนั้น · กด VN เพื่อดูรายละเอียด</p>
    <ul className="fdh-fund-chips" aria-label="กองทุนย่อย">
      {funds.map((g) => <li key={g.subFund}><button type="button" className={`fdh-fund-chip${g === current ? ' is-on' : ''}`} aria-pressed={g === current} onClick={() => { setChosen(g.subFund); setPage(0); }}>
        <b>{g.subFund}</b><span>{int(g.persons)} HN · {int(g.visits)} VN</span>
        <span className="fdh-amount">{money(g.stmFund)}{g.stmShared ? <small title="ยอดที่ลงคอลัมน์ STM ร่วมกับกองทุนอื่น"> +ร่วม {money(g.stmShared)}</small> : null}</span>
      </button></li>)}
    </ul>
    {funds.length === 0 && <p className="fdh-muted">ไม่พบข้อมูลตามตัวกรอง</p>}
    {current && <>
      <div className="fdh-tools">
        <h3 className="fdh-fund-title"><span className="fdh-tag">{current.subFund}</span> <small className="fdh-muted">{int(current.persons)} HN · {int(current.visits)} VN · ชดเชย REP {money(current.repNet)} · ได้รับ STM {money(current.stmFund)}{current.stmShared ? ` (+ร่วม ${money(current.stmShared)})` : ''}{current.pending ? ` · รอ STM ${int(current.pending)} VN` : ''}</small></h3>
        <input type="search" className="money-search" value={q} placeholder="ค้นหา HN / ชื่อ / PID / VN" aria-label="ค้นหาในกองทุนนี้" onChange={(event) => { setQ(event.target.value); setPage(0); }} />
      </div>
      <div className="money-table-wrap is-tall"><table aria-label="HN / VN ของกองทุนนี้"><thead><tr><th>HN</th><th>ชื่อ - สกุล</th><th>VN</th><th>วันรับบริการ</th><th>สถานะ</th>
        <th className="money-number">ชดเชย REP<br /><small>ทั้ง VN</small></th><th className="money-number">ได้รับ STM<br /><small>กองทุนนี้</small></th><th className="money-number" title="ลงคอลัมน์ STM เดียวกับกองทุนอื่น แยกยอดไม่ได้">ยอดรวมกับ<br /><small>กองทุนอื่น</small></th><th>กองทุนย่อยใน VN</th><th>งวด STM</th></tr></thead><tbody>
        {shown.rows.map((row) => {
          const c = row.case;
          const first = c.hn !== previous; previous = c.hn;
          return <tr key={row.key} className={first ? 'fdh-first' : 'fdh-cont'}>
            <td>{first ? c.hn || '-' : ''}</td><td>{first ? c.name : ''}</td>
            <td><button type="button" className="link-button fdh-mono" onClick={() => onOpen({ kind: 'case', case: c })}>{c.seq}</button></td>
            <td className="money-nowrap">{fdhDate(c.visitDate)}</td><td><StatusBadge status={c.status} /></td>
            <td className="money-number">{money(c.repNet)}</td><td className="money-number fdh-ok">{c.fundSplit ? money(row.own) : '-'}</td>
            <td className={`money-number${row.shared ? '' : ' fdh-muted'}`}>{row.shared ? money(row.shared) : '-'}</td>
            <td>{c.subFunds.map((fund) => <span key={fund} className={`fdh-tag${fund === current.subFund ? '' : ' is-dim'}`}>{fund}</span>)}</td>
            <td>{c.periods.join(', ') || '-'}</td></tr>;
        })}
        {shown.rows.length === 0 && <tr><td colSpan={10} className="fdh-muted">ไม่พบข้อมูล</td></tr>}
      </tbody></table></div>
      <Pager text={`${int(new Set(list.map((row) => row.case.hn)).size)} HN · ${int(list.length)} VN`} page={shown.page} pages={shown.pages} onPage={setPage} />
    </>}
  </>;
}

function Errors({ rows, selected, onCode }: { rows: readonly ErrorGroup[]; selected: string; onCode: (code: string) => void }) {
  return <>
    <p className="money-note">คำอธิบายรหัสไม่มีในไฟล์ REP (สปสช. ให้ดาวน์โหลดแยก) กดรหัสเพื่อดูเคสที่ติดรหัสนั้น · เคสที่ส่ง REP ใหม่ด้วย VN เดิมแล้วผ่าน จะออกจากรายการนี้เอง (ไฟล์ REP เดิมยังเก็บไว้เป็นประวัติ)</p>
    <div className="money-table-wrap is-tall"><table aria-label="Error Code"><thead><tr><th>Error Code</th><th className="money-number">เคส</th><th className="money-number">เรียกเก็บที่ค้าง</th><th>กองทุนย่อยที่พบ</th><th>VN ที่ติด</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.code} className={selected === row.code ? 'is-selected' : ''}>
        <td><button type="button" className="link-button money-code" onClick={() => onCode(row.code)}>{row.code}</button></td>
        <td className="money-number">{int(row.cases)}</td><td className="money-number">{money(row.charge)}</td><td>{row.subFunds.join(', ')}</td><td className="fdh-mono">{row.vns.join(', ')}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={5} className="fdh-muted">ไม่มีเคสติด C ตามตัวกรองนี้ 🎉</td></tr>}
    </tbody></table></div>
  </>;
}

/** รายละเอียด: the four legacy tabs. `peopleCases` is the filtered list without the case search, as the legacy page used for people and funds. */
export function FdhDetail({ tab, onTab, view, peopleCases, funds, people, onPeople, errors, errorCode, q, onQuery, chips, onCode, onOpen, onExport }: {
  funds: readonly FundVisitGroup[]; people: PeopleQuery; onPeople: (query: PeopleQuery) => void; tab: FdhTab; onTab: (tab: FdhTab) => void; view: readonly FdhCase[]; peopleCases: readonly FdhCase[]; errors: readonly ErrorGroup[]; errorCode: string;
  q: string; onQuery: (q: string) => void; chips: React.ReactNode; onCode: (code: string) => void; onOpen: (open: FdhOpen) => void; onExport: () => void;
}) {
  return <section className="money-card" id="fdh-detail" aria-label="รายละเอียด">
    <div className="money-card-head">
      <div className="nhso-tabs" role="tablist" aria-label="มุมมอง">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => onTab(key)}>{label}</button>)}</div>
      <button type="button" onClick={onExport}>ดาวน์โหลด Excel</button>
    </div>
    <div role="tabpanel">
      {tab === 'cases' && <Cases view={view} q={q} onQuery={onQuery} chips={chips} onOpen={onOpen} />}
      {tab === 'people' && <People cases={peopleCases} query={people} onQuery={onPeople} onOpen={onOpen} />}
      {tab === 'funds' && <Funds funds={funds} onOpen={onOpen} />}
      {tab === 'errors' && <Errors rows={errors} selected={errorCode} onCode={onCode} />}
    </div>
  </section>;
}

