import { describe, expect, it } from 'vitest';
import { imcAutoUnit, imcBuckets, imcDate, imcInRange, imcPresets, imcRemain } from './imc-views';

describe('imcRemain', () => {
  const person = (due: string, status = 'ปกติ') => ({ due, status });
  it('counts calendar months and days to the due date, with the tone and filter group', () => {
    expect(imcRemain(person('2027-01-31'), '2026-11-19')).toEqual({ days: 73, text: '2 เดือน 12 วัน', tone: 'ok', group: 'ok' });
    expect(imcRemain(person('2026-12-19'), '2026-11-19')).toEqual({ days: 30, text: '1 เดือน', tone: 'bad', group: 'soon' });
    expect(imcRemain(person('2027-01-04'), '2026-11-19')).toEqual({ days: 46, text: '1 เดือน 16 วัน', tone: 'warn', group: 'mid' });
    expect(imcRemain(person('2026-11-26'), '2026-11-19')).toEqual({ days: 7, text: '7 วัน', tone: 'bad', group: 'soon' });
    expect(imcRemain(person('2026-11-19'), '2026-11-19')).toEqual({ days: 0, text: 'ครบกำหนดวันนี้', tone: 'bad', group: 'soon' });
  });
  it('shows a passed due date, a person discharged from IMC and a missing date as done', () => {
    expect(imcRemain(person('2026-10-10'), '2026-11-19')).toEqual({ days: -40, text: 'ครบกำหนดแล้ว 40 วัน', tone: 'mute', group: 'done' });
    expect(imcRemain(person('2027-03-01', 'จำหน่ายจาก IMC แล้ว'), '2026-11-19')).toEqual({ days: 0, text: 'จำหน่ายจาก IMC แล้ว', tone: 'mute', group: 'done' });
    expect(imcRemain(person(''), '2026-11-19')).toEqual({ days: 0, text: 'ไม่มีวันครบกำหนด', tone: 'mute', group: 'done' });
  });
});

describe('imcDate', () => {
  it('writes d MMM yyyy พ.ศ. and a dash for no date', () => {
    expect(imcDate('2026-04-13')).toBe('13 เม.ย. 2569');
    expect(imcDate('')).toBe('-');
  });
});

describe('imcBuckets', () => {
  const services = [{ code: 'H9339.1', name: 'กายภาพบำบัด' }, { code: 'H9340', name: 'ให้บริการIMCที่บ้าน' }];
  const lines = [
    { date: '2025-09-30', code: 'H9339.1', claim: 450 }, { date: '2025-10-01', code: 'H9339.1', claim: 450 }, { date: '2025-10-01', code: 'H9340', claim: 200 },
    { date: '2025-12-03', code: 'H9340', claim: 200 }
  ];
  it('sums claims per month with every month in between, per service', () => {
    expect(imcBuckets(lines, services, 'month')).toEqual([
      { label: 'ก.ย. 68', title: 'ก.ย. 2568', values: [450, 0] }, { label: 'ต.ค. 68', title: 'ต.ค. 2568', values: [450, 200] },
      { label: 'พ.ย. 68', title: 'พ.ย. 2568', values: [0, 0] }, { label: 'ธ.ค. 68', title: 'ธ.ค. 2568', values: [0, 200] }
    ]);
  });
  it('sums per ปีงบ (October to September)', () => {
    expect(imcBuckets(lines, services, 'year')).toEqual([{ label: 'ปีงบ 2568', title: 'ปีงบ 2568', values: [450, 0] }, { label: 'ปีงบ 2569', title: 'ปีงบ 2569', values: [450, 400] }]);
  });
  it('shows the 31 days ending on the latest service date', () => {
    const days = imcBuckets(lines, services, 'day');
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ label: '3 พ.ย.', title: '3 พ.ย. 2568', values: [0, 0] });
    expect(days.at(-1)).toEqual({ label: '3 ธ.ค.', title: '3 ธ.ค. 2568', values: [0, 200] });
  });
  it('is empty with no lines', () => {
    expect(imcBuckets([], services, 'month')).toEqual([]);
  });
});

