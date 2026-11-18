'use client';

import { useMemo, useState } from 'react';
import type { MappedAccount, MappingEditor, MappingSnapshot, PttypeRight } from '@backoffice/core';
import { SearchCard } from '../../../components/search-card';
import { formatHosxpStamp } from '../../../lib/pttype-mapping-client';
import { MappingDialog } from './mapping-dialog';

type Status = 'all' | 'complete' | 'missing-opd' | 'missing-ipd';
const ANY_ACCOUNT = '';
const statusOf: Record<Status, (right: PttypeRight) => boolean> = {
  all: () => true,
  complete: (right) => right.opd !== null && right.ipd !== null,
  'missing-opd': (right) => right.opd === null,
  'missing-ipd': (right) => right.ipd === null
};
const TILES: readonly [Status, string][] = [['all', 'สิทธิที่ใช้งาน'], ['complete', 'ผูกครบแล้ว'], ['missing-opd', 'ยังไม่ผูก OPD'], ['missing-ipd', 'ยังไม่ผูก IPD']];
const icon = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

const matches = (right: PttypeRight, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [right.code, right.name, right.opd?.code, right.opd?.name, right.ipd?.code, right.ipd?.name].some((value) => value?.toLowerCase().includes(needle));
};
const latestStamp = (right: PttypeRight) => [right.opd?.modifiedAt, right.ipd?.modifiedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

function AccountCell({ account }: { account: MappedAccount | null }) {
  if (!account) return <span className="mapping-missing">ยังไม่ผูก</span>;
  if (account.name === null) return <span className="mapping-account"><span>{account.code} (ไม่พบในผังบัญชี)</span></span>;
  return <span className="mapping-account"><span>{account.name}</span><small>{account.code}</small></span>;
}

/** หน้า ผูกผังบัญชี (แบบ B): tiles that filter, the search card, the table and one popup per สิทธิ. */
export function MappingBoard({ snapshot, editors }: { snapshot: MappingSnapshot; editors: Record<string, MappingEditor> }) {
  const { rights } = snapshot;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [account, setAccount] = useState(ANY_ACCOUNT);
  const [editing, setEditing] = useState<string | null>(null);
  const accounts = useMemo(() => [...new Map([...snapshot.opdAccounts, ...snapshot.ipdAccounts].map((option) => [option.code, option])).values()].sort((a, b) => a.code.localeCompare(b.code)), [snapshot]);
  const shown = rights.filter((right) => statusOf[status](right) && matches(right, query) && (account === ANY_ACCOUNT || right.opd?.code === account || right.ipd?.code === account));
  const editingRight = rights.find((right) => right.code === editing) ?? null;
  const exportShown = () => { window.location.assign(`/api/pttype-mapping/export?${new URLSearchParams({ pttype: shown.map((right) => right.code).join(',') }).toString()}`); };

  return <>
    <div className="page-heading">
      <h2>ผูกผังบัญชีกับสิทธิการรักษา</h2>
      <nav className="page-actions">
        <button type="button" className="button-secondary button-with-icon" onClick={exportShown} disabled={shown.length === 0}>
          <svg {...icon}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>ส่งออกข้อมูล
        </button>
      </nav>
    </div>
    <p className="mapping-lead"><span className="mapping-ok" aria-hidden="true" />HOSxP เชื่อมต่อแล้ว · สิทธิที่ใช้งาน {rights.length} สิทธิ</p>
    <ul className="mapping-tiles">{TILES.map(([key, label]) => <li key={key}>
      <button type="button" className={key === 'all' || key === 'complete' ? undefined : 'is-warn'} aria-pressed={status === key} onClick={() => setStatus(key)}>
        <b>{rights.filter(statusOf[key]).length}</b> <span>{label}</span>
      </button>
    </li>)}</ul>
    <SearchCard query={query} onQuery={setQuery} label="ค้นหา" placeholder="รหัสหรือชื่อสิทธิ / รหัสหรือชื่อผังบัญชี" shown={shown.length} total={rights.length} unit="สิทธิ"
      filtered={query !== '' || status !== 'all' || account !== ANY_ACCOUNT} onClear={() => { setQuery(''); setStatus('all'); setAccount(ANY_ACCOUNT); }}>
      <label>สถานะการผูก
        <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>{TILES.map(([key, label]) => <option key={key} value={key}>{key === 'all' ? 'ทั้งหมด' : label}</option>)}</select>
      </label>
      <label>ผังบัญชี
        <select value={account} onChange={(event) => setAccount(event.target.value)}>
          <option value={ANY_ACCOUNT}>ทุกผังบัญชี</option>
          {accounts.map((option) => <option key={option.code} value={option.code}>{option.code} · {option.name}</option>)}
        </select>
      </label>
    </SearchCard>
    {shown.length === 0 ? <p>ไม่พบสิทธิที่ตรงกับการค้นหา</p> : <table className="mapping-table">
      <thead><tr><th>รหัส</th><th>สิทธิการรักษา</th><th>ผังบัญชี OPD</th><th>ผังบัญชี IPD</th><th>แก้ไขล่าสุด</th><th><span className="visually-hidden">จัดการ</span></th></tr></thead>
      <tbody>{shown.map((right) => {
        const stamp = latestStamp(right);
        const editor = editors[right.code];
        return <tr key={right.code}>
          <td className="mapping-code">{right.code}</td>
          <td><strong>{right.name}</strong></td>
          <td data-label="OPD"><AccountCell account={right.opd} /></td>
          <td data-label="IPD"><AccountCell account={right.ipd} /></td>
          <td className="mapping-who">{editor?.name ?? null}{stamp ? <small>{formatHosxpStamp(stamp)}</small> : editor ? null : <small>—</small>}</td>
          <td className="mapping-action"><button type="button" className="button-secondary" aria-label={`ผูกผังบัญชี ${right.code} ${right.name}`} onClick={() => setEditing(right.code)}>ผูกผังบัญชี</button></td>
        </tr>;
      })}</tbody>
    </table>}
    {editingRight ? <MappingDialog key={editingRight.code} right={editingRight} opdAccounts={snapshot.opdAccounts} ipdAccounts={snapshot.ipdAccounts} onClose={() => setEditing(null)} /> : null}
  </>;
}
