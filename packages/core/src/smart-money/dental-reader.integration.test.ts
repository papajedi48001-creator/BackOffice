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
      // Mapping สิทธิ stamps last_modify and writes year 2017; the latest stamped row wins whatever its year or the visit's.
      paccountopd: [['10', 'P10', 2026], ['89', 'P89OLD', 2026, '2020-01-01 08:00:00'], ['89', 'P89NEW', 2017, '2026-11-01 09:00:00'], ['89', 'P89A', 2026]],
      paccounts: [['P10', 2026, 'ลูกหนี้ชำระเงิน'], ['P89OLD', 2026, 'ลูกหนี้ UC เก่า'], ['P89NEW', 2025, 'ลูกหนี้ UC ชื่อเดิม'], ['P89NEW', 2027, 'ลูกหนี้ UC ล่าสุด'], ['P89A', 2026, 'ลูกหนี้ UC ไม่มีเวลา']],
      doctors: [['D01', 'ทพ.สมหมาย'], ['D02', 'ทพญ.วิไล'], ['H01', 'นางสาวช่วย']],
      visits: [
        // Two dtmain rows for one visit: still one row, the lowest doctor code. J00 is a secondary diagnosis.
        { vn: '691103000001', hn: '000001', vstdate: '2026-11-03', pttype: '89', diags: ['K021', 'K051', 'J00'], inc: [500, 300], paid: 0, rcpt: 800, dental: [['D02', null], ['D01', 'H01']], icodes: ['1000001', '3013076'] },
        // Paid more than charged would be negative: ลูกหนี้ 0. Main diagnosis is not a K-code and still shows.
        { vn: '691104000002', hn: '000002', vstdate: '2026-11-04', pttype: '10', diags: ['J00'], inc: [1000], paid: 400, rcpt: 0, dental: [['D01', null]] },
        { vn: '691105000003', hn: '000002', vstdate: '2026-11-05', pttype: '10', diags: ['K021'], inc: [200], paid: 200, rcpt: 0, dental: [['D01', null]] },
        // K-code but no dental work: not selected.
        { vn: '691106000005', hn: '000001', vstdate: '2026-11-06', pttype: '10', diags: ['K021'], inc: [300], paid: 0, rcpt: 300 },
        // Dental work with no diagnosis at all.
        { vn: '691107000006', hn: '000002', vstdate: '2026-11-07', pttype: '10', diags: [], inc: [100, 50], paid: 0, rcpt: 0, dental: [['D02', 'H01']] },
        { vn: '691201000004', hn: '000001', vstdate: '2026-12-01', pttype: '34', diags: ['K021'], inc: [100], paid: 0, rcpt: 100, dental: [['D01', null]] }
      ]
    });
  });
  afterAll(async () => { await hosxp?.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('reads one row per dental (dtmain) debtor visit with its main diagnosis, dentist and Thai repaired', async () => {
    const rows = await readDentalClaims(connection, '2026-11-01', '2026-11-30');
    expect(rows.map((row) => [row.vn, row.diagCode])).toEqual([['691103000001', 'K021'], ['691104000002', 'J00'], ['691107000006', '']]);
    expect(rows[0]).toEqual({ vn: '691103000001', vstdate: '2026-11-03', hn: '000001', patientName: 'นายสมชาย  ใจดี', diagCode: 'K021', diagName: 'ฟันผุที่เนื้อฟัน', doctorName: 'ทพ.สมหมาย', helperName: 'นางสาวช่วย', isDenture: true, pttypeCode: '89', pttypeName: 'บัตรทอง', paccountName: 'ลูกหนี้ UC ล่าสุด', totalAmount: 800, paidMoney: 0, claimAmount: 800 });
    expect(rows[1]).toMatchObject({ diagName: 'หวัด', helperName: '', isDenture: false, paccountName: 'ลูกหนี้ชำระเงิน', totalAmount: 1000, paidMoney: 400, claimAmount: 600 });
    expect(rows[2]).toMatchObject({ diagName: '', doctorName: 'ทพญ.วิไล', totalAmount: 150, claimAmount: 150 });
  });

  it('never makes ลูกหนี้ negative', async () => {
    const hos = createDatabase(`${adminUrl!.replace(/\/[^/]*$/, '')}/${name}`);
    await hos.execute("UPDATE vn_stat SET paid_money = 900, rcpt_money = 5 WHERE vn = '691103000001'");
    await hos.close();
    const rows = await readDentalClaims(connection, '2026-11-03', '2026-11-03');
    expect(rows[0]).toMatchObject({ totalAmount: 800, paidMoney: 900, claimAmount: 0 });
  });

  it('uses the latest stamped mapping whatever the visit year, and null when the pttype has none', async () => {
    const rows = await readDentalClaims(connection, '2026-12-01', '2026-12-31');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paccountName).toBeNull();
    const hos = createDatabase(`${adminUrl!.replace(/\/[^/]*$/, '')}/${name}`);
    await hos.execute("UPDATE ovst SET vstdate = '2028-01-05', pttype = '89' WHERE vn = '691201000004'");
    await hos.execute("UPDATE dtmain SET vstdate = '2028-01-05' WHERE vn = '691201000004'");
    await hos.close();
    const later = await readDentalClaims(connection, '2028-01-01', '2028-01-31');
    expect(later[0]!.paccountName).toBe('ลูกหนี้ UC ล่าสุด');
  });
});
