import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { LeaveQueries } from './leave-queries';
import { LeaveService } from './leave-service';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, insertPerson, LEAVE_TYPE_IDS } from './leave-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const staff = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] });

describeWithDatabase('LeaveQueries against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const noDelegations = { findActiveFor: async () => null };
  const service = new LeaveService(database, commandChainResolver(database), noDelegations);
  const queries = new LeaveQueries(database);
  const deputy = randomUUID();
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  let other: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const decide = (requestId: string, actorPersonId: string) => new ApprovalService(new DatabaseWorkflowRepository(database), noDelegations).decideRequest({ requestId, actorPersonId, decision: 'APPROVE' });
  async function filed(person: string, startDate: string, endDate: string, extra: object = {}): Promise<string> {
    const result = await service.submit(person, { leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate, endDate, reason: 'เหตุผลส่วนตัว', contactDuringLeave: '0899999999', ...extra });
    if (!result.ok) throw new Error(result.code);
    return result.requestId;
  }

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
    other = await createLeaveOrganization(database);
    await insertPerson(database, deputy);
  });
  afterAll(async () => { await database.close(); });

  it('shows the VACATION balance after a pending and an approved ใบลา', async () => {
    const person = await createLeavePerson(database, org.section);
    await filed(person, '2026-11-02', '2026-11-03');
    const approved = await filed(person, '2026-11-09', '2026-11-11');
    for (const approver of [org.sectionHead, org.divisionHead, org.director]) await decide(approved, approver);
    const balances = await queries.balances(person, 2570);
    expect(balances.map((row) => row.leaveType.code)).toEqual(['SICK', 'PERSONAL', 'VACATION', 'MATERNITY', 'PATERNITY']);
    expect(balances.find((row) => row.leaveType.code === 'VACATION')?.balance).toEqual({ entitled: 10, carried: 0, used: 3, pending: 2, remaining: 5 });
    const mine = await queries.myLeave(person, 2570);
    expect(mine.map((item) => [item.startDate, item.status, item.days, item.kind])).toEqual([['2026-11-09', 'APPROVED', 3, 'LEAVE'], ['2026-11-02', 'IN_REVIEW', 2, 'LEAVE']]);
  });

  it('shows a ใบลา only to the person, its approvers and HR', async () => {
    const person = await createLeavePerson(database, org.section);
    const requestId = await filed(person, '2026-11-02', '2026-11-02', { endHalf: 'MORNING' });
    const own = await queries.detail(requestId, staff(person));
    expect(own).toMatchObject({ requestId, reason: 'เหตุผลส่วนตัว', contactDuringLeave: '0899999999', days: 0.5, canCancel: true, canDecide: false, canRequestCancelDays: false });
    expect(own?.steps.map((step) => step.status)).toEqual(['PENDING', 'PENDING', 'PENDING']);
    for (const approver of [org.sectionHead, org.divisionHead, org.director]) expect(await queries.detail(requestId, staff(approver))).not.toBeNull();
    expect((await queries.detail(requestId, staff(org.sectionHead)))?.canDecide).toBe(true);
    expect((await queries.detail(requestId, staff(org.divisionHead)))?.canDecide).toBe(false);
    const hr: AccessSubject = { authenticated: true, personId: randomUUID(), roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
    expect(await queries.detail(requestId, hr)).not.toBeNull();
    expect(await queries.detail(requestId, staff(other.sectionHead))).toBeNull();
    expect(await queries.detail(randomUUID(), staff(person))).toBeNull();
  });

  it('lists the ใบลา waiting on the person, including delegated ones', async () => {
    const person = await createLeavePerson(database, org.section);
    const waiting = await filed(person, '2026-11-02', '2026-11-02');
    const later = await filed(person, '2026-11-03', '2026-11-03');
    await decide(later, org.sectionHead);
    const sectionList = (await queries.pendingForApprover(org.sectionHead)).map((item) => item.requestId);
    expect(sectionList).toContain(waiting);
    expect(sectionList).not.toContain(later);
    expect((await queries.pendingForApprover(org.divisionHead)).map((item) => item.requestId)).toContain(later);
    await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (?, ?, ?, 'leave', 'ลาพักร้อน', UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP())", [randomUUID(), org.divisionHead, deputy]);
    expect((await queries.pendingForApprover(deputy)).map((item) => item.requestId)).toContain(later);
    expect(await queries.pendingCount(deputy)).toBeGreaterThanOrEqual(1);
    expect((await queries.detail(later, staff(deputy)))?.canDecide).toBe(true);
  });

  it('shows heads a team calendar of their units without leave details', async () => {
    const person = await createLeavePerson(database, org.section);
    const outsider = await createLeavePerson(database, other.section);
    await filed(person, '2026-12-01', '2026-12-01', { endHalf: 'MORNING' });
    await filed(outsider, '2026-12-01', '2026-12-01');
    const calendar = await queries.teamCalendar(org.divisionHead, '2026-12');
    const row = calendar.find((entry) => entry.personId === person);
    expect(row?.days).toEqual([{ date: '2026-12-01', part: 'MORNING' }]);
    expect(calendar.some((entry) => entry.personId === outsider)).toBe(false);
    expect(JSON.stringify(calendar)).not.toMatch(/reason|leaveType|contact|เหตุผล/);
    expect(await queries.headedOrganizationIds(org.divisionHead)).toEqual(expect.arrayContaining([org.division, org.section]));
    expect(await queries.teamCalendar(person, '2026-12')).toEqual([]);
  });

  it('filters every ใบลา by unit and status', async () => {
    const person = await createLeavePerson(database, org.section);
    const outsider = await createLeavePerson(database, other.section);
    const mine = await filed(person, '2026-11-23', '2026-11-23');
    await filed(outsider, '2026-11-23', '2026-11-23');
    const inSection = await queries.allLeave({ organizationId: org.section, status: 'IN_REVIEW', from: '2026-11-23', to: '2026-11-23' });
    expect(inSection.map((item) => item.requestId)).toContain(mine);
    expect(inSection.every((item) => item.organizationName === `งาน ${org.section}`)).toBe(true);
    expect(await queries.allLeave({ organizationId: org.section, status: 'APPROVED', from: '2026-11-23', to: '2026-11-23' })).not.toContainEqual(expect.objectContaining({ requestId: mine }));
  });
});
