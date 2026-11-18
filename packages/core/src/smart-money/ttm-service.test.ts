import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { TtmService } from './ttm-service';

const connection: HosxpConnection = { host: 'hosxp.local', port: 3306, database: 'hos', user: 'reader', password: 'secret-pass', dateColumn: 'holiday_date', nameColumn: 'day_name' };

describe('TtmService', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('answers NOT_CONFIGURED without reading when there is no HOSxP connection', async () => {
    const reader = vi.fn();
    expect(await new TtmService(async () => null, reader).load('2026-11-01', '2026-11-30')).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    expect(reader).not.toHaveBeenCalled();
  });

  it('passes the range to the reader and returns its rows', async () => {
    const reader = vi.fn(async () => ({ services: [], visits: [], items: [] }));
    expect(await new TtmService(async () => connection, reader).load('2026-11-01', '2026-11-30')).toEqual({ ok: true, data: { services: [], visits: [], items: [] } });
    expect(reader).toHaveBeenCalledWith(connection, '2026-11-01', '2026-11-30');
  });

  it('answers HOSXP_FAILED and never logs connection details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reader = vi.fn(async () => { throw Object.assign(new Error(`Access denied for user 'reader'@'hosxp.local' (using password: secret-pass)`), { code: 'ER_ACCESS_DENIED_ERROR' }); });
    expect(await new TtmService(async () => connection, reader).load('2026-11-01', '2026-11-30')).toEqual({ ok: false, code: 'HOSXP_FAILED' });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('secret-pass');
    expect(logged).not.toContain('hosxp.local');
  });
});
