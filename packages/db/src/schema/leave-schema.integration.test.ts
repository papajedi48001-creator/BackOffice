import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const civilServant = '00000000-0000-4000-8000-000000000001';

describeWithDatabase('leave schema (migration 0011)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('seeds the five leave types in sort order, all approved at hospital level', async () => {
    const rows = await db.query<{ code: string; counting: string; target: string; attachment: string | null }>('SELECT code, counting, approval_target AS target, CAST(attachment_required_from_days AS CHAR) AS attachment FROM leave_type WHERE id LIKE ? ORDER BY sort_order', ['00000000-0000-4000-9000-%']);
    expect(rows.map((row) => row.code)).toEqual(['SICK', 'PERSONAL', 'VACATION', 'MATERNITY', 'PATERNITY']);
    expect(rows.every((row) => row.target === 'HOSPITAL')).toBe(true);
    expect(rows.find((row) => row.code === 'MATERNITY')?.counting).toBe('CALENDAR_DAYS');
    expect(rows.find((row) => row.code === 'SICK')?.attachment).toBe('30.0');
  });

  it('limits ลาคลอดบุตร to women and ลาไปช่วยภริยาคลอดบุตร to men', async () => {
    const rows = await db.query<{ code: string; gender: string | null }>('SELECT code, eligible_gender AS gender FROM leave_type WHERE id LIKE ? ORDER BY sort_order', ['00000000-0000-4000-9000-%']);
    expect(rows).toEqual([{ code: 'SICK', gender: null }, { code: 'PERSONAL', gender: null }, { code: 'VACATION', gender: null }, { code: 'MATERNITY', gender: 'FEMALE' }, { code: 'PATERNITY', gender: 'MALE' }]);
  });

  it('seeds the civil servant entitlements', async () => {
    const rows = await db.query<{ code: string; perYear: string; firstYear: string | null; cap: string | null; cap10: string | null; minMonths: number }>('SELECT t.code, CAST(e.days_per_year AS CHAR) AS perYear, CAST(e.first_year_days AS CHAR) AS firstYear, CAST(e.max_accumulated_days AS CHAR) AS cap, CAST(e.max_accumulated_days_after_10_years AS CHAR) AS cap10, e.min_service_months AS minMonths FROM leave_entitlement e JOIN leave_type t ON t.id = e.leave_type_id WHERE e.employment_type_id = ? ORDER BY t.sort_order', [civilServant]);
    expect(rows.map((row) => [row.code, row.perYear])).toEqual([['SICK', '60.0'], ['PERSONAL', '45.0'], ['VACATION', '10.0'], ['MATERNITY', '90.0'], ['PATERNITY', '15.0']]);
    expect(rows.find((row) => row.code === 'PERSONAL')?.firstYear).toBe('15.0');
    expect(rows.find((row) => row.code === 'VACATION')).toMatchObject({ cap: '20.0', cap10: '30.0', minMonths: 6 });
  });

  it('seeds a minimum of 15 working days per month', async () => {
    const rows = await db.query<{ minimum: number }>('SELECT min_working_days_per_month AS minimum FROM leave_setting WHERE id = 1');
    expect(rows).toEqual([{ minimum: 15 }]);
  });

  it('keeps the seeds unchanged when migrations run again', async () => {
    await runMigrations(db);
    const [types] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM leave_type WHERE id LIKE ?', ['00000000-0000-4000-9000-%']);
    const [entitlements] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM leave_entitlement WHERE employment_type_id = ?', [civilServant]);
    const [settings] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM leave_setting');
    expect([Number(types?.count), Number(entitlements?.count), Number(settings?.count)]).toEqual([5, 5, 1]);
  });
});
