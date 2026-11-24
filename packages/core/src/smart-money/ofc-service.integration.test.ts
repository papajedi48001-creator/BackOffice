import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, NhsoCell } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { MoneyMemberService } from './money-member-service';
import { OfcService, type OfcReader } from './ofc-service';
import type { OfcRow } from './ofc-summary';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });
const at = (cells: Record<number, NhsoCell>, n: number): NhsoCell[] => { const row: NhsoCell[] = Array.from({ length: n }, () => null); for (const [k, v] of Object.entries(cells)) row[Number(k)] = v; return row; };
const repFile = (paid: number) => ({ fileName: 'eclaim_11093_OPCS.xls', sheets: {
  Detail: [at({ 0: 'REP', 2: 'TRAN_ID', 8: 'วันเข้ารักษา', 56: 'SEQ NO' }, 57), at({ 0: '691000117', 2: '900000001', 6: 'นาย ทดสอบ หนึ่ง', 8: '20/10/2026 14:50:00', 56: '691020000309' }, 57)],
  'Data Instrument': [at({ 1: 'TRAN_ID', 7: 'ลำดับที่', 8: 'เรียกเก็บ', 12: 'จ่ายชดเชย', 14: 'ปฏิเสธ', 15: 'Error Code' }, 16), at({ 1: '900000001', 5: '1111111111111', 7: '1', 8: '8610', 9: 'อุปกรณ์พยุงส้นเท้า', 10: 2, 11: 4000, 12: 0, 13: paid, 14: '-' }, 16)]
} });
const stmFile = { fileName: 'STM_11093_OP202610_01.xls', sheets: { 'พึงรับ': [
  at({ 0: 'เลขที่เอกสาร 11093_OP202610_01' }, 21),
  at({ 0: 'REP', 6: 'วันเข้ารักษา', 10: 'เรียกเก็บ', 19: 'พึงรับทั้งหมด', 20: 'SEQ NO' }, 21), at({ 13: 'ค่าอวัยวะฯ' }, 21),
  at({ 0: '691000117', 2: '000000001', 4: '1111111111111', 5: 'นาย ทดสอบ หนึ่ง', 6: '20/10/2026 14:50:00', 10: 4300, 13: 4000, 19: 4300, 20: '691020000309' }, 21)
] } };
const hosxpRow: OfcRow = { vstdate: '2026-10-20', vn: '691020000309', hn: '000000001', name: 'นาย ทดสอบ หนึ่ง', icode: '3000001', itemName: 'Insole', qty: 2, sumPrice: 4000, pttype: '10', pttypeName: 'ข้าราชการ' };
const connection = { host: 'hosxp' } as unknown as HosxpConnection;

describeWithDatabase('OfcService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const reader: OfcReader = async (_connection, start, end) => (start <= hosxpRow.vstdate && hosxpRow.vstdate <= end ? [hosxpRow] : []);
  const service = new OfcService(database, async () => connection, reader);
  let manager: string; let viewer: string; let outsider: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('DELETE FROM money_ofc_rep');
    await database.execute('DELETE FROM money_ofc_stm');
    [manager, viewer, outsider] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('ผู้ดู'), insertPerson('อื่น')]);
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: viewer, pages: ['ofc'] });
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: outsider, pages: ['fdh'] });
  });
  afterAll(async () => { await database.close(); });

  it('stores REP lines and Statement rows without names or PID, replaces them on a second upload, and audits counts only', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.upload(boss, repFile(0))).toEqual({ ok: true, kind: 'rep', rows: 1, added: 1, updated: 0, skipped: 0 });
    expect(await service.upload(boss, repFile(4000))).toEqual({ ok: true, kind: 'rep', rows: 1, added: 0, updated: 1, skipped: 0 });
    expect(await service.upload(boss, stmFile)).toEqual({ ok: true, kind: 'stm', rows: 1, added: 1, updated: 0, skipped: 0 });
    const stored = JSON.stringify([...await database.query('SELECT * FROM money_ofc_rep'), ...await database.query('SELECT * FROM money_ofc_stm')]);
    expect(stored).not.toMatch(/1111111111111|ทดสอบ|000000001/);
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'money.ofc.upload' AND actor_person_id = ?", [manager]);
    expect(audits.map((audit) => JSON.parse(audit.metadata) as unknown)).toEqual(expect.arrayContaining([{ kind: 'rep', rows: 1, added: 1, updated: 0 }, { kind: 'stm', rows: 1, added: 1, updated: 0 }]));
  });

  it('refuses a wrong file and a non-manager upload', async () => {
    expect(await service.upload(subject(manager, 'money-manager'), { fileName: 'x.xls', sheets: { Sheet1: [['a']] } })).toMatchObject({ ok: false, code: 'INVALID_REPORT' });
    expect(await service.upload(subject(viewer, null), stmFile)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('gives page members the HOSxP visits matched to REP and Statement, and refuses others', async () => {
    const loaded = await service.load(subject(viewer, null), '2026-10-01', '2026-10-31');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.summary.visits.map((visit) => [visit.vn, visit.status, visit.repPaid, visit.stmPaid])).toEqual([['691020000309', 'paid', 4000, 4000]]);
    expect(loaded.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await service.load(subject(outsider, null), '2026-10-01', '2026-10-31')).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('says when HOSxP is not set up or the read fails', async () => {
    expect(await new OfcService(database, async () => null, reader).load(subject(viewer, null), '2026-10-01', '2026-10-31')).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    const failing: OfcReader = async () => { throw Object.assign(new Error('connect to secret-host'), { code: 'ECONNREFUSED' }); };
    expect(await new OfcService(database, async () => connection, failing).load(subject(viewer, null), '2026-10-01', '2026-10-31')).toEqual({ ok: false, code: 'HOSXP_FAILED' });
  });
});
