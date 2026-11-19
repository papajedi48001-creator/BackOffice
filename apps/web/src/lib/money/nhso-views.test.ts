import { describe, expect, it } from 'vitest';
import { buildDatasets, defaultSettings, runCompare } from './nhso-core';
import { changePercent, datasetYears, defaultYears, fundByHospital, fundHospitalSheet, fundsByTotal, multiFund, overview, reportCell, searchReport, shortHospital, yearCompare, type NhsoDash } from './nhso-views';
import { nhsoStored } from './fixtures/nhso-stored';

const datasets = buildDatasets(nhsoStored);
const compare = runCompare(datasets, defaultSettings(datasets));
const dash: NhsoDash = { keyOf: compare.keyOf, metrics: ['คงเหลือ', 'จำนวนเงินรอหักกลบ', 'เงินโอนเข้าบัญชี'], dateCol: 'วันที่โอน', keyLabel: compare.keyLabel };
const T = 'เงินโอนเข้าบัญชี';

describe('nhso-views', () => {
  it('merges the fixture into three hospitals and splits วาริชภูมิ 150 by คงเหลือ', () => {
    expect(datasets.map((dataset) => dataset.name)).toEqual(['10701 โรงพยาบาลสว่างแดนดิน', '11090 โรงพยาบาลกุดบาก', '11093 โรงพยาบาลวาริชภูมิ']);
    expect(datasets[2]!.rows.map((row) => row[T])).toEqual([100, 50, 30]);
    expect(datasetYears(datasets)).toEqual([2568, 2569, 2570]);
  });

  it('ticks the latest two ปีงบ first, keeps the choice, and ticks a new latest ปีงบ', () => {
    expect(defaultYears([2568, 2569, 2570], null, null)).toEqual([2569, 2570]);
    expect(defaultYears([2568, 2569, 2570], [2568], [2568, 2569, 2570])).toEqual([2568]);
    expect(defaultYears([2568, 2569, 2570, 2571], [2568], [2568, 2569, 2570])).toEqual([2568, 2571]);
  });

  it('overview: the hero is วาริชภูมิ, with per-year totals, and fund cards largest first over all hospitals', () => {
    const view = overview(datasets, dash, T, [2569, 2570]);
    expect(view).toMatchObject({ heroName: 'โรงพยาบาลวาริชภูมิ', heroFound: true, heroTotal: 180, heroByYear: { 2569: 150, 2570: 30 }, heroFunds: 2, heroRows: 3 });
    expect(view.cards.map((card) => [card.key, card.amount])).toEqual([['กองทุนผู้ป่วยใน', 130], ['งบแพทย์แผนไทย', 50], ['กองทุนผู้ป่วยนอก', 0]]);
    expect(view.cards[0]!.share).toBeCloseTo(72.22, 2);
    expect(view.cards[0]!.change).toBeCloseTo(-70, 5);
    expect(view.cards[0]!.hospitals.map((hospital) => [shortHospital(hospital.name), hospital.total])).toEqual([['รพ.กุดบาก', 150], ['รพ.วาริชภูมิ', 130], ['รพ.สว่างแดนดิน', 0]]);
  });

  it('overview without วาริชภูมิ adds every hospital', () => {
    const others = datasets.slice(0, 2);
    expect(overview(others, dash, T, [2569, 2570])).toMatchObject({ heroName: 'ทุกโรงพยาบาล', heroFound: false, heroTotal: 160 });
  });

  it('fund × hospital table and chart sorted by the latest ปีงบ', () => {
    const view = fundByHospital(datasets, dash, 'กองทุนผู้ป่วยใน', T);
    expect(view.table.map((row) => [row.name, row.count, row.sums[T]])).toEqual([['10701 โรงพยาบาลสว่างแดนดิน', 1, 5], ['11090 โรงพยาบาลกุดบาก', 2, 150], ['11093 โรงพยาบาลวาริชภูมิ', 2, 130]]);
    expect(view.totals[T]).toBe(285);
    expect(view.years).toEqual([2568, 2569, 2570]);
    expect(view.chart.map((row) => row.name)).toEqual(['11090 โรงพยาบาลกุดบาก', '11093 โรงพยาบาลวาริชภูมิ', '10701 โรงพยาบาลสว่างแดนดิน']);
    expect(fundByHospital(datasets, dash, null, T).totals[T]).toBe(345);
  });

  it('the ยอดตามกองทุน-รพ sheet lists funds by total, then hospitals', () => {
    const { funds, sheet } = fundHospitalSheet(datasets, compare.allKeys, dash);
    expect(funds).toEqual(['กองทุนผู้ป่วยใน', 'งบแพทย์แผนไทย', 'กองทุนผู้ป่วยนอก']);
    expect(sheet.rows[0]).toEqual({ 'กองทุน': 'กองทุนผู้ป่วยใน', 'โรงพยาบาล': '10701 โรงพยาบาลสว่างแดนดิน', 'จำนวนรายการ': 1, 'คงเหลือ': 5, 'จำนวนเงินรอหักกลบ': 0, [T]: 5 });
    expect(sheet.rows).toHaveLength(5);
  });

  it('multi-fund rows per hospital and ปีงบ, sorted by the latest year', () => {
    expect(fundsByTotal(datasets, dash)).toEqual(['กองทุนผู้ป่วยใน', 'งบแพทย์แผนไทย', 'กองทุนผู้ป่วยนอก']);
    const rows = multiFund(datasets, dash, T, ['กองทุนผู้ป่วยใน', 'กองทุนผู้ป่วยนอก'], [2569, 2570]);
    expect(rows.map((row) => [row.name, row.cells['T|2569'], row.cells['T|2570']])).toEqual([['11090 โรงพยาบาลกุดบาก', 70, 90], ['11093 โรงพยาบาลวาริชภูมิ', 100, 30], ['10701 โรงพยาบาลสว่างแดนดิน', 0, 0]]);
  });

  it('year compare per fund with ผลต่าง and %', () => {
    const view = yearCompare(datasets, dash, T, 2, [2569, 2570]);
    expect(view.rows.map((row) => [row.key, row.byYear])).toEqual([['กองทุนผู้ป่วยใน', { 2569: 100, 2570: 30 }], ['งบแพทย์แผนไทย', { 2569: 50, 2570: 0 }]]);
    expect(view.totals).toEqual({ 2569: 150, 2570: 30 });
    expect(view.sheet.rows[0]).toEqual({ 'กองทุน': 'กองทุนผู้ป่วยใน', 'ปีงบ 2569': 100, 'ปีงบ 2570': 30, 'ผลต่าง': -70, 'เปลี่ยนแปลง (%)': -70 });
    expect(view.sheet.rows[1]!['เปลี่ยนแปลง (%)']).toBe(-100);
    expect(yearCompare(datasets, dash, T, null, [2570]).sheet.columns).toEqual(['กองทุน', 'ปีงบ 2570']);
  });

  it('formats report cells and searches the first 2,000 rows', () => {
    expect(reportCell(1234)).toBe('1,234.00');
    expect(reportCell(12)).toBe('12');
    expect(reportCell(1.5)).toBe('1.50');
    expect(reportCell(null)).toBe('');
    expect(reportCell('05/11/2569')).toBe('5 พ.ย. 2569'); // the system's date form, not dd/mm/yyyy
    expect(reportCell('31/01/2568 10:15')).toBe('31 ม.ค. 2568 10:15');
    expect(reportCell('5/11')).toBe('5/11');
    expect(changePercent(0, 5)).toBeNull();
    const big = { columns: ['key'], rows: Array.from({ length: 2500 }, (_, i) => ({ key: `k${i}` })) };
    expect(searchReport(big, '')).toMatchObject({ total: 2500 });
    expect(searchReport(big, '').rows).toHaveLength(2000);
    expect(searchReport(big, 'K249').total).toBe(11);
  });
});