describe('imc date range', () => {
  const services = [{ code: 'H9339.1', name: 'กายภาพบำบัด' }, { code: 'H9340', name: 'ให้บริการIMCที่บ้าน' }];
  it('draws every day, month or ปีงบ of a range, ignoring lines outside it', () => {
    const lines = [{ date: '2026-10-30', code: 'H9339.1', claim: 450 }, { date: '2026-11-02', code: 'H9340', claim: 200 }, { date: '2026-12-01', code: 'H9340', claim: 200 }];
    expect(imcBuckets(lines, services, 'day', { from: '2026-11-01', to: '2026-11-03' }).map((group) => [group.label, group.values])).toEqual([['1 พ.ย.', [0, 0]], ['2 พ.ย.', [0, 200]], ['3 พ.ย.', [0, 0]]]);
    expect(imcBuckets(lines, services, 'month', { from: '2026-09-15', to: '2026-11-19' }).map((group) => [group.label, group.values])).toEqual([['ก.ย. 69', [0, 0]], ['ต.ค. 69', [450, 0]], ['พ.ย. 69', [0, 200]]]);
    expect(imcBuckets(lines, services, 'year', { from: '2026-09-15', to: '2026-11-19' }).map((group) => group.label)).toEqual(['ปีงบ 2569', 'ปีงบ 2570']);
  });
  it('picks รายวัน for up to 62 days and รายเดือน beyond', () => {
    expect(imcAutoUnit('2026-10-01', '2026-12-01')).toBe('day');
    expect(imcAutoUnit('2026-10-01', '2026-12-02')).toBe('month');
  });
  it('offers the shortcuts, ทั้งหมด running from the first service date to today or the latest one', () => {
    expect(imcPresets('2026-11-19', '2025-10-03', '2026-11-01')).toEqual([
      { key: 'all', label: 'ทั้งหมด', from: '2025-10-03', to: '2026-11-19' },
      { key: 'today', label: 'วันนี้', from: '2026-11-19', to: '2026-11-19' },
      { key: 'week', label: '7 วันล่าสุด', from: '2026-11-13', to: '2026-11-19' },
      { key: 'month', label: 'เดือนนี้', from: '2026-11-01', to: '2026-11-19' },
      { key: 'lastMonth', label: 'เดือนก่อน', from: '2026-10-01', to: '2026-10-31' },
      { key: 'fy', label: 'ปีงบนี้ (2570)', from: '2026-10-01', to: '2026-11-19' },
      { key: 'lastFy', label: 'ปีงบ 2569', from: '2025-10-01', to: '2026-09-30' }
    ]);
    expect(imcPresets('2026-01-05', '', '')[0]).toEqual({ key: 'all', label: 'ทั้งหมด', from: '2026-01-05', to: '2026-01-05' });
    expect(imcPresets('2026-01-05', '2025-12-01', '2026-02-01')[0]!.to).toBe('2026-02-01');
    expect(imcPresets('2026-01-05', '', '')[4]).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('sums claims, REP and claim lines per person inside the range, counting only H9340 as an IMC visit', () => {
    const data = {
      lines: [
        { person: 1, date: '2026-10-01', code: 'H9339.1', claim: 450, pending: false, repNo: 'R1' },
        { person: 1, date: '2026-11-02', code: 'H9340', claim: 200, pending: true, repNo: '' },
        { person: 2, date: '2026-11-03', code: 'H9339.1', claim: 450, pending: false, repNo: '' }
      ],
      reps: [{ person: 1, date: '2026-10-01', repNo: 'R1', paid: 450 }, { person: 1, date: '2026-11-02', repNo: 'R2', paid: 100 }, { person: null, date: '2026-11-05', repNo: 'R2', paid: 300 }]
    };
    const range = imcInRange(data, '2026-11-01', '2026-11-30');
    expect(range).toMatchObject({ visits: 1, claim: 650, pending: 1, paid: 400, noRep: 650, repOutside: 1 });
    expect(range.people.get(1)).toEqual({ visits: 1, claim: 200, paid: 100, repNos: ['R2'], lines: [data.lines[1]] });
    expect(range.people.get(2)).toMatchObject({ visits: 0, claim: 450, paid: 0, repNos: [] });
    expect(range.people.get(3)).toBeUndefined();
    expect(imcInRange(data, '2026-01-01', '2026-12-31')).toMatchObject({ visits: 1, claim: 1100, paid: 850, noRep: 650 });
  });
});
