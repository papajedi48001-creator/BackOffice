import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { EmploymentTypeService } from './employment-type-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('EmploymentTypeService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new EmploymentTypeService(database);
  const actor = randomUUID();
  const unique = () => `T${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const audits = (id: string) => database.query<{ action: string; metadata: string }>('SELECT action, metadata FROM audit_event WHERE target_id = ? ORDER BY created_at', [id]);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => { await database.close(); });

  it('lists the six seeded types in order', async () => {
    const codes = (await service.list()).map((type) => type.code);
    expect(codes.slice(0, 6)).toEqual(['CIVIL_SERVANT', 'GOVERNMENT_EMPLOYEE', 'MOPH_EMPLOYEE', 'PERMANENT_EMPLOYEE', 'TEMPORARY_EMPLOYEE', 'DAILY_EMPLOYEE']);
    expect((await service.list()).find((type) => type.code === 'DAILY_EMPLOYEE')).toMatchObject({ name: 'ลูกจ้างรายวัน', isActive: true, sortOrder: 6 });
  });

  it('creates a type with an audit event and rejects a duplicate code or name', async () => {
    const code = unique();
    const created = await service.create({ code, name: `ประเภท ${code}`, isActive: true, sortOrder: 50 }, actor);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await audits(created.id)).map((event) => event.action)).toEqual(['hr.employment_type.create']);
    expect(await service.create({ code, name: `อื่น ${code}`, isActive: true, sortOrder: 51 }, actor)).toEqual({ ok: false, code: 'DUPLICATE_CODE' });
    expect(await service.create({ code: unique(), name: 'ข้าราชการ', isActive: true, sortOrder: 52 }, actor)).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
  });

  it('renames in place, audits the changed fields, and skips an unchanged save', async () => {
    const code = unique();
    const created = await service.create({ code, name: `เดิม ${code}`, isActive: true, sortOrder: 60 }, actor);
    if (!created.ok) throw new Error('create failed');
    expect(await service.update(created.id, { code, name: `ใหม่ ${code}`, isActive: true, sortOrder: 60 }, actor)).toEqual({ ok: true });
    expect(await service.update(created.id, { code, name: `ใหม่ ${code}`, isActive: true, sortOrder: 60 }, actor)).toEqual({ ok: true });
    const events = await audits(created.id);
    // Audit timestamps share a second here, so compare as a set.
    expect(events.map((event) => event.action).sort()).toEqual(['hr.employment_type.create', 'hr.employment_type.update']);
    expect(JSON.parse(events.find((event) => event.action === 'hr.employment_type.update')!.metadata)).toEqual({ changedFields: ['name'] });
    expect((await service.list()).find((type) => type.id === created.id)?.name).toBe(`ใหม่ ${code}`);
  });

  it('hides a deactivated type from the active list and reports an unknown id', async () => {
    const code = unique();
    const created = await service.create({ code, name: `ปิด ${code}`, isActive: true, sortOrder: 70 }, actor);
    if (!created.ok) throw new Error('create failed');
    await service.update(created.id, { code, name: `ปิด ${code}`, isActive: false, sortOrder: 70 }, actor);
    expect((await service.list({ activeOnly: true })).some((type) => type.id === created.id)).toBe(false);
    expect((await service.list()).find((type) => type.id === created.id)?.isActive).toBe(false);
    expect(await service.update(randomUUID(), { code: unique(), name: 'ไม่มี', isActive: true, sortOrder: 1 }, actor)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
