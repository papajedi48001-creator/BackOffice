import { describe, expect, it, vi } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { editorMatchesStamp, PttypeMappingService } from './pttype-mapping-service';

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

describe('editorMatchesStamp', () => {
  it('credits the BackOffice editor only when their save is the latest HOSxP stamp (HOSxP keeps Bangkok time)', () => {
    expect(editorMatchesStamp('2026-11-13T07:05:00.000Z', '2026-11-13 14:05:01')).toBe(true);
    expect(editorMatchesStamp('2026-11-13T07:05:00.000Z', '2026-11-13 14:12:00')).toBe(true);
    expect(editorMatchesStamp('2026-11-01T02:00:00.000Z', '2026-11-10 09:00:00')).toBe(false);
    expect(editorMatchesStamp('2026-11-13T07:05:00.000Z', '2026-11-13 13:00:00')).toBe(false);
    expect(editorMatchesStamp('2026-11-13T07:05:00.000Z', null)).toBe(true);
  });
});

describe('PttypeMappingService.load editors', () => {
  it('drops the BackOffice editor when HOSxP was changed after their save', async () => {
    const at = (iso: string) => ({ id: iso, target_id: iso === '2026-11-01T02:00:00.000Z' ? '89' : '10', metadata: '{}', at: iso, actor_name: 'อลิซ' });
    const database = { query: vi.fn().mockResolvedValue([at('2026-11-01T02:00:00.000Z'), at('2026-11-13T07:05:00.000Z')]) } as unknown as Database;
    const right = (code: string, stamp: string) => ({ code, name: code, opd: { code: 'P', name: 'P', modifiedAt: stamp }, ipd: null });
    const read = vi.fn().mockResolvedValue({ rights: [right('89', '2026-11-10 09:00:00'), right('10', '2026-11-13 14:05:00')], opdAccounts: [], ipdAccounts: [] });
    const loaded = await new PttypeMappingService(database, async () => connection, { read, write: vi.fn() }).load();
    expect(loaded.ok && Object.keys(loaded.editors)).toEqual(['10']);
  });
});
