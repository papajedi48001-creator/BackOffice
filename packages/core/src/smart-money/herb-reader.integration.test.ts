import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@backoffice/db';
import { parseHosxpUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { readHerb } from './herb-reader';
import { seedFakeHerb, seedFakeHosxp } from './fixtures/fake-hosxp';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithAdmin = adminUrl ? describe : describe.skip;

describeWithAdmin('readHerb against a fake HOSxP schema', () => {
  const name = `hosxp_herb_${randomUUID().slice(0, 8)}`;
  let admin: Database; let hosxp: Database; let connection: HosxpConnection;

  beforeAll(async () => {
    admin = createDatabase(adminUrl!);
    await admin.execute(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl!); url.pathname = `/${name}`;
    hosxp = createDatabase(url.toString());
    connection = parseHosxpUrl(url.toString())!;
    await seedFakeHosxp(hosxp, {
      patients: [], icd: [], paccountopd: [], paccounts: [], pttypes: [['10', 'ข้าราชการ', 'OFC'], ['89', 'บัตรทอง', 'UCS']],
      visits: [
        { vn: '691105000001', hn: '000001', vstdate: '2026-11-05', pttype: '89', diags: [], inc: [], paid: 0, rcpt: 0 },
        { vn: '691105000002', hn: '000002', vstdate: '2026-11-05', pttype: '89', an: '690000123', diags: [], inc: [], paid: 0, rcpt: 0 }
      ]
    });
    await seedFakeHerb(hosxp, {
      drugs: [['1520003', 'ฟ้าทะลายโจร', '400 mg.', 'แคปซูล', 1.5, 2], ['1560027', 'สตรีหลังคลอด', null, null, null, null], ['1000211', 'Paracetamol', '500', 'tab', 0.2, 1]],
      admissions: [['690000123', '691105000002', '10']],
      dispenses: [
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '1520003', qty: 10, price: 20 },
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '1520003', qty: 5, price: 10 },
        { rxdate: '2026-11-05', vn: '691105000001', hn: '000001', icode: '1000211', qty: 10, price: 10 },
        { rxdate: '2026-11-06', vn: '691105000002', an: '690000123', hn: '000002', icode: '1560027', qty: 1, price: 50 },
        { rxdate: '2026-12-01', vn: '691105000001', hn: '000001', icode: '1520003', qty: 1, price: 2 }
      ]
    });
  });
  afterAll(async () => { await hosxp?.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('reads herbal lines of the range, summed by date, vn, an and icode, with the admission สิทธิ first', async () => {
    const rows = await readHerb(connection, '2026-11-01', '2026-11-30', ['1520003', '1560027', '1520003']);
    expect(rows).toEqual([
      { rxdate: '2026-11-05', vn: '691105000001', an: '', hn: '000001', icode: '1520003', drugName: 'ฟ้าทะลายโจร 400 mg.', units: 'แคปซูล', qty: 15, sumPrice: 30, unitcost: 1.5, stdprice: 2, pttype: '89', pttypeName: 'บัตรทอง', hipdata: 'UCS' },
      { rxdate: '2026-11-06', vn: '691105000002', an: '690000123', hn: '000002', icode: '1560027', drugName: 'สตรีหลังคลอด', units: '', qty: 1, sumPrice: 50, unitcost: null, stdprice: null, pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC' }
    ]);
    expect(await readHerb(connection, '2027-01-01', '2027-01-31', ['1520003'])).toEqual([]);
  });
});
