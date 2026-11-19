'use client';

import { useId, useState } from 'react';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import type { NhsoHospital } from '../../../../lib/money/nhso-core';
import { changePercent, datasetYears, defaultMetric, overview, shortHospital, type NhsoDash } from '../../../../lib/money/nhso-views';
import { formatMoney } from '../dental/dental-format';
import { Chips, useYearChips, yearLabel, yearSeries } from './nhso-shared';

/** ภาพรวม: ปีงบ chips, ยอดที่แสดง, the โอนสะสม hero of วาริชภูมิ and the first 13 fund cards, each comparing the hospitals. */
export function NhsoOverview({ datasets, dash }: { datasets: readonly NhsoHospital[]; dash: NhsoDash }) {
  const ids = useId();
  const years = dash.dateCol ? datasetYears(datasets) : [];
  const [selected, toggle] = useYearChips(years);
  const [chosenMetric, setMetric] = useState('');
  const metric = dash.metrics.includes(chosenMetric) ? chosenMetric : defaultMetric(dash.metrics);
  const shownYears = selected.filter((year) => years.includes(year));
  const view = overview(datasets, dash, metric, shownYears);
  const first = shownYears[0];
  const last = shownYears[shownYears.length - 1];
  const heroChange = shownYears.length > 1 ? changePercent(view.heroByYear[first!] || 0, view.heroByYear[last!] || 0) : null;
  const series = yearSeries(shownYears, yearLabel);
  return <section className="nhso-overview" aria-label="ภาพรวม">
    <div className="nhso-toolbar">
      <Chips label="ปีงบประมาณ" options={years} selected={shownYears} onToggle={toggle} />
      <label htmlFor={`${ids}-metric`}>ยอดที่แสดง</label>
      <select id={`${ids}-metric`} value={metric} onChange={(event) => setMetric(event.target.value)}>{dash.metrics.map((column) => <option key={column}>{column}</option>)}</select>
    </div>
    <div className="nhso-hero" role="group" aria-label="โอนสะสม">
      <div className="nhso-hero-label">โอนสะสม <span>{view.heroName}{shownYears.length ? ` (${shownYears.map(yearLabel).join(' + ')})` : ''}</span></div>
      <div className="nhso-hero-total">{formatMoney(view.heroTotal)}<small>บาท</small></div>
      <div className="nhso-pills">
        {shownYears.length > 1 && shownYears.map((year) => <span key={year} className="nhso-pill">{yearLabel(year)}: <b>{formatMoney(view.heroByYear[year] || 0)}</b></span>)}
        {heroChange != null && <span className="nhso-pill">เปลี่ยนแปลง {first}→{last}: <b>{heroChange > 0 ? '+' : ''}{heroChange.toFixed(1)}%</b></span>}
        {!view.heroFound && <span className="nhso-pill">ไม่พบไฟล์โรงพยาบาลวาริชภูมิ จึงแสดงรวม <b>{datasets.length}</b> โรงพยาบาล</span>}
        <span className="nhso-pill"><b>{view.heroFunds}</b> กองทุน</span>
        <span className="nhso-pill"><b>{view.heroRows.toLocaleString('en-US')}</b> รายการโอน</span>
      </div>
    </div>
    <h3 className="nhso-section-title">แยกรายกองทุน <small>แต่ละกองทุนเทียบรายโรงพยาบาล เรียงจากยอดมากไปน้อย</small></h3>
    {shownYears.length === 0 ? <p className="money-note">เลือกปีงบประมาณอย่างน้อย 1 ปี</p> : <ol className="nhso-fund-grid">
      {view.cards.map((card, index) => <li key={card.key} className="nhso-fund-card">
        <div className="nhso-fund-head"><span className={`nhso-fund-no tone-${index % 8}`} aria-hidden="true">{index + 1}</span><h4>{card.key || '(ไม่ระบุกองทุน)'}</h4></div>
        <div className="nhso-fund-amount">{formatMoney(card.amount)}<small>บาท</small></div>
        <div className="nhso-fund-meta">
          <span className="nhso-badge">{card.share.toFixed(1)}% ของยอดรวม</span>
          {card.change != null && <span className={`nhso-badge ${card.change >= 0 ? 'is-up' : 'is-down'}`}>{card.change >= 0 ? '▲' : '▼'} {Math.abs(card.change).toFixed(1)}% เทียบ {first}</span>}
        </div>
        <GroupedBarChart compact axisTitle="เทียบรายโรงพยาบาล" ariaLabel={`${card.key} เทียบรายโรงพยาบาล`} series={series} valueFormat={formatMoney}
          groups={card.hospitals.map((hospital) => ({ label: shortHospital(hospital.name), title: hospital.name, values: shownYears.map((year) => hospital.byYear[year] || 0) }))} />
      </li>)}
    </ol>}
  </section>;
}
