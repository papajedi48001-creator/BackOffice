import { describe, expect, it, vi } from 'vitest';
import { DENTAL_SQL } from './dental-reader';
import { HERB_SQL } from './herb-reader';
import { isReadOnlySelect, withReadOnlyFallback } from './hosxp-read-only';
import { TTM_SQL } from './ttm-reader';

describe('isReadOnlySelect (legacy TtmRepository::isReadOnly)', () => {
  it('lets every Smart Money HOSxP query through: ทันตกรรม, แพทย์แผนไทย, สมุนไพร', () => {
    for (const sql of [DENTAL_SQL, HERB_SQL, ...Object.values(TTM_SQL)]) expect(isReadOnlySelect(sql)).toBe(true);
  });

  it('refuses anything that is not one SELECT', () => {
    expect(isReadOnlySelect('UPDATE ovst SET pttype = 1')).toBe(false);
    expect(isReadOnlySelect('SELECT 1; DELETE FROM ovst')).toBe(false);
    expect(isReadOnlySelect('select * from ovst for update lock')).toBe(false);
    expect(isReadOnlySelect('SELECT * INTO  OUTFILE "/tmp/x" FROM ovst')).toBe(false);
    expect(isReadOnlySelect('  select vn from ovst')).toBe(true);
    expect(isReadOnlySelect('SELECT updated_at FROM ovst')).toBe(true);
  });
});

describe('withReadOnlyFallback', () => {
  const fakeDb = (fail: unknown) => {
    const calls: unknown[] = [];
    return { calls, db: { transaction: async (work: (tx: unknown) => Promise<unknown>, options?: unknown) => { calls.push(options); if (options && fail) throw fail; return work('tx'); } } };
  };

  it('runs the work in a READ ONLY transaction', async () => {
    const { calls, db } = fakeDb(null);
    expect(await withReadOnlyFallback(db as never, async () => 'rows')).toBe('rows');
    expect(calls).toEqual([{ readOnly: true }]);
  });

  it('falls back to a plain transaction when an old server cannot parse READ ONLY, as legacy did', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { calls, db } = fakeDb(Object.assign(new Error('syntax near READ ONLY'), { code: 'ER_PARSE_ERROR' }));
    expect(await withReadOnlyFallback(db as never, async () => 'rows')).toBe('rows');
    expect(calls).toEqual([{ readOnly: true }, undefined]);
    expect(JSON.stringify(log.mock.calls)).toContain('ER_PARSE_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain('ttm');
    log.mockRestore();
  });

  it('does not retry other errors', async () => {
    const { calls, db } = fakeDb(Object.assign(new Error('denied'), { code: 'ER_ACCESS_DENIED_ERROR' }));
    await expect(withReadOnlyFallback(db as never, async () => 'rows')).rejects.toMatchObject({ code: 'ER_ACCESS_DENIED_ERROR' });
    expect(calls).toHaveLength(1);
  });
});
