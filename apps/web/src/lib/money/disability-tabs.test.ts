import { describe, expect, it } from 'vitest';
import { disabilityCards, disabilityTab } from './disability-tabs';

describe('disabilityTab', () => {
  it('opens the asked tab when allowed, otherwise the first allowed one', () => {
    expect(disabilityTab('ofc', ['imc', 'ofc', 'dp'])).toBe('ofc');
    expect(disabilityTab('ofc', ['imc', 'dp'])).toBe('imc');
    expect(disabilityTab(undefined, ['ofc'])).toBe('ofc');
    expect(disabilityTab('x', ['imc', 'ofc', 'dp'])).toBe('imc');
  });
});

describe('disabilityCards', () => {
  const imc = { people: 12, claim: 18450, soon: 3 };
  const ofc = { people: 9, visits: 11, claim: 40000, noRep: 5, denied: 1, waitStm: 2 };
  const dp = { fy: 2569, count: 1284, claim: 250000, flagged: 0, updatedAt: '2026-11-20T03:00:00Z' };

  it('gives each allowed tab its link, figures and what needs following, keeping the range on OFC', () => {
    expect(disabilityCards({ tabs: ['imc', 'ofc', 'dp'], current: 'ofc', range: { start: '2026-11-01', end: '2026-11-30' }, imc, ofc, dp })).toEqual([
      { key: 'imc', code: 'IMC', title: 'Monitor IMC', href: '/money/disability?tab=imc', current: false, main: 'ทะเบียน 12 คน · เรียกเก็บ 18,450.00 บาท', alert: { text: 'ใกล้ครบกำหนด ≤ 30 วัน 3 คน', tone: 'warn' } },
      { key: 'ofc', code: 'OFC', title: 'Instrument OFC', href: '/money/disability?tab=ofc&start=2026-11-01&end=2026-11-30', current: true, main: '9 คน · 11 ครั้ง · 40,000.00 บาท', alert: { text: 'ยังไม่มี REP 5 ครั้ง · ปฏิเสธ 1', tone: 'bad' } },
      { key: 'dp', code: 'AE', title: 'บริการฟื้นฟู (Point)', href: '/money/disability?tab=dp', current: false, main: 'ปีงบ 2569 · 1,284 ครั้ง · ขอเบิก 250,000.00 บาท', alert: { text: 'ข้อมูลล่าสุด 20 พ.ย. 2569', tone: 'ok' } }
    ]);
  });

  it('dates ข้อมูลล่าสุด by the Bangkok day', () => {
    expect(disabilityCards({ tabs: ['dp'], current: 'dp', range: { start: '2026-11-01', end: '2026-11-30' }, imc: null, ofc: null, dp: { ...dp, updatedAt: '2026-11-19T18:30:00Z' } })[0]!.alert.text).toBe('ข้อมูลล่าสุด 20 พ.ย. 2569');
  });

  it('says calmly when there is nothing to follow, no data yet, or no figures', () => {
    const cards = disabilityCards({ tabs: ['imc', 'ofc', 'dp'], current: 'imc', range: { start: '2026-11-01', end: '2026-11-30' }, imc: { people: 2, claim: 0, soon: 0 }, ofc: { ...ofc, noRep: 0, denied: 0, waitStm: 2 }, dp: { ...dp, flagged: 4 } });
    expect(cards.map((card) => card.alert)).toEqual([{ text: 'ไม่มีคนใกล้ครบกำหนด', tone: 'ok' }, { text: 'รอ Statement 2 ครั้ง', tone: 'warn' }, { text: 'ติดสถานะ 4 รายการ', tone: 'warn' }]);
    const empty = disabilityCards({ tabs: ['ofc'], current: 'ofc', range: { start: '2026-11-01', end: '2026-11-30' }, imc: null, ofc: null, dp: null });
    expect(empty).toEqual([{ key: 'ofc', code: 'OFC', title: 'Instrument OFC', href: '/money/disability?tab=ofc&start=2026-11-01&end=2026-11-30', current: true, main: 'ยังไม่มีข้อมูล', alert: { text: 'ดูรายละเอียดในแท็บ', tone: 'mute' } }]);
    expect(disabilityCards({ tabs: ['ofc'], current: 'ofc', range: { start: '2026-11-01', end: '2026-11-30' }, imc: null, ofc: { ...ofc, people: 0, visits: 0, claim: 0, noRep: 0, denied: 0, waitStm: 0 }, dp: null })[0]!.alert).toEqual({ text: 'ไม่มีผู้ป่วย 1 พ.ย. 2569 – 30 พ.ย. 2569', tone: 'mute' });
  });
});

describe('figures for the cards', () => {
  it('counts IMC people near their due date, OFC visits without REP, and takes the newest ปีงบ', async () => {
    const { imcFigures, ofcFigures, dpFigures } = await import('./disability-tabs');
    const person = (due: string, status = 'ปกติ') => ({ due, status, claim: 100 });
    expect(imcFigures({ persons: [person('2026-12-10'), person('2027-03-01'), person('2026-12-01', 'จำหน่ายจาก IMC แล้ว')], totals: { people: 3, claim: 300 } }, '2026-11-24'))
      .toEqual({ people: 3, claim: 300, soon: 1 });
    expect(imcFigures({ persons: [], totals: { people: 0, claim: 0 } }, '2026-11-24')).toBeNull();
    expect(ofcFigures({ totals: { people: 2, visits: 3, claim: 10, denied: 1, waitStm: 0 }, visits: [{ status: 'none' }, { status: 'none' }, { status: 'denied' }] }))
      .toEqual({ people: 2, visits: 3, claim: 10, noRep: 2, denied: 1, waitStm: 0 });
    const year = (fy: number) => ({ fy, count: 5, claim: 9, flagged: 0, updatedAt: '2026-11-20T03:00:00.000Z' });
    expect(dpFigures([year(2569), year(2568)])).toEqual(year(2569));
    expect(dpFigures([])).toBeNull();
  });
});
