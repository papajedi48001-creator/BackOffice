'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TtmPreset } from '@backoffice/core';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { endFollowingStart } from '../../../../lib/date-range';

/** ตั้งแต่วันที่ / ถึงวันที่ with the legacy preset chips; `path` is the page it reloads (dashboard or ตรวจสอบการจับคู่รหัส), `query` stays in its link (e.g. the tab). */
export function TtmFilter({ path, query: keep = {}, start, end, presets, children }: { path: string; query?: Readonly<Record<string, string>>; start: string; end: string; presets: readonly TtmPreset[]; children?: React.ReactNode }) {
  const router = useRouter();
  const ids = useId();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const query = (s: string, e: string) => `${path}?${new URLSearchParams({ ...keep, start: s, end: e }).toString()}`;
  return <div className="money-filter search-card ttm-filter">
    <form className="money-date-filter" aria-label="ช่วงวันที่" onSubmit={(event) => { event.preventDefault(); router.push(query(from, to)); }}>
      <label htmlFor={`${ids}-from`}>ตั้งแต่วันที่</label>
      <ThaiDateInput id={`${ids}-from`} value={from} required onChange={(value) => { setFrom(value); setTo((current) => endFollowingStart(value, current)); }} />
      <label htmlFor={`${ids}-to`}>ถึงวันที่</label>
      <ThaiDateInput id={`${ids}-to`} value={to} min={from} required onChange={setTo} />
      <button type="submit" disabled={!from || !to || to < from}>แสดงข้อมูล</button>
    </form>
    <nav className="money-presets" aria-label="ช่วงวันที่ด่วน">{presets.map((preset) => {
      const active = preset.start === start && preset.end === end;
      return <Link key={preset.label} className={`money-chip-link${active ? ' is-active' : ''}`} aria-current={active ? 'true' : undefined} href={query(preset.start, preset.end)}>{preset.label}</Link>;
    })}</nav>
    {children && <div className="ttm-filter-actions">{children}</div>}
  </div>;
}
