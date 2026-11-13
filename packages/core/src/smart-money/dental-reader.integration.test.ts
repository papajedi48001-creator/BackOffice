import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@backoffice/db';
import { parseHosxpUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { readDentalClaims } from './dental-reader';
import { seedFakeHosxp } from './fixtures/fake-hosxp';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithAdmin = adminUrl ? describe : describe.skip;

describeWithAdmin('readDentalClaims against a fake HOSxP schema', () => {
  const name = `hosxp_fake_${randomUUID().slice(0, 8)}`;
  let admin: Database; let hosxp: Database; let connection: HosxpConnection;

  beforeAll(async () => {
    admin = createDatabase(adminUrl!);
    await admin.execute(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl!); url.pathname = `/${name}`;
    hosxp = createDatabase(url.toString());
    connection = parseHosxpUrl(url.toString())!;
    await seedFakeHosxp(hosxp, {
      patients: [['000001', 'นาย', 'สมชาย', 'ใจดี'], ['000002', 'นาง', 'สมศรี', 'มีสุข']],
      icd: [['K021', 'ฟันผุที่เนื้อฟัน'], ['K051', 'เหงือกอักเสบเรื้อรัง'], ['J00', 'หวัด']],
      pttypes: [['10', 'ชำระเงินเอง'], ['89', 'บัตรทอง'], ['34', 'ข้าราชการ']],
      paccountopd: [['10', 'P10', 2026], ['89', 'P89OLD', 2025], ['89', 'P89NEW', 2027], ['89', 'P89B', 2026], ['89', 'P89A', 2026]],
      paccounts: [['P10', 2026, 'ลูกหนี้ชำระเงิน'], ['P89OLD', 2025, 'ลูกหนี้ UC เก่า'], ['P89NEW', 2027, 'ลูกหนี้ UC ล่าสุด'], ['P89A', 2026, 'ลูกหนี้ UC ปีนี้ A'], ['P89B', 2026, 'ลูกหนี้ UC ปีนี้ B']],
      visits: [
        { vn: '691103000001', hn: '000001', vstdate: '2026-11-03', pttype: '89', diags: ['K021', 'K051', 'J00'], inc: [500, 300], paid: 0, rcpt: 800 },
        { vn: '691104000002', hn: '000002', vstdate: '2026-11-04', pttype: '10', diags: ['K051'], inc: [1000], paid: 400, rcpt: 0 },
        { vn: '691105000003', hn: '000002', vstdate: '2026-11-05', pttype: '10', diags: ['K021'], inc: [200], paid: 200, rcpt: 0 },
        { vn: '691201000004', hn: '000001', vstdate: '2026-12-01', pttype: '34', diags: ['K021'], inc: [100], paid: 0, rcpt: 100 }
      ]
    });
  });
  afterAll(async () => { await hosxp?.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('reads K00–K11 debtor visits in the range, one row per diagnosis, with Thai repaired', async () => {
    const rows = await readDentalClaims(connection, '2026-11-01', '2026-11-30');
    expect(rows.map((row) => [row.vn, row.diagCode])).toEqual([['691103000001', 'K021'], ['691103000001', 'K051'], ['691104000002', 'K051']]);
    expect(rows[0]).toEqual({ vn: '691103000001', vstdate: '2026-11-03', hn: '000001', patientName: 'นายสมชาย ใจดี', diagCode: 'K021', diagName: 'ฟันผุที่เนื้อฟัน', pttypeCode: '89', pttypeName: 'บัตรทอง', paccountName: 'ลูกหนี้ UC ปีนี้ A', totalAmount: 800, paidMoney: 0, claimAmount: 800 });
    expect(rows[2]).toMatchObject({ paccountName: 'ลูกหนี้ชำระเงิน', totalAmount: 1000, paidMoney: 400, claimAmount: 0 });
  });

  it('falls back to the latest ผังบัญชี year and to null when the pttype has none', async () => {
    const rows = await readDentalClaims(connection, '2026-12-01', '2026-12-31');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paccountName).toBeNull();
    const hos = createDatabase(`${adminUrl!.replace(/\/[^/]*$/, '')}/${name}`);
    await hos.execute("UPDATE ovst SET vstdate = '2028-01-05', pttype = '89' WHERE vn = '691201000004'");
    await hos.close();
    const later = await readDentalClaims(connection, '2028-01-01', '2028-01-31');
    expect(later[0]!.paccountName).toBe('ลูกหนี้ UC ล่าสุด');
  });
});
