import { describe, expect, it } from 'vitest';
import { buildImcOverview } from './imc-overview';
import type { ImcLine, ImcRepLine } from './imc-report';

const line = (hn: string, date: string, visitNo: number, code: string, claim: number, more: Partial<ImcLine> = {}): ImcLine => ({
  key: `${hn}-${date}-${visitNo}-${code}`, hn, name: `คน ${hn}`, right: 'UCS', onset: '2025-09-27', discharge: '2025-10-06', due: '2026-04-04', status: 'ปกติ', adl: '', icd10: '',
  disease: 'Stroke', date, visitNo, svcType: '', code, service: code === 'H9340' ? 'ให้บริการIMCที่บ้าน' : 'กายภาพบำบัด', claim, eligible: claim, claimStatus: 'ผ่าน', ...more
});
const rep = (hn: string, date: string, repNo: string, paid: number): ImcRepLine => ({ repNo, transId: `${hn}${date}`, itemNo: 1, hn, name: '', date, item: '', claim: 450, paid, status: 'ชดเชย' });

describe('buildImcOverview', () => {
  const lines = [
    line('A', '2025-10-27', 1, 'H9339.1', 450),
    line('A', '2025-11-03', 2, 'H9340', 200, { claimStatus: 'รอประมวลผล', due: '2026-05-01', name: 'คน A ใหม่' }),
    line('B', '2025-12-01', 1, 'H9339.1', 450, { disease: 'TBI', due: '2026-01-15' })
  ];
  const overview = buildImcOverview(lines, [rep('A', '2025-10-27', 'DDSA2', 450), rep('A', '2025-10-27', 'DDSA1', 0), rep('Z', '2025-10-27', 'DDSA1', 300)]);

  it('makes one person per HN from the latest line, nearest due date first, with lines, claim, REP paid and REP numbers', () => {
    expect(overview.persons).toEqual([
      { id: 1, name: 'คน B', disease: 'TBI', right: 'UCS', onset: '2025-09-27', discharge: '2025-10-06', due: '2026-01-15', status: 'ปกติ', visits: 1, claim: 450, paid: 0, repNos: [], lastVisit: '2025-12-01' },
      { id: 2, name: 'คน A ใหม่', disease: 'Stroke', right: 'UCS', onset: '2025-09-27', discharge: '2025-10-06', due: '2026-05-01', status: 'ปกติ', visits: 2, claim: 650, paid: 450, repNos: ['DDSA1', 'DDSA2'], lastVisit: '2025-11-03' }
    ]);
  });

  it('sums the totals, counts lines still waiting and REP lines outside the register, and keeps no HN', () => {
    expect(overview.totals).toEqual({ people: 2, visits: 3, claim: 1100, pending: 1, paid: 750, noRep: 650, repOutside: 1, diseases: [['Stroke', 1], ['TBI', 1]] });
    expect(overview.services).toEqual([{ code: 'H9339.1', name: 'กายภาพบำบัด' }, { code: 'H9340', name: 'ให้บริการIMCที่บ้าน' }]);
    expect(overview.lines).toEqual([
      { person: 2, date: '2025-10-27', code: 'H9339.1', claim: 450, pending: false, repNo: 'DDSA1, DDSA2' },
      { person: 2, date: '2025-11-03', code: 'H9340', claim: 200, pending: true, repNo: '' },
      { person: 1, date: '2025-12-01', code: 'H9339.1', claim: 450, pending: false, repNo: '' }
    ]);
    expect(overview.reps).toEqual([
      { person: 2, date: '2025-10-27', repNo: 'DDSA1', paid: 0 }, { person: 2, date: '2025-10-27', repNo: 'DDSA2', paid: 450 },
      { person: null, date: '2025-10-27', repNo: 'DDSA1', paid: 300 }
    ]);
    expect(JSON.stringify(overview)).not.toMatch(/"hn"|"A"|"B"|"Z"/);
  });

  it('is empty with no files', () => {
    expect(buildImcOverview([], [])).toEqual({ persons: [], lines: [], reps: [], services: [], totals: { people: 0, visits: 0, claim: 0, pending: 0, paid: 0, noRep: 0, repOutside: 0, diseases: [] } });
  });
});
