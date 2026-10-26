import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { LeaveService } from './leave-service';
import { loadBalance } from './leave-store';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, insertPerson, LEAVE_TYPE_IDS } from './leave-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('LeaveService lifecycle against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const deputy = randomUUID();
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  // The deputy stands in for the director on leave.
  const delegations = { findActiveFor: async (delegator: string, delegate: string, moduleCode: string) => (delegator === org.director && delegate === deputy ? { delegatorPersonId: delegator, delegatePersonId: delegate, moduleCode } : null) };
  const service = new LeaveService(database, commandChainResolver(database), delegations);
  const decide = (requestId: string, actorPersonId: string, decision: 'APPROVE' | 'RETURN') => new ApprovalService(new DatabaseWorkflowRepository(database), delegations).decideRequest({ requestId, actorPersonId, decision, ...(decision === 'RETURN' ? { reason: 'แก้ไขวันที่' } : {}) });
  const vacation = (startDate: string, endDate: string, extra: object = {}) => ({ leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate, endDate, reason: 'พักผ่อน', ...extra });
  const vacationType = { id: LEAVE_TYPE_IDS.VACATION, code: 'VACATION' };
  async function filed(person: string, startDate: string, endDate: string): Promise<string> {
    const result = await service.submit(person, vacation(startDate, endDate));
    if (!result.ok) throw new Error(result.code);
    return result.requestId;
  }
  async function approved(person: string, startDate: string, endDate: string, lastApprover = org.director): Promise<string> {
    const requestId = await filed(person, startDate, endDate);
    for (const approver of [org.sectionHead, org.divisionHead, lastApprover]) await decide(requestId, approver, 'APPROVE');
    return requestId;
  }
  const status = async (requestId: string) => (await database.query<{ status: string }>('SELECT status FROM request WHERE id = ?', [requestId]))[0]?.status;

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
    await insertPerson(database, deputy);
  });
  afterAll(async () => { await database.close(); });

  it('resubmits a returned ใบลา with new dates and appends a fresh chain', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await filed(person, '2026-11-02', '2026-11-03');
    await decide(requestId, org.sectionHead, 'RETURN');
    expect(await service.resubmit(person, requestId, vacation('2026-11-09', '2026-11-11'))).toMatchObject({ ok: true });
    const [leave] = await database.query<{ startDate: string; endDate: string; days: string }>("SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, CAST(days AS CHAR) AS days FROM leave_request WHERE request_id = ?", [requestId]);
    expect(leave).toEqual({ startDate: '2026-11-09', endDate: '2026-11-11', days: '3.0' });
    expect(await status(requestId)).toBe('IN_REVIEW');
    expect(Number((await database.query<{ count: number }>('SELECT COUNT(*) AS count FROM approval_step WHERE request_id = ?', [requestId]))[0]?.count)).toBe(6);
  });

  it('refuses a resubmit that overlaps another ใบลา and changes nothing', async () => {
    const person = await createLeavePerson(database, org.section);
    await filed(person, '2026-11-16', '2026-11-17');
    const requestId = await filed(person, '2026-11-02', '2026-11-03');
    await decide(requestId, org.sectionHead, 'RETURN');
    expect(await service.resubmit(person, requestId, vacation('2026-11-17', '2026-11-18'))).toEqual({ ok: false, code: 'OVERLAPS_EXISTING_LEAVE' });
    expect(await status(requestId)).toBe('RETURNED');
    expect((await database.query<{ startDate: string }>("SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate FROM leave_request WHERE request_id = ?", [requestId]))[0]?.startDate).toBe('2026-11-02');
  });

  it('refuses to resubmit a ใบลา that is not returned or not the person’s own', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await filed(person, '2026-11-02', '2026-11-03');
    expect(await service.resubmit(person, requestId, vacation('2026-11-09', '2026-11-10'))).toEqual({ ok: false, code: 'NOT_RETURNED' });
    expect(await service.resubmit(org.sectionHead, requestId, vacation('2026-11-09', '2026-11-10'))).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('cancels a pending ใบลา and frees its days', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await filed(person, '2026-11-02', '2026-11-03');
    expect((await loadBalance(database, person, vacationType, 2570))?.pending).toBe(2);
    expect(await service.cancelPending(person, requestId, 'เปลี่ยนแผน')).toEqual({ ok: true });
    expect((await loadBalance(database, person, vacationType, 2570))?.pending).toBe(0);
    expect(await service.cancelPending(person, requestId, 'เปลี่ยนแผน')).toEqual({ ok: false, code: 'NOT_PENDING' });
  });

  it('sends ขอยกเลิกวันลา to the last approver and restores the days once approved', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await approved(person, '2026-11-02', '2026-11-06');
    expect((await loadBalance(database, person, vacationType, 2570))?.used).toBe(5);
    const cancellation = await service.requestCancelDays(person, requestId, { startDate: '2026-11-05', endDate: '2026-11-06', reason: 'กลับมาทำงานก่อน' });
    if (!cancellation.ok) throw new Error(cancellation.code);
    const steps = await database.query<{ assignee: string }>('SELECT assignee_snapshot AS assignee FROM approval_step WHERE request_id = ?', [cancellation.requestId]);
    expect(steps.map((step) => JSON.parse(step.assignee).personId)).toEqual([org.director]);
    expect(await service.requestCancelDays(person, requestId, { startDate: '2026-11-06', endDate: '2026-11-06', reason: 'ซ้ำ' })).toEqual({ ok: false, code: 'OVERLAPS_CANCELLATION' });
    expect(await service.requestCancelDays(person, requestId, { startDate: '2026-11-09', endDate: '2026-11-09', reason: 'นอกช่วง' })).toEqual({ ok: false, code: 'OUTSIDE_LEAVE' });
    await decide(cancellation.requestId, org.director, 'APPROVE');
    expect((await loadBalance(database, person, vacationType, 2570))?.used).toBe(3);
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE target_id = ? AND action = 'leave.cancel_days.submitted'", [cancellation.requestId]);
    expect(JSON.parse(audits[0]!.metadata)).toMatchObject({ leaveTypeCode: 'VACATION', days: 2 });
    expect(audits[0]!.metadata).not.toMatch(/กลับมาทำงานก่อน/);
  });

  it('refuses ขอยกเลิกวันลา on a pending ใบลา', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await filed(person, '2026-11-02', '2026-11-06');
    expect(await service.requestCancelDays(person, requestId, { startDate: '2026-11-05', endDate: '2026-11-06', reason: 'ยกเลิก' })).toEqual({ ok: false, code: 'NOT_APPROVED' });
  });

  it('sends ขอยกเลิกวันลา to the delegator when a ผู้แทน approved the last step', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await approved(person, '2026-11-02', '2026-11-03', deputy);
    const cancellation = await service.requestCancelDays(person, requestId, { startDate: '2026-11-03', endDate: '2026-11-03', reason: 'กลับมาทำงานก่อน' });
    if (!cancellation.ok) throw new Error(cancellation.code);
    const steps = await database.query<{ assignee: string }>('SELECT assignee_snapshot AS assignee FROM approval_step WHERE request_id = ?', [cancellation.requestId]);
    expect(steps.map((step) => JSON.parse(step.assignee).personId)).toEqual([org.director]);
  });

  it('approves many ใบลา and reports each failure on its own', async () => {
    await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, NULL, ?, NULL, UTC_TIMESTAMP())', [randomUUID(), org.sectionHead, org.section, '2020-01-01 00:00:00']);
    await database.execute("INSERT INTO hr_person_profile (person_id, employment_type_id, appointed_on, updated_at) VALUES (?, '00000000-0000-4000-8000-000000000001', '2020-01-01', UTC_TIMESTAMP())", [org.sectionHead]);
    const person = await createLeavePerson(database, org.section);
    const pending = await filed(person, '2026-11-02', '2026-11-02');
    const own = await filed(org.sectionHead, '2026-11-02', '2026-11-02');
    const elsewhere = await filed(person, '2026-11-03', '2026-11-03');
    await decide(elsewhere, org.sectionHead, 'APPROVE');
    const done = await approved(person, '2026-11-04', '2026-11-04');
    const results = await service.approveMany(org.sectionHead, [pending, own, elsewhere, done, randomUUID()]);
    expect(results).toEqual([
      { requestId: pending, ok: true },
      { requestId: own, ok: false, error: 'CONFLICT_OF_INTEREST' },
      { requestId: elsewhere, ok: false, error: 'APPROVER_REQUIRED' },
      { requestId: done, ok: false, error: 'REQUEST_NOT_PENDING' },
      { requestId: expect.any(String), ok: false, error: 'NOT_FOUND' }
    ]);
    expect(await status(pending)).toBe('IN_REVIEW');
    expect(Number((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM approval_step WHERE request_id = ? AND status = 'APPROVED'", [pending]))[0]?.count)).toBe(1);
  });
});
