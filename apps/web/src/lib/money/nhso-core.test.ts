import { describe, expect, it } from 'vitest';
import { allocateTransfer, buildDatasets, dashboardMetrics, defaultSettings, monthOf, runCompare, sumByFy, type NhsoStored } from './nhso-core';

// Ported from the legacy tests/nhso/core.test.js.
const HEAD = ['ลำดับ', 'วันที่โอน', 'Batch No.', 'กองทุน', 'คงเหลือ', 'จำนวนเงินรอหักกลบ', 'เงินโอนเข้าบัญชี'];
const stored = (hcode: string, name: string, fy: number, rows: (string | number | null)[][]): NhsoStored => ({
  hcode, fy, fileName: `${hcode} ${fy}.xlsx`,
  rows: [['รายงานเอกสารการโอนเงินแยกตามหน่วยงาน'], [`หน่วยบริการ ${hcode} ${name} `], [], HEAD, ...rows, ['รวม', null, null, null, 0, 0, 0]]
});

describe('nhso-core', () => {
  it('monthOf: Thai fiscal year', () => {
    expect(monthOf('25 ก.ย. 2569')?.fy).toBe(2569);
    expect(monthOf('21 ต.ค. 2569')?.fy).toBe(2570);
    expect(monthOf('01/10/2568')?.fy).toBe(2569);
    expect(monthOf('01/10/2568')).toEqual({ sort: '2568-10', label: 'ต.ค. 68', fy: 2569 });
    expect(monthOf('ไม่ใช่วันที่')).toBeNull();
  });

  it('allocateTransfer splits group total by คงเหลือ', () => {
    const rows = [{ 'ลำดับ': 1, 'คงเหลือ': 100, 'เงินโอนเข้าบัญชี': 150 }, { 'ลำดับ': 1, 'คงเหลือ': 50, 'เงินโอนเข้าบัญชี': 0 }, { 'ลำดับ': 2, 'คงเหลือ': 10, 'เงินโอนเข้าบัญชี': 99 }];
    const result = allocateTransfer(['ลำดับ', 'คงเหลือ', 'เงินโอนเข้าบัญชี'], rows);
    expect(rows.map((row) => row['เงินโอนเข้าบัญชี'])).toEqual([100, 50, 99]);
    expect(result.badGroups).toBe(1);
  });

  it('buildDatasets: name from header, same hospital two years merged, total row dropped', () => {
    const datasets = buildDatasets([
      stored('11093', 'โรงพยาบาลวาริชภูมิ', 2569, [[1, '25 ก.ย. 2569', '1', 'กองทุนผู้ป่วยใน', 10, 0, 10]]),
      stored('11093', 'โรงพยาบาลวาริชภูมิ', 2570, [[1, '21 ต.ค. 2569', '2', 'กองทุนผู้ป่วยใน', 5, 0, 5]]),
      stored('11090', 'โรงพยาบาลกุดบาก', 2569, [[1, '25 ก.ย. 2569', '1', 'งบแพทย์แผนไทย', 7, 0, 7]])
    ]);
    expect(datasets.map((dataset) => dataset.name)).toEqual(['11093 โรงพยาบาลวาริชภูมิ', '11090 โรงพยาบาลกุดบาก']);
    expect(datasets[0]!.rows).toHaveLength(2);
    expect([...datasets[0]!.fys].sort()).toEqual([2569, 2570]);
    expect(datasets[0]!.files).toEqual(['2569/11093 2569.xlsx', '2570/11093 2570.xlsx']);
  });

  it('buildDatasets marks a hospital loaded twice for the same ปีงบ with *', () => {
    const twice = stored('11093', 'โรงพยาบาลวาริชภูมิ', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 1, 0, 1]]);
    expect(buildDatasets([twice, twice]).map((dataset) => dataset.name)).toEqual(['11093 โรงพยาบาลวาริชภูมิ', '11093 โรงพยาบาลวาริชภูมิ *']);
  });

  it('runCompare with default settings uses กองทุน as key', () => {
    const datasets = buildDatasets([
      stored('11093', 'โรงพยาบาลวาริชภูมิ', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 10, 0, 10], [2, '20 ก.ย. 2569', '1', 'B', 3, 0, 3]]),
      stored('11090', 'โรงพยาบาลกุดบาก', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 7, 0, 7]])
    ]);
    const settings = defaultSettings(datasets);
    expect(settings.keys).toEqual(['กองทุน']);
    expect(settings.pivotCol).toBe('คงเหลือ');
    const out = runCompare(datasets, settings);
    expect(out.allKeys).toEqual(['a', 'b']);
    expect(out.report['แถวที่ขาด']!.rows).toHaveLength(1);
    expect(out.report['แถวที่ขาด']!.rows[0]!.key).toBe('b');
    expect(defaultSettings(datasets, { keys: ['Batch No.'], tol: '1' }).keys).toEqual(['Batch No.']);
    expect(defaultSettings(datasets, { keys: ['หายไปแล้ว'] }).keys).toEqual(['กองทุน']);
    // Beyond the legacy test: the pivot, its รวม row, the stats and the value differences.
    expect(out.report['เทียบยอด คงเหลือ']!.rows.at(-1)).toMatchObject({ key: 'รวม', 'รวมทุกไฟล์': 20, '11093 โรงพยาบาลวาริชภูมิ': 13, '11090 โรงพยาบาลกุดบาก': 7 });
    expect(out.stats).toEqual([[2, 'โรงพยาบาล'], [2, 'กองทุนทั้งหมด'], [1, 'กองทุนที่มีครบทุก รพ.'], [1, 'กองทุนที่บาง รพ. ไม่มี'], [2, 'ยอดที่ต่างจาก รพ. ส่วนใหญ่'], [3, 'รายการโอนเงินทั้งหมด']]);
    expect(Object.keys(out.report)).toEqual(['สรุป', 'เทียบยอด คงเหลือ', 'แถวที่ขาด', 'ตารางมี-ไม่มี', 'ค่าไม่ตรงกัน', 'ยอดตามกองทุน-รพ']);
  });

  it('runCompare without aggregation lists repeated keys', () => {
    const datasets = buildDatasets([
      stored('11093', 'ก', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 1, 0, 1], [2, '25 ก.ย. 2569', '1', 'A', 2, 0, 2]]),
      stored('11090', 'ข', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 3, 0, 3]])
    ]);
    const out = runCompare(datasets, { ...defaultSettings(datasets), aggregate: false });
    expect(out.report['key ซ้ำ']!.rows).toEqual([{ 'ไฟล์': '11093 ก', key: 'a', 'จำนวนครั้ง': 2 }]);
  });

  it('dashboardMetrics and sumByFy add each column by ปีงบ', () => {
    const datasets = buildDatasets([stored('11093', 'ก', 2569, [[1, '25 ก.ย. 2569', '1', 'A', 10, 0, 10], [2, '21 ต.ค. 2569', '1', 'A', 5, 0, 5]])]);
    expect(dashboardMetrics(datasets, [])).toEqual({ metrics: ['คงเหลือ', 'จำนวนเงินรอหักกลบ', 'เงินโอนเข้าบัญชี'], dateCol: 'วันที่โอน' });
    expect(sumByFy(datasets[0]!, 'คงเหลือ', 'วันที่โอน')).toEqual({ 2569: 10, 2570: 5 });
  });
});
