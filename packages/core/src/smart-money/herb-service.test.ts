import { describe, expect, it, vi } from 'vitest';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { HerbService } from './herb-service';

const connection: HosxpConnection = { host: 'h', port: 3306, user: 'u', password: 'p', database: 'd', dateColumn: 'holiday_date', nameColumn: 'day_name' };

describe('HerbService', () => {
  it('says when HOSxP is not set up', async () => {
    const reader = vi.fn();
    expect(await new HerbService(async () => null, reader).load('2026-11-01', '2026-11-30', ['A'])).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    expect(reader).not.toHaveBeenCalled();
  });

  it('returns the rows, and logs only the driver code on failure', async () => {
    const rows = [{ vn: 'v1' }];
    const ok = await new HerbService(async () => connection, async (_c, start, end, icodes) => { expect([start, end, icodes]).toEqual(['2026-11-01', '2026-11-30', ['A']]); return rows as never; }).load('2026-11-01', '2026-11-30', ['A']);
    expect(ok).toEqual({ ok: true, rows });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = await new HerbService(async () => connection, async () => { throw Object.assign(new Error('Access denied for user secret@host'), { code: 'ER_ACCESS_DENIED_ERROR' }); }).load('2026-11-01', '2026-11-30', ['A']);
    expect(failed).toEqual({ ok: false, code: 'HOSXP_FAILED' });
    expect(log).toHaveBeenCalledWith('[smart-money] herb HOSxP read failed', 'ER_ACCESS_DENIED_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });
});
