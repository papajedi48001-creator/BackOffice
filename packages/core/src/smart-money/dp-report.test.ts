import { describe, expect, it } from 'vitest';
import type { NhsoCell } from '@backoffice/contracts';
import legacy from './fixtures/dp-legacy.json';
import { dpFiscalYear, isDp, parseDp } from './dp-report';

type Fixture = { name: string; rows: (NhsoCell[] | null)[]; isDp: boolean; expected?: unknown; error?: string };

describe('Point ฟื้นฟูผู้พิการ parser matches the legacy DpParser', () => {
  for (const fixture of legacy as unknown as Fixture[]) {
    it(fixture.name, () => {
      expect(isDp(fixture.rows)).toBe(fixture.isDp);
      const result = parseDp(fixture.rows);
      if (fixture.error !== undefined) expect(result).toEqual({ ok: false, message: fixture.error });
      else expect(result).toEqual({ ok: true, ...(fixture.expected as object) });
    });
  }
});

describe('dpFiscalYear', () => {
  it('starts ปีงบ in October (พ.ศ.)', () => {
    expect(dpFiscalYear('2025-10-01')).toBe(2569);
    expect(dpFiscalYear('2025-09-30')).toBe(2568);
  });
});
