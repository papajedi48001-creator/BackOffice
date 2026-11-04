import { describe, expect, it } from 'vitest';
import { formatThaiDateInput, monthCells, parseThaiDateInput, thaiMonthTitle } from './thai-date-input';

describe('Thai date entry', () => {
  it('shows an ISO date as วัน/เดือน/ปี พ.ศ.', () => {
    expect(formatThaiDateInput('2026-11-09')).toBe('09/11/2569');
    expect(formatThaiDateInput('')).toBe('');
  });
  it('reads day/month/Buddhist year, ISO, and a Christian year typed by habit', () => {
    expect(parseThaiDateInput('9/11/2569')).toBe('2026-11-09');
    expect(parseThaiDateInput('09-11-2569')).toBe('2026-11-09');
    expect(parseThaiDateInput('2026-11-09')).toBe('2026-11-09');
    expect(parseThaiDateInput('09/11/2026')).toBe('2026-11-09');
  });
  it('rejects dates that do not exist', () => {
    expect(parseThaiDateInput('31/02/2569')).toBeNull();
    expect(parseThaiDateInput('hello')).toBeNull();
    expect(parseThaiDateInput('')).toBeNull();
  });
  it('titles a month in Thai with the Buddhist year', () => {
    expect(thaiMonthTitle('2026-11')).toBe('พฤศจิกายน 2569');
  });
  it('lays a month out in Monday-first weeks', () => {
    const cells = monthCells('2026-11');
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(cells.find((cell) => cell.inMonth)).toEqual({ date: '2026-11-01', inMonth: true });
  });
});
