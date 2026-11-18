import { describe, expect, it } from 'vitest';
import type { NhsoCell } from '@backoffice/contracts';
import legacy from './fixtures/fdh-legacy.json';
import { fdhIsoDate, fdhNum, fdhStr, parseFdhDocument, parseFdhRep, parseFdhStm } from './fdh-report';

type Fixture = { name: string; parser: 'rep' | 'stm' | 'any'; fileName: string; sheets: Record<string, NhsoCell[][]>; expected?: unknown; error?: string };

describe('FDH REP/STM parsers match the legacy PHP parsers', () => {
  for (const fixture of legacy as unknown as Fixture[]) {
    it(fixture.name, () => {
      const parse = fixture.parser === 'rep' ? parseFdhRep : fixture.parser === 'stm' ? parseFdhStm : parseFdhDocument;
      const result = parse(fixture.sheets, fixture.fileName);
      if (fixture.error !== undefined) expect(result).toEqual({ ok: false, message: fixture.error });
      else expect(result).toEqual({ ok: true, document: fixture.expected });
    });
  }
});

describe('FDH cell helpers (PHP FdhRepParser::str, num, isoDate)', () => {
  it('writes whole numbers without decimals and trims text', () => {
    expect(fdhStr(691028070326)).toBe('691028070326');
    expect(fdhStr(0.5)).toBe('0.5');
    expect(fdhStr('  AE04 ')).toBe('AE04');
    expect(fdhStr(null)).toBe('');
    expect(fdhStr(true)).toBe('1');
  });
  it('reads numbers with commas and treats "-" and text as 0', () => {
    expect(fdhNum('61,333.25')).toBe(61333.25);
    expect(fdhNum('-')).toBe(0);
    expect(fdhNum(905)).toBe(905);
    expect(fdhNum('abc')).toBe(0);
  });
  it('turns dd/mm/yyyy (พ.ศ. or ค.ศ.) into an ISO date', () => {
    expect(fdhIsoDate('28/10/2026 07:03:00', false)).toBe('2026-10-28');
    expect(fdhIsoDate('28/10/2569', false)).toBe('2026-10-28');
    expect(fdhIsoDate('06/11/2569', true)).toBe('2026-11-06');
    expect(fdhIsoDate('2026-10-28', false)).toBe('');
  });
});
