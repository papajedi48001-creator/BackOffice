import { describe, expect, it, vi } from 'vitest';
import { isTtmReadOnlySql, TTM_SQL, withReadOnlyFallback } from './ttm-reader';

describe('isTtmReadOnlySql (legacy TtmRepository::isReadOnly)', () => {
  it('lets the three queries through', () => {
    for (const sql of Object.values(TTM_SQL)) expect(isTtmReadOnlySql(sql)).toBe(true);
  });

  it('refuses anything that is not one SELECT', () => {
    expect(isTtmReadOnlySql('UPDATE ovst SET pttype = 1')).toBe(false);
    expect(isTtmReadOnlySql('SELECT 1; DELETE FROM ovst')).toBe(false);
    expect(isTtmReadOnlySql('select * from ovst for update lock')).toBe(false);
    expect(isTtmReadOnlySql('SELECT * INTO  OUTFILE "/tmp/x" FROM ovst')).toBe(false);
    expect(isTtmReadOnlySql('  select vn from ovst')).toBe(true);
    expect(isTtmReadOnlySql('SELECT updated_at FROM ovst')).toBe(true);
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
    log.mockRestore();
  });

  it('does not retry other errors', async () => {
    const { calls, db } = fakeDb(Object.assign(new Error('denied'), { code: 'ER_ACCESS_DENIED_ERROR' }));
    await expect(withReadOnlyFallback(db as never, async () => 'rows')).rejects.toMatchObject({ code: 'ER_ACCESS_DENIED_ERROR' });
    expect(calls).toHaveLength(1);
  });
});
