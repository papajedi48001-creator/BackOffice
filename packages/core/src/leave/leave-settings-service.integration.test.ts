import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LeaveSettingsService } from './leave-settings-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const governmentEmployee = '00000000-0000-4000-8000-000000000002';
const sick = '00000000-0000-4000-9000-000000000001';

describeWithDatabase('LeaveSettingsService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LeaveSettingsService(database);
  const actor = randomUUID();
  // Codes stay unique across runs because the test database is kept between them.
  const unique = () => `ORDINATION_${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const audits = (id: string) => database.query<{ action: string; metadata: string }>('SELECT action, metadata FROM audit_event WHERE target_id = ? ORDER BY created_at', [id]);
  const typeInput = (name: string) => ({ name, counting: 'WORKING_DAYS' as const, approvalTarget: 'HOSPITAL' as const, attachmentRequiredFromDays: null, isActive: true, sortOrder: 90 });

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => {
    await database.execute('DELETE FROM leave_entitlement WHERE employment_type_id = ? AND leave_type_id = ?', [governmentEmployee, sick]);
    await database.execute("DELETE FROM leave_holiday WHERE holiday_date = '2026-12-05'");
    await database.execute('UPDATE leave_setting SET min_working_days_per_month = 15 WHERE id = 1');
    await database.close();
  });

  it('lists the five seeded types in order', async () => {
    const types = await service.listTypes();
    expect(types.slice(0, 5).map((type) => type.code)).toEqual(['SICK', 'PERSONAL', 'VACATION', 'MATERNITY', 'PATERNITY']);
    expect(types[0]).toMatchObject({ id: sick, name: 'ลาป่วย', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: 30, isActive: true, sortOrder: 1 });
  });

  it('creates a type with an audit event and rejects a duplicate code or name', async () => {
    const code = unique();
    const created = await service.createType({ code, ...typeInput(`ลาอุปสมบท ${code}`) }, actor);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await audits(created.id!)).map((event) => event.action)).toEqual(['leave.type.create']);
    expect(await service.createType({ code, ...typeInput(`อื่น ${code}`) }, actor)).toEqual({ ok: false, code: 'DUPLICATE_CODE' });
    expect(await service.createType({ code: unique(), ...typeInput('ลาป่วย') }, actor)).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
  });

  it('updates a type, audits the changed fields and skips an unchanged save', async () => {
    const code = unique();
    const created = await service.createType({ code, ...typeInput(`เดิม ${code}`) }, actor);
    if (!created.ok) throw new Error('create failed');
    expect(await service.updateType(created.id!, typeInput(`ใหม่ ${code}`), actor)).toEqual({ ok: true });
    expect(await service.updateType(created.id!, typeInput(`ใหม่ ${code}`), actor)).toEqual({ ok: true });
    const events = await audits(created.id!);
    // Both events can share one created_at second, so their order is not asserted.
    expect(events.map((event) => event.action).sort()).toEqual(['leave.type.create', 'leave.type.update']);
    expect(JSON.parse(events.find((event) => event.action === 'leave.type.update')!.metadata)).toEqual({ leaveTypeCode: code, changedFields: ['name'] });
    expect(await service.updateType(randomUUID(), typeInput('ไม่มี'), actor)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('stores which gender a type is for, and clears it', async () => {
    const code = unique();
    const created = await service.createType({ code, ...typeInput(`เฉพาะเพศ ${code}`), eligibleGender: 'FEMALE' }, actor);
    if (!created.ok) throw new Error('create failed');
    expect((await service.listTypes()).find((type) => type.id === created.id)?.eligibleGender).toBe('FEMALE');
    expect(await service.updateType(created.id!, { ...typeInput(`เฉพาะเพศ ${code}`), eligibleGender: null }, actor)).toEqual({ ok: true });
    expect((await service.listTypes()).find((type) => type.id === created.id)?.eligibleGender).toBeNull();
    expect(JSON.parse((await audits(created.id!)).find((event) => event.action === 'leave.type.update')!.metadata)).toEqual({ leaveTypeCode: code, changedFields: ['eligibleGender'] });
  });

  it('upserts an entitlement and deletes it', async () => {
    const input = { employmentTypeId: governmentEmployee, leaveTypeId: sick, daysPerYear: 30, firstYearDays: null, maxAccumulatedDays: null, maxAccumulatedDaysAfter10Years: null, minServiceMonths: 0 };
    await service.setEntitlement(input, actor);
    await service.setEntitlement({ ...input, daysPerYear: 40 }, actor);
    const found = (await service.listEntitlements()).filter((row) => row.employmentTypeId === governmentEmployee && row.leaveTypeId === sick);
    expect(found).toEqual([{ ...input, daysPerYear: 40 }]);
    await service.deleteEntitlement(governmentEmployee, sick, actor);
    expect((await service.listEntitlements()).some((row) => row.employmentTypeId === governmentEmployee && row.leaveTypeId === sick)).toBe(false);
  });

  it('adds, lists, renames and deletes a holiday without its name in the audit', async () => {
    expect(await service.addHoliday({ date: '2026-12-05', name: 'วันพ่อแห่งชาติ' }, actor)).toEqual({ ok: true });
    expect(await service.addHoliday({ date: '2026-12-05', name: 'ซ้ำ' }, actor)).toEqual({ ok: false, code: 'DUPLICATE_DATE' });
    expect(await service.renameHoliday('2026-12-05', 'วันชาติ', actor)).toEqual({ ok: true });
    expect(await service.listHolidays(2026)).toContainEqual({ date: '2026-12-05', name: 'วันชาติ' });
    const events = await audits('2026-12-05');
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const event of events) expect(event.metadata).not.toMatch(/วันพ่อ|วันชาติ/);
    expect(await service.deleteHoliday('2026-12-05', actor)).toEqual({ ok: true });
    expect(await service.deleteHoliday('2026-12-05', actor)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.listHolidays(2026)).not.toContainEqual(expect.objectContaining({ date: '2026-12-05' }));
  });

  it('changes the minimum working days per month', async () => {
    await service.setMinWorkingDays({ minWorkingDaysPerMonth: 16 }, actor);
    expect(await service.getMinWorkingDays()).toBe(16);
  });
});
