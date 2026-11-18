import { describe, expect, it, vi } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { PttypeMappingService } from './pttype-mapping-service';

const subject = (role: string | null): AccessSubject & { personId: string } => ({ authenticated: true, personId: 'p1', roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [] });
const connection = { host: 'h', port: 3306, database: 'hos', user: 'u', password: 'secret', dateColumn: 'd', nameColumn: 'n' } satisfies HosxpConnection;
const unusedDatabase = new Proxy({}, { get: () => { throw new Error('database not expected'); } }) as Database;
const input = { opd: 'P1', ipd: null, expected: { opd: null, ipd: null } };
const driverError = (errno: number) => Object.assign(new Error(`denied for user 'u'@'h' password secret`), { errno, code: 'ER_X' });

const service = (write: ReturnType<typeof vi.fn>, resolved: HosxpConnection | null = connection) =>
  new PttypeMappingService(unusedDatabase, async () => resolved, { read: vi.fn(), write });

describe('PttypeMappingService.save', () => {
  it('refuses anyone but ผู้ดูแลระบบ and ผู้จัดการโมดูล without touching HOSxP', async () => {
    const write = vi.fn();
    expect(await service(write).save(subject('money-manager'), '34', input)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled();
  });

  it('reports a missing HOSxP connection', async () => {
    expect(await service(vi.fn(), null).save(subject('admin'), '34', input)).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
  });

  it('turns a refused write into NO_WRITE_PERMISSION and logs only the code', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await service(vi.fn().mockRejectedValue(driverError(1142))).save(subject('admin'), '34', input)).toEqual({ ok: false, code: 'NO_WRITE_PERMISSION' });
    expect(await service(vi.fn().mockRejectedValue(driverError(2003))).save(subject('admin'), '34', input)).toEqual({ ok: false, code: 'HOSXP_FAILED' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });

  it('passes the writer refusal through without an audit row', async () => {
    expect(await service(vi.fn().mockResolvedValue({ ok: false, code: 'STALE' })).save(subject('pttype-mapping-manager'), '34', input)).toEqual({ ok: false, code: 'STALE' });
  });
});

describe('PttypeMappingService.load', () => {
  it('reports a failed HOSxP read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = new PttypeMappingService(unusedDatabase, async () => connection, { read: vi.fn().mockRejectedValue(driverError(2003)), write: vi.fn() });
    expect(await failing.load()).toEqual({ ok: false, code: 'HOSXP_FAILED' });
    log.mockRestore();
  });
});
