'use client';

import { useId, useState } from 'react';
import type { MappingHistoryRow, SideChange } from '@backoffice/core';
import { SearchCard } from '../../../../components/search-card';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { bangkokToday, formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { endFollowingStart } from '../../../../lib/date-range';

const change = (side: SideChange | null) => (side ? `${side.from ?? 'ยังไม่ผูก'} → ${side.to ?? 'ยังไม่ผูก'}` : '—');

/** ประวัติการแก้ไข: who changed which สิทธิ, when (Bangkok time), and each side's old → new code. */
export function HistoryTable({ rows }: { rows: readonly MappingHistoryRow[] }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((row) => {
    const day = bangkokToday(new Date(row.at));
    return (!needle || row.pttype.toLowerCase().includes(needle) || (row.actorName ?? '').toLowerCase().includes(needle)) && (!from || day >= from) && (!to || day <= to);
  });
  return <>
    <div className="page-heading"><h2>ประวัติการแก้ไข</h2></div>
    <SearchCard query={query} onQuery={setQuery} label="ค้นหา" placeholder="รหัสสิทธิ หรือชื่อผู้แก้" shown={shown.length} total={rows.length} unit="รายการ"
      filtered={query !== '' || from !== '' || to !== ''} onClear={() => { setQuery(''); setFrom(''); setTo(''); }}>
      <label htmlFor={`${ids}-from`}>ตั้งแต่วันที่<ThaiDateInput id={`${ids}-from`} value={from} onChange={(value) => { setFrom(value); setTo((current) => (current ? endFollowingStart(value, current) : current)); }} /></label>
      <label htmlFor={`${ids}-to`}>ถึงวันที่<ThaiDateInput id={`${ids}-to`} value={to} min={from || undefined} onChange={setTo} /></label>
    </SearchCard>
    {shown.length === 0 ? <p>ยังไม่มีประวัติการแก้ไขที่ตรงกับการค้นหา</p> : <table className="mapping-history">
      <thead><tr><th>วันเวลา</th><th>ผู้แก้</th><th>สิทธิ</th><th>ผังบัญชี OPD เดิม → ใหม่</th><th>ผังบัญชี IPD เดิม → ใหม่</th></tr></thead>
      <tbody>{shown.map((row) => <tr key={row.id}>
        <td>{formatBangkokDateTime(row.at)}</td><td>{row.actorName ?? '—'}</td><td className="mapping-code">{row.pttype}</td><td>{change(row.opd)}</td><td>{change(row.ipd)}</td>
      </tr>)}</tbody>
    </table>}
  </>;
}
