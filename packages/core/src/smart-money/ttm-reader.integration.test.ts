import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '@backoffice/db';
import { parseHosxpUrl, type HosxpConnection } from '../holidays/hosxp-settings-service';
import { readTtm } from './ttm-reader';
import { seedFakeHosxp, seedFakeTtm } from './fixtures/fake-hosxp';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithAdmin = adminUrl ? describe : describe.skip;

describeWithAdmin('readTtm against a fake HOSxP schema', () => {
  const name = `hosxp_ttm_${randomUUID().slice(0, 8)}`;
  let admin: Database; let hosxp: Database; let connection: HosxpConnection;

  beforeAll(async () => {
    admin = createDatabase(adminUrl!);
    await admin.execute(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl!); url.pathname = `/${name}`;
    hosxp = createDatabase(url.toString());
    connection = parseHosxpUrl(url.toString())!;
    await seedFakeHosxp(hosxp, {
      patients: [['000001', 'นาย', 'สมชาย', 'ใจดี'], ['000002', 'นาง', 'สมศรี', 'มีสุข']], icd: [], paccountopd: [], paccounts: [],
      pttypes: [['10', 'ข้าราชการ', 'OFC'], ['89', 'บัตรทอง', 'UCS']],
      visits: [
        { vn: '691105000001', hn: '000001', vstdate: '2026-11-05', pttype: '10', diags: [], inc: [], paid: 0, rcpt: 0 },
        { vn: '691105000002', hn: '000002', vstdate: '2026-11-05', pttype: '89', an: '690000123', diags: [], inc: [], paid: 0, rcpt: 0 },
        { vn: '691106000003', hn: '000001', vstdate: '2026-11-06', pttype: '89', diags: [], inc: [], paid: 0, rcpt: 0 }
      ]
    });
    await seedFakeTtm(hosxp, {
      types: [[1, 'ในหน่วยบริการ']], doctors: [[1, 'แพทย์แผนไทย ก']], treatments: [[1, 'นวด'], [2, 'ประคบ']],
      incomes: [['13', 'ค่าบริการฝังเข็ม'], ['04', 'ค่ายาแผนไทย']], drugs: [['1560028', 'อำมฤควาที 15 g.']], nondrugs: [['3015001', 'M12 นวดทั้งตัว']],
      services: [
        { vn: '691105000001', hn: '000001', date: '2026-11-05', time: '09:30:00', type: 1, doctor: 1, treatment: 1 },
        { vn: '691105000001', hn: '000001', date: '2026-11-05', time: '09:45:00', type: 1, doctor: 1, treatment: 2 },
        { vn: '691105000002', hn: '000002', date: '2026-11-05', time: '16:30:00', type: 1, doctor: 1, treatment: 1 },
        { vn: '691106000003', hn: '000001', date: '2026-11-06', time: null, type: 1, doctor: 1, treatment: 1 }
      ],
      charges: [
        { vn: '691105000001', icode: '3015001', income: '13', qty: 1, price: 200 },
        { vn: '691105000001', icode: '3015001', income: '13', qty: 1, price: 50 },
        { vn: '691105000001', icode: '1560028', income: '04', qty: 2, price: 120.5 },
        { vn: '691105000002', icode: '1560028', income: '04', qty: 1, price: 60 },
        { vn: '691106000003', icode: '3015001', income: '13', qty: 1, price: 250 }
      ]
    });
  });
  afterAll(async () => { await hosxp?.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('reads services, visits and summed charge lines of the range with Thai repaired', async () => {
    const data = await readTtm(connection, '2026-11-05', '2026-11-05');
    expect(data.services).toHaveLength(3);
    expect(data.services[0]).toEqual({ vn: '691105000001', hn: '000001', an: '', serviceDate: '2026-11-05', serviceTime: '09:30:00', typeId: '1', typeName: 'ในหน่วยบริการ', doctorName: 'แพทย์แผนไทย ก', treatmentName: 'นวด', patientName: 'นายสมชาย ใจดี' });
    expect(data.visits).toEqual(expect.arrayContaining([{ vn: '691105000002', an: '690000123', pttype: '89', pttypeName: 'บัตรทอง', hipdata: 'UCS' }]));
    expect(data.visits).toHaveLength(2);
    const items = [...data.items].sort((a, b) => (a.vn + a.icode < b.vn + b.icode ? -1 : 1));
    expect(items).toEqual([
      { vn: '691105000001', icode: '1560028', income: '04', incomeName: 'ค่ายาแผนไทย', itemName: 'อำมฤควาที 15 g.', isDrug: true, qty: 2, amount: 120.5 },
      { vn: '691105000001', icode: '3015001', income: '13', incomeName: 'ค่าบริการฝังเข็ม', itemName: 'M12 นวดทั้งตัว', isDrug: false, qty: 2, amount: 250 },
      { vn: '691105000002', icode: '1560028', income: '04', incomeName: 'ค่ายาแผนไทย', itemName: 'อำมฤควาที 15 g.', isDrug: true, qty: 1, amount: 60 }
    ]);
  });

  it('reads a service with no time and returns nothing for an empty range', async () => {
    expect((await readTtm(connection, '2026-11-06', '2026-11-06')).services[0]?.serviceTime).toBe('');
    expect(await readTtm(connection, '2026-12-01', '2026-12-31')).toEqual({ services: [], visits: [], items: [] });
  });
});
