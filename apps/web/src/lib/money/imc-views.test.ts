import { describe, expect, it } from 'vitest';
import { imcBuckets, imcDate, imcRemain } from './imc-views';

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
  it('writes d/m/yyyy พ.ศ. and a dash for no date', () => {
    expect(imcDate('2026-04-13')).toBe('13/4/2569');
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
