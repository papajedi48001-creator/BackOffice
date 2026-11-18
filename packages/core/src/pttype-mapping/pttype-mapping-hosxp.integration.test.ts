import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@backoffice/db';
import { parseHosxpUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { readPttypeMappings, writePttypeMapping } from './pttype-mapping-hosxp';
import { seedFakeMappingHosxp } from './fixtures/fake-hosxp-mapping';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithAdmin = adminUrl ? describe : describe.skip;

describeWithAdmin('Mapping สิทธิ against a fake HOSxP schema', () => {
  let admin: Database; let hosxp: Database | null = null; let connection: HosxpConnection; let name = '';

  beforeEach(async () => {
    admin ??= createDatabase(adminUrl!);
    if (hosxp) { await hosxp.close(); await admin.execute(`DROP DATABASE ${name}`); }
    name = `hosxp_map_${randomUUID().slice(0, 8)}`;
    await admin.execute(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl!); url.pathname = `/${name}`;
    hosxp = createDatabase(url.toString());
    connection = parseHosxpUrl(url.toString())!;
    await seedFakeMappingHosxp(hosxp, {
      pttypes: [['89', 'บัตรทอง', 'Y'], ['10', 'ชำระเงินเอง', 'Y'], ['34', 'ประกันสังคม', 'Y'], ['99', 'เลิกใช้', 'N']],
      paccounts: [['P10', 2017, 'ลูกหนี้ชำระเงิน', 'all'], ['P89', 2016, 'ลูกหนี้ UC เก่า', 'opd'], ['P89', 2026, 'ลูกหนี้ UC-OP', 'OPD'], ['PIP', 2026, 'ลูกหนี้ UC-IP', 'ipd'], ['POLD', 2016, 'ลูกหนี้เดิม', 'opd']],
      opd: [['89', 'POLD', 2016, '2020-01-01 08:00:00'], ['89', 'P89', 2017, '2026-11-01 09:00:00'], ['10', 'P10', 2017, null], ['34', 'GONE', 2017, '2026-10-02 10:30:00']],
      ipd: [['89', 'PIP', 2017, '2026-11-01 09:00:00']]
    });
  });

  afterAll(async () => {
    if (hosxp) { await hosxp.close(); await admin.execute(`DROP DATABASE ${name}`); }
    await admin?.close();
  });

  const rows = (side: 'opd' | 'ipd', pttype: string) => hosxp!.query<{ paccount: string; iclaim_status: number; paccount_year: number; recent: number }>(`SELECT paccount, iclaim_status, paccount_year, last_modify > NOW() - INTERVAL 1 MINUTE AS recent FROM paccount${side} WHERE pttype = ?`, [pttype]);

  it('reads the สิทธิ in use with the latest row per side and Thai names repaired', async () => {
    const snapshot = await readPttypeMappings(connection);
    expect(snapshot.rights.map((right) => right.code)).toEqual(['10', '34', '89']);
    const uc = snapshot.rights.find((right) => right.code === '89')!;
    expect(uc).toEqual({ code: '89', name: 'บัตรทอง', opd: { code: 'P89', name: 'ลูกหนี้ UC-OP', modifiedAt: '2026-11-01 09:00:00' }, ipd: { code: 'PIP', name: 'ลูกหนี้ UC-IP', modifiedAt: '2026-11-01 09:00:00' } });
    expect(snapshot.rights.find((right) => right.code === '10')).toMatchObject({ opd: { code: 'P10', modifiedAt: null }, ipd: null });
  });

  it('keeps a mapped code that is no longer in ผังบัญชี, without a name', async () => {
    const snapshot = await readPttypeMappings(connection);
    expect(snapshot.rights.find((right) => right.code === '34')!.opd).toEqual({ code: 'GONE', name: null, modifiedAt: '2026-10-02 10:30:00' });
  });

  it('offers each code once by type, named from its latest year', async () => {
    const snapshot = await readPttypeMappings(connection);
    expect(snapshot.opdAccounts).toEqual([{ code: 'P10', name: 'ลูกหนี้ชำระเงิน' }, { code: 'P89', name: 'ลูกหนี้ UC-OP' }, { code: 'POLD', name: 'ลูกหนี้เดิม' }]);
    expect(snapshot.ipdAccounts).toEqual([{ code: 'P10', name: 'ลูกหนี้ชำระเงิน' }, { code: 'PIP', name: 'ลูกหนี้ UC-IP' }]);
  });

  it('replaces every row of the changed side with one stamped row and leaves the other side alone', async () => {
    const result = await writePttypeMapping(connection, '89', { opd: 'P10', ipd: 'PIP', expected: { opd: 'P89', ipd: 'PIP' } });
    expect(result).toEqual({ ok: true, from: { opd: 'P89', ipd: 'PIP' } });
    expect(await rows('opd', '89')).toEqual([{ paccount: 'P10', iclaim_status: 1, paccount_year: 2017, recent: 1 }]);
    expect(await rows('ipd', '89')).toEqual([{ paccount: 'PIP', iclaim_status: 1, paccount_year: 2017, recent: 0 }]);
  });

  it('clears a side when the new value is ยังไม่ผูก', async () => {
    expect(await writePttypeMapping(connection, '10', { opd: null, ipd: 'P10', expected: { opd: 'P10', ipd: null } })).toEqual({ ok: true, from: { opd: 'P10', ipd: null } });
    expect(await rows('opd', '10')).toEqual([]);
    expect(await rows('ipd', '10')).toEqual([{ paccount: 'P10', iclaim_status: 1, paccount_year: 2017, recent: 1 }]);
  });

  it('refuses a change made on values someone has changed since', async () => {
    expect(await writePttypeMapping(connection, '89', { opd: 'P10', ipd: 'PIP', expected: { opd: 'POLD', ipd: 'PIP' } })).toEqual({ ok: false, code: 'STALE' });
    expect((await rows('opd', '89')).map((row) => row.paccount).sort()).toEqual(['P89', 'POLD']);
  });

  it('refuses an unknown or wrong-type ผังบัญชี, a สิทธิ not in use, and no change', async () => {
    expect(await writePttypeMapping(connection, '89', { opd: 'PIP', ipd: 'PIP', expected: { opd: 'P89', ipd: 'PIP' } })).toEqual({ ok: false, code: 'INVALID_ACCOUNT' });
    expect(await writePttypeMapping(connection, '89', { opd: 'NOPE', ipd: 'PIP', expected: { opd: 'P89', ipd: 'PIP' } })).toEqual({ ok: false, code: 'INVALID_ACCOUNT' });
    expect(await writePttypeMapping(connection, '99', { opd: 'P10', ipd: null, expected: { opd: null, ipd: null } })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await writePttypeMapping(connection, 'ZZ', { opd: 'P10', ipd: null, expected: { opd: null, ipd: null } })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await writePttypeMapping(connection, '89', { opd: 'P89', ipd: 'PIP', expected: { opd: 'P89', ipd: 'PIP' } })).toEqual({ ok: false, code: 'NO_CHANGE' });
  });

  it('keeps a mapped code missing from ผังบัญชี when only the other side changes', async () => {
    expect(await writePttypeMapping(connection, '34', { opd: 'GONE', ipd: 'PIP', expected: { opd: 'GONE', ipd: null } })).toEqual({ ok: true, from: { opd: 'GONE', ipd: null } });
    expect(await rows('opd', '34')).toEqual([{ paccount: 'GONE', iclaim_status: 1, paccount_year: 2017, recent: 0 }]);
  });

  it('rolls the whole change back when an insert fails', async () => {
    await hosxp!.execute("CREATE TRIGGER fail_opd BEFORE INSERT ON paccountopd FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'boom'");
    await expect(writePttypeMapping(connection, '89', { opd: 'P10', ipd: 'P10', expected: { opd: 'P89', ipd: 'PIP' } })).rejects.toThrow();
    expect((await rows('opd', '89')).map((row) => row.paccount).sort()).toEqual(['P89', 'POLD']);
    expect(await rows('ipd', '89')).toEqual([{ paccount: 'PIP', iclaim_status: 1, paccount_year: 2017, recent: 0 }]);
  });

  it('refuses to write when a mapping table cannot roll back', async () => {
    await hosxp!.execute('ALTER TABLE paccountipd ENGINE = MyISAM');
    expect(await writePttypeMapping(connection, '89', { opd: 'P10', ipd: 'PIP', expected: { opd: 'P89', ipd: 'PIP' } })).toEqual({ ok: false, code: 'NOT_TRANSACTIONAL' });
    expect((await rows('opd', '89')).map((row) => row.paccount).sort()).toEqual(['P89', 'POLD']);
  });
});
