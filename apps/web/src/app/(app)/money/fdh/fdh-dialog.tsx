'use client';

import { hasError, MONEY_COLUMNS, type FdhCase, type PersonFundGroup } from '../../../../lib/money/fdh-core';
import { fdhDate } from '../../../../lib/money/fdh-views';
import { FdhPopup, int, money, StatusBadge } from './fdh-shared';

export type FdhOpen = { kind: 'case'; case: FdhCase } | { kind: 'person'; person: PersonFundGroup };
const KIND: Record<string, string> = { normal: 'ปกติ', appeal: 'อุทธรณ์', d1: 'ผู้พิการ D1' };
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

function Kv({ items }: { items: [string, string][] }) {
  return <dl className="fdh-kv">{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

/** ได้รับแยกตามกองทุนย่อย: the STM amount of one VN split by REP sub-fund (legacy `splitTable`). */
function SplitTable({ c }: { c: FdhCase }) {
  const split = c.fundSplit;
  if (!split) return <p className="money-note">VN นี้ยังไม่มีใน STM จึงยังไม่มียอดแยกกองทุน</p>;
  const zero = c.subFunds.filter((fund) => !split.parts.some((part) => part.funds.includes(fund)));
  return <>
    <div className="money-table-wrap"><table aria-label="ได้รับแยกตามกองทุนย่อย"><thead><tr><th>กองทุนย่อย (REP)</th><th>คอลัมน์ STM</th><th className="money-number">ได้รับ</th></tr></thead><tbody>
      {split.parts.map((part, at) => <tr key={at}><td>{part.funds.map((fund) => <span key={fund} className="fdh-tag">{fund}</span>)}{part.exact ? null : <small className="fdh-muted"> ยอดรวมกัน</small>}
        {part.notes.length > 0 && <><br /><small className="fdh-muted">{part.notes.join(' · ')}</small></>}</td>
        <td>{part.cols.join(', ')}</td><td className={`money-number${part.exact ? ' fdh-ok' : ''}`}><b>{money(part.amount)}</b></td></tr>)}
      {zero.map((fund) => <tr key={`zero-${fund}`}><td><span className="fdh-tag">{fund}</span></td><td className="fdh-muted">-</td><td className="money-number fdh-muted">0.00</td></tr>)}
      <tr className="fdh-sum"><td>รวม VN นี้</td><td /><td className="money-number"><b>{money(c.stmTotal)}</b></td></tr>
    </tbody></table></div>
    {split.parts.some((part) => !part.exact) && <p className="money-note">&quot;ยอดรวมกัน&quot; คือกองทุนที่ลงคอลัมน์เดียวกันใน STM จึงแยกเป็นรายกองทุนไม่ได้</p>}
  </>;
}

function CaseBody({ c }: { c: FdhCase }) {
  const reps = c.current ? [c.current, ...c.history] : [];
  const cols = MONEY_COLUMNS.filter((column) => c.stm.some((row) => row[column.key]));
  return <>
    <Kv items={[['VN (SEQ)', c.seq], ['TRAN_ID', c.tranId], ['PID', c.pid], ['วันรับบริการ', fdhDate(c.visitDate)], ['สิทธิหลัก', c.right], ['กองทุนย่อย', c.subFunds.join(', ')],
      ['เรียกเก็บ', money(c.charge)], ['ชดเชยตาม REP', money(c.repNet)], ['ได้รับตาม STM', c.stm.length ? money(c.stmTotal) : '-']]} />
    <h3>ได้รับแยกตามกองทุนย่อย</h3>
    <SplitTable c={c} />
    {reps.length > 0 && <>
      <h3>ประวัติการส่ง REP ({reps.length} ครั้ง)</h3>
      <div className="money-table-wrap"><table aria-label="ประวัติการส่ง REP"><thead><tr><th>REP No.</th><th>ผล</th><th>กองทุนหลัก</th><th>กองทุนย่อย</th><th className="money-number">เรียกเก็บ</th><th className="money-number">ชดเชยสุทธิ</th><th>รูปแบบการจ่าย</th><th>ไฟล์</th></tr></thead><tbody>
        {reps.map((rep, at) => <tr key={`${text(rep.rep_no)}-${at}`} className={at ? '' : 'is-selected'}><td>{text(rep.rep_no)}{at ? null : <small className="fdh-muted"> ล่าสุด</small>}</td>
          <td>{hasError(rep.error_code) ? <span className="money-code">{text(rep.error_code)}</span> : <span className="fdh-ok">ผ่าน</span>}</td>
          <td>{text(rep.main_fund)}</td><td>{text(rep.sub_fund)}</td><td className="money-number">{money(Number(rep.charge))}</td><td className="money-number">{money(Number(rep.net))}</td>
          <td>{text(rep.pay_mode)}</td><td className="fdh-small">{rep.doc_no}</td></tr>)}
      </tbody></table></div>
    </>}
    {c.denies.length > 0 && <>
      <h3>รายการที่ถูกปฏิเสธ (Data DENY)</h3>
      <div className="money-table-wrap"><table aria-label="รายการที่ถูกปฏิเสธ"><thead><tr><th>กองทุน</th><th>รหัสเบิก</th><th>หมวด</th><th className="money-number">จำนวน</th><th>DENY</th></tr></thead><tbody>
        {c.denies.map((deny, at) => <tr key={at}><td>{text(deny.fund)}</td><td>{text(deny.code)}</td><td>{text(deny.category)}</td><td className="money-number">{int(Number(deny.qty))}</td><td><span className="money-code">{text(deny.deny)}</span></td></tr>)}
      </tbody></table></div>
    </>}
    {c.stm.length ? <>
      <h3>ยอดพึงรับใน STM</h3>
      <div className="money-table-wrap"><table aria-label="ยอดพึงรับใน STM"><thead><tr><th>งวด</th><th>ชนิด</th>{cols.map((column) => <th key={column.key} className="money-number">{column.label}</th>)}<th className="money-number">รวม</th></tr></thead><tbody>
        {c.stm.map((row, at) => <tr key={at}><td>{row.period}</td><td>{KIND[text(row.kind)] ?? text(row.kind)}</td>{cols.map((column) => <td key={column.key} className="money-number">{money(Number(row[column.key]))}</td>)}<td className="money-number"><b>{money(Number(row.total))}</b></td></tr>)}
      </tbody></table></div>
    </> : <p className="money-note">ยังไม่พบเคสนี้ใน STM ที่อัปโหลด</p>}
  </>;
}

function PersonBody({ p, onCase }: { p: PersonFundGroup; onCase: (c: FdhCase) => void }) {
  return <>
    <Kv items={[['PID', p.pid], ['สิทธิล่าสุด', p.right], ['กองทุนย่อย (REP)', p.subFund], ['เรียกเก็บ', money(p.charge)], ['ชดเชยตาม REP (ทั้ง visit)', money(p.repNet)],
      ['ได้รับ STM กองทุนนี้', money(p.stmFund)], ...(p.stmShared ? [['ยอดรวมกับกองทุนอื่น', money(p.stmShared)] as [string, string]] : [])]} />
    <h3>ทุก visit ที่เบิก {p.subFund}</h3>
    <div className="money-table-wrap"><table aria-label="ทุก visit"><thead><tr><th>วันรับบริการ</th><th>VN</th><th>สถานะ</th><th>กองทุนย่อยใน visit</th><th className="money-number">ชดเชย REP</th><th className="money-number">ได้รับ STM ทั้ง VN</th><th className="money-number">กองทุนนี้</th><th className="money-number">รวมกับกองทุนอื่น</th><th>งวด STM</th></tr></thead><tbody>
      {p.cases.map((c) => {
        const own = c.fundSplit ? c.fundSplit.byFund[p.subFund] ?? 0 : 0;
        const shared = c.fundSplit ? c.fundSplit.shared[p.subFund] ?? 0 : 0;
        return <tr key={c.seq}><td className="money-nowrap">{fdhDate(c.visitDate)}</td><td><button type="button" className="link-button" onClick={() => onCase(c)}>{c.seq}</button></td><td><StatusBadge status={c.status} /></td>
          <td>{c.subFunds.join(', ')}</td><td className="money-number">{money(c.repNet)}</td><td className="money-number">{c.stm.length ? money(c.stmTotal) : '-'}</td>
          <td className="money-number fdh-ok">{c.fundSplit ? money(own) : '-'}</td><td className={`money-number${shared ? '' : ' fdh-muted'}`}>{shared ? money(shared) : '-'}</td>
          <td>{c.periods.join(', ') || '-'}</td></tr>;
      })}
    </tbody></table></div>
    <p className="money-note">กด VN เพื่อดูรายละเอียดของ visit นั้น</p>
  </>;
}

/** รายละเอียดเคส / รายบุคคล popup; a person's visit opens that visit in the same popup, as the legacy page. */
export function FdhDialog({ open, onOpen, onClose }: { open: FdhOpen; onOpen: (next: FdhOpen) => void; onClose: () => void }) {
  if (open.kind === 'case') {
    const c = open.case;
    return <FdhPopup key={`case-${c.seq}`} onClose={onClose} title={<><StatusBadge status={c.status} /> {c.name || '-'} <small className="fdh-muted">HN {c.hn}</small></>}>
      <CaseBody c={c} />
    </FdhPopup>;
  }
  const p = open.person;
  return <FdhPopup key={`person-${p.key}`} onClose={onClose} title={<>{p.name || '-'} <small className="fdh-muted">HN {p.hn || '-'} · {p.subFund} · {int(p.visits)} ครั้ง</small></>}>
    <PersonBody p={p} onCase={(c) => onOpen({ kind: 'case', case: c })} />
  </FdhPopup>;
}
