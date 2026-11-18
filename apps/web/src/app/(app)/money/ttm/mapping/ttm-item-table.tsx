'use client';

import { useId, useMemo, useState } from 'react';
import { TTM_KINDS, type TtmCategory } from '@backoffice/contracts';
import type { TtmItemStat } from '@backoffice/core';
import { ttmBaht, ttmNum } from '../../../../../lib/money/ttm-views';

const categoryLabel = (categories: Readonly<Record<TtmCategory, string>>, category: TtmCategory | null) => (category ? categories[category] : 'ไม่นับ');

/** รายการค่าใช้จ่าย (icode) and what each counts as, with the legacy search box. */
export function TtmItemTable({ items, categories }: { items: readonly TtmItemStat[]; categories: Readonly<Record<TtmCategory, string>> }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const label = (category: TtmCategory | null) => categoryLabel(categories, category);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return words ? items.filter((item) => [item.icode, item.name, item.income, item.incomeName, categoryLabel(categories, item.category), item.kind ? TTM_KINDS[item.kind] : ''].join(' ').toLowerCase().includes(words)) : items;
  }, [items, query, categories]);
  return <>
    <div className="money-card-head">
      <h3>รายการค่าใช้จ่าย (icode) <small>ใส่รหัสใน TTM_MASSAGE_ICODES / TTM_HERB_ICODES / TTM_OPD_FEE_ICODES · แยกรายบริการเองด้วย TTM_KIND_MAP</small></h3>
      <div className="money-table-filters">
        <label className="visually-hidden" htmlFor={`${ids}-q`}>ค้นหารายการ</label>
        <input id={`${ids}-q`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา icode / ชื่อรายการ / หมวด" />
      </div>
    </div>
    <div className="money-table-wrap is-tall"><table aria-label="รายการค่าใช้จ่าย (icode)">
      <thead><tr><th>icode</th><th>ชื่อรายการ</th><th>ชนิด</th><th>income</th><th>นับเป็น</th><th>รายบริการ</th><th className="money-number">visit</th><th className="money-number">จำนวน</th><th className="money-number">ยอดเงิน</th></tr></thead>
      <tbody>{shown.map((item) => <tr key={item.icode}>
        <td><span className="money-code">{item.icode}</span></td><td>{item.name}</td><td>{item.isDrug ? 'ยา' : 'ค่าบริการ'}</td>
        <td><span className="money-code">{item.income}</span> {item.incomeName}</td>
        <td><span className={`ttm-cat is-${item.category ?? 'none'}`}>{label(item.category)}</span></td>
        <td>{item.kind ? TTM_KINDS[item.kind] : '–'}</td>
        <td className="money-number">{ttmNum(item.visits)}</td><td className="money-number">{ttmBaht(item.qty)}</td><td className="money-number">{ttmBaht(item.amount)}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
