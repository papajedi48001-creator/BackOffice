import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@backoffice/db';
import { parseHosxpUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { readOfc } from './ofc-reader';
import { seedFakeHosxp, seedFakeOfc } from './fixtures/fake-hosxp';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithAdmin = adminUrl ? describe : describe.skip;

describeWithAdmin('readOfc against a fake HOSxP schema', () => {
  const name = `hosxp_ofc_${randomUUID().slice(0, 8)}`;
  let admin: Database; let hosxp: Database; let connection: HosxpConnection;

  beforeAll(async () => {
    admin = createDatabase(adminUrl!);
    await admin.execute(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl!); url.pathname = `/${name}`;
    hosxp = createDatabase(url.toString());
    connection = parseHosxpUrl(url.toString())!;
    await seedFakeHosxp(hosxp, {
      patients: [['000001', 'นาย', 'สมมุติ', 'ทดสอบ']], icd: [], paccountopd: [], paccounts: [], pttypes: [['10', 'ข้าราชการ', 'OFC'], ['89', 'บัตรทอง', 'UCS']],
      visits: [
        { vn: '691105000001', hn: '000001', vstdate: '2026-11-05', pttype: '10', diags: [], inc: [], paid: 0, rcpt: 0 },
        { vn: '691105000002', hn: '000002', vstdate: '2026-11-05', pttype: '89', diags: [], inc: [], paid: 0, rcpt: 0 },
        { vn: '691201000003', hn: '000001', vstdate: '2026-12-01', pttype: '10', diags: [], inc: [], paid: 0, rcpt: 0 }
      ]
    });
    await seedFakeOfc(hosxp, {
      items: [['3000001', 'Knee support', '8610'], ['3000002', 'ค่าทำแผล', null]],
      charges: [
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '3000001', qty: 1, price: 500 },
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '3000001', qty: 1, price: 500 },
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '3000002', qty: 1, price: 60 },
        { rxdate: '2026-11-05', vn: '691105000002', hn: '000002', icode: '3000001', qty: 1, price: 500 },
        { rxdate: '2026-12-01', vn: '691201000003', hn: '000001', icode: '3000001', qty: 1, price: 500 }
      ]
    });
  });
  afterAll(async () => { await hosxp?.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('reads only OFC outpatient lines with ADP 8610 in the range, summed by vn and icode, with the patient name', async () => {
    expect(await readOfc(connection, '2026-11-01', '2026-11-30')).toEqual([
      { vstdate: '2026-11-05', vn: '691105000001', hn: '000001', name: 'นาย สมมุติ ทดสอบ', icode: '3000001', itemName: 'Knee support', qty: 2, sumPrice: 1000, pttype: '10', pttypeName: 'ข้าราชการ' }
    ]);
    expect(await readOfc(connection, '2027-01-01', '2027-01-31')).toEqual([]);
  });
});
