import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations, type Database } from '@backoffice/db';
import { LeaveService } from './leave-service';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, EMPLOYMENT_TYPE_IDS, LEAVE_TYPE_IDS } from './leave-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LeaveService submit against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const noDelegations = { findActiveFor: async () => null };
  const service = new LeaveService(database, commandChainResolver(database), noDelegations);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const vacation = (startDate: string, endDate: string, extra: object = {}) => ({ leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate, endDate, reason: 'พักผ่อนกับครอบครัว', ...extra });
  const count = async (sql: string, parameters: unknown[]) => Number((await database.query<{ count: number }>(sql, parameters as never))[0]?.count);

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
  });
  afterAll(async () => { await database.close(); });

  it('previews days and the balance left after this ใบลา without writing anything', async () => {
    const person = await createLeavePerson(database, org.section);
    const result = await service.preview(person, vacation('2026-11-02', '2026-11-06'));
    expect(result).toMatchObject({ days: 5, error: null, warnings: [], medicalCertificateRequired: false });
    expect(result.balance).toEqual({ entitled: 10, carried: 0, used: 0, pending: 5, remaining: 5 });
    expect(await count('SELECT COUNT(*) AS count FROM request WHERE requestor_person_id = ?', [person])).toBe(0);
  });

  it('submits a ใบลา with its approval chain, notification and audit in one transaction', async () => {
    const person = await createLeavePerson(database, org.section);
    const result = await service.submit(person, vacation('2026-11-02', '2026-11-06', { contactDuringLeave: '0812345678' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [request] = await database.query<{ moduleCode: string; status: string }>('SELECT module_code AS moduleCode, status FROM request WHERE id = ?', [result.requestId]);
    expect(request).toEqual({ moduleCode: 'leave', status: 'IN_REVIEW' });
    const steps = await database.query<{ assignee: string }>('SELECT assignee_snapshot AS assignee FROM approval_step WHERE request_id = ? ORDER BY CAST(sequence AS UNSIGNED)', [result.requestId]);
    expect(steps.map((step) => JSON.parse(step.assignee).personId)).toEqual([org.sectionHead, org.divisionHead, org.director]);
    const [leave] = await database.query<{ days: string; fiscalYear: number }>('SELECT CAST(days AS CHAR) AS days, fiscal_year AS fiscalYear FROM leave_request WHERE request_id = ?', [result.requestId]);
    expect(leave).toEqual({ days: '5.0', fiscalYear: 2570 });
    const outbox = await database.query<{ payload: string }>("SELECT payload FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ?", [`%${result.requestId}%`]);
    expect(JSON.parse(outbox[0]!.payload)).toMatchObject({ moduleCode: 'leave', targetPath: `/leave/requests/${result.requestId}`, recipientPersonId: org.sectionHead });
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE target_id = ? AND action = 'leave.request.submitted'", [result.requestId]);
    expect(JSON.parse(audits[0]!.metadata)).toEqual({ leaveTypeCode: 'VACATION', days: 5, fiscalYear: 2570, startDate: '2026-11-02', endDate: '2026-11-06' });
    expect(audits[0]!.metadata).not.toMatch(/พักผ่อนกับครอบครัว|0812345678/);
  });

  it('writes nothing when the outbox insert fails', async () => {
    const person = await createLeavePerson(database, org.section);
    const failingOutbox: Database = {
      ...database,
      transaction: (work, options) => database.transaction((transaction) => {
        const wrapped: Database = { ...transaction, execute: async (sql, parameters) => { if (sql.startsWith('INSERT INTO outbox_event')) throw new Error('outbox unavailable'); return transaction.execute(sql, parameters); }, transaction: (nested) => nested(wrapped) };
        return work(wrapped);
      }, options)
    };
    await expect(new LeaveService(failingOutbox, commandChainResolver(database), noDelegations).submit(person, vacation('2026-11-02', '2026-11-06'))).rejects.toThrow('outbox unavailable');
    expect(await count('SELECT COUNT(*) AS count FROM request WHERE requestor_person_id = ?', [person])).toBe(0);
    expect(await count('SELECT COUNT(*) AS count FROM leave_request WHERE person_id = ?', [person])).toBe(0);
    expect(await count('SELECT COUNT(*) AS count FROM audit_event WHERE actor_person_id = ?', [person])).toBe(0);
  });

  it('stops the approval chain at the leave type target', async () => {
    const person = await createLeavePerson(database, org.section);
    await database.execute("UPDATE leave_type SET approval_target = 'DIVISION' WHERE id = ?", [LEAVE_TYPE_IDS.VACATION]);
    try {
      const result = await service.submit(person, vacation('2026-11-02', '2026-11-03'));
      if (!result.ok) throw new Error(result.code);
      expect(await count('SELECT COUNT(*) AS count FROM approval_step WHERE request_id = ?', [result.requestId])).toBe(2);
    } finally {
      await database.execute("UPDATE leave_type SET approval_target = 'HOSPITAL' WHERE id = ?", [LEAVE_TYPE_IDS.VACATION]);
    }
  });

  it.each([
    ['NO_ENTITLEMENT', { employmentTypeId: EMPLOYMENT_TYPE_IDS.GOVERNMENT_EMPLOYEE }, vacation('2026-11-02', '2026-11-03')],
    ['SERVICE_TOO_SHORT', { appointedOn: '2026-08-01' }, vacation('2026-11-02', '2026-11-03')],
    ['APPOINTMENT_DATE_MISSING', { appointedOn: null }, vacation('2026-11-02', '2026-11-03')],
    ['CROSSES_FISCAL_YEAR', {}, vacation('2026-09-30', '2026-10-01')],
    ['NO_LEAVE_DAYS', {}, vacation('2026-11-07', '2026-11-08')],
    ['INSUFFICIENT_BALANCE', {}, vacation('2026-11-02', '2026-11-16')]
  ])('refuses with %s', async (code, profile, input) => {
    const person = await createLeavePerson(database, org.section, profile);
    expect(await service.submit(person, input)).toEqual({ ok: false, code });
    expect((await service.preview(person, input)).error).toBe(code);
  });

  it('refuses an inactive leave type', async () => {
    const person = await createLeavePerson(database, org.section);
    const typeId = randomUUID();
    const code = `OFF_${typeId.slice(0, 8).toUpperCase()}`;
    await database.execute("INSERT INTO leave_type (id, code, name, counting, approval_target, attachment_required_from_days, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'WORKING_DAYS', 'HOSPITAL', NULL, 0, 99, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [typeId, code, `ปิดใช้ ${code}`]);
    expect(await service.submit(person, { ...vacation('2026-11-02', '2026-11-03'), leaveTypeId: typeId })).toEqual({ ok: false, code: 'INACTIVE_LEAVE_TYPE' });
  });

  it('refuses an overlapping ใบลา but lets a morning and an afternoon share a date', async () => {
    const person = await createLeavePerson(database, org.section);
    expect((await service.submit(person, vacation('2026-11-16', '2026-11-16', { endHalf: 'MORNING' }))).ok).toBe(true);
    expect((await service.submit(person, vacation('2026-11-16', '2026-11-16', { startHalf: 'AFTERNOON' }))).ok).toBe(true);
    expect(await service.submit(person, vacation('2026-11-16', '2026-11-16', { endHalf: 'MORNING' }))).toEqual({ ok: false, code: 'OVERLAPS_EXISTING_LEAVE' });
    expect(await service.submit(person, vacation('2026-11-13', '2026-11-17'))).toEqual({ ok: false, code: 'OVERLAPS_EXISTING_LEAVE' });
  });

  it('lets only one of two concurrent submits spend the last days', async () => {
    const person = await createLeavePerson(database, org.section);
    await database.execute('INSERT INTO leave_opening_balance (person_id, fiscal_year, leave_type_id, carried_days, used_days, updated_at) VALUES (?, 2570, ?, 0, 7, UTC_TIMESTAMP())', [person, LEAVE_TYPE_IDS.VACATION]);
    const results = await Promise.all([service.submit(person, vacation('2026-11-02', '2026-11-03')), service.submit(person, vacation('2026-11-04', '2026-11-05'))]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'INSUFFICIENT_BALANCE' }]);
  });

  it('warns when a month falls below the minimum working days but still submits', async () => {
    const person = await createLeavePerson(database, org.section);
    const result = await service.submit(person, vacation('2026-11-02', '2026-11-10'));
    expect(result).toMatchObject({ ok: true, warnings: [{ month: '2026-11', workingDays: 14, minimum: 15 }] });
  });

  it('flags a medical certificate for 30 days of sick leave', async () => {
    const person = await createLeavePerson(database, org.section);
    const result = await service.submit(person, { leaveTypeId: LEAVE_TYPE_IDS.SICK, startDate: '2026-11-02', endDate: '2026-12-11', reason: 'ผ่าตัด' });
    expect(result).toMatchObject({ ok: true, medicalCertificateRequired: true });
  });
});
