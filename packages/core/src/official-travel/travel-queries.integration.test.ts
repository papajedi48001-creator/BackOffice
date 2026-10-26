import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LeaveQueries } from '../leave/leave-queries';
import { commandChainResolver, createLeaveOrganization, createLeavePerson } from '../leave/leave-fixtures';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { OfficialTravelQueries } from './travel-queries';
import { OfficialTravelService } from './travel-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const staff = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] });
const hr = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });

describeWithDatabase('OfficialTravelQueries against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const noDelegations = { findActiveFor: async () => null };
  const service = new OfficialTravelService(database, commandChainResolver(database));
  const queries = new OfficialTravelQueries(database);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const trip = (startDate: string, endDate: string, memberPersonIds: string[] = []) => ({ subject: 'อบรมการป้องกันการติดเชื้อ', organiser: 'สถาบันบำราศนราดูร', place: 'สถาบันบำราศนราดูร', province: 'นนทบุรี', travelType: 'OUT_OF_PROVINCE', vehicle: 'PUBLIC_TRANSPORT', fundingSource: 'HOSPITAL_FUND', costLodging: 1500.5, costRegistration: 2000, startDate, endDate, memberPersonIds });
  async function filed(leader: string, startDate: string, endDate: string, members: string[] = []): Promise<string> {
    const result = await service.submit(leader, trip(startDate, endDate, members));
    if (!result.ok) throw new Error(result.code);
    return result.travelId;
  }

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
  });
  afterAll(async () => { await database.close(); });

  it('shows a trip in full to its people, its approvers and HR, and to nobody else', async () => {
    const leader = await createLeavePerson(database, org.section);
    const other = await createLeavePerson(database, org.section);
    const outsider = await createLeavePerson(database, org.section);
    const travelId = await filed(leader, '2027-07-05', '2027-07-06', [other]);
    const seen = await queries.detail(travelId, staff(other));
    expect(seen).toMatchObject({ subject: 'อบรมการป้องกันการติดเชื้อ', status: 'IN_REVIEW', days: 2, costs: { allowance: 0, lodging: 1500.5, transport: 0, registration: 2000, total: 3500.5 }, canEdit: false, canCancel: false });
    expect(seen?.members.map((member) => member.personId)).toEqual([leader, other]);
    expect(seen?.members.every((member) => member.canDecide === false)).toBe(true);
    expect((await queries.detail(travelId, staff(leader)))?.canCancel).toBe(true);
    const head = await queries.detail(travelId, staff(org.sectionHead));
    expect(head?.members.every((member) => member.canDecide)).toBe(true);
    expect(head?.members[0]?.steps.map((step) => step.status)).toEqual(['PENDING', 'PENDING', 'PENDING']);
    expect(await queries.detail(travelId, staff(org.director))).not.toBeNull();
    expect(await queries.detail(travelId, hr(outsider))).not.toBeNull();
    expect(await queries.detail(travelId, staff(outsider))).toBeNull();
    expect(await queries.detail('missing', staff(leader))).toBeNull();
  });

  it('lists my trips, the people waiting on me, and finds the trip of a คำขอ', async () => {
    const leader = await createLeavePerson(database, org.section);
    const other = await createLeavePerson(database, org.section);
    const travelId = await filed(leader, '2027-07-12', '2027-07-12', [other]);
    expect((await queries.mine(other)).map((item) => item.travelId)).toEqual([travelId]);
    const waiting = (await queries.pendingForApprover(org.sectionHead)).filter((item) => item.travelId === travelId);
    expect(waiting.map((item) => item.personId).sort()).toEqual([leader, other].sort());
    expect(await queries.pendingCount(org.sectionHead)).toBeGreaterThanOrEqual(2);
    expect(await queries.travelIdOfRequest(waiting[0]!.requestId)).toBe(travelId);
    expect(await queries.travelIdOfRequest('missing')).toBeNull();
    const firstStep = new ApprovalService(new DatabaseWorkflowRepository(database), noDelegations);
    await firstStep.decideRequest({ requestId: waiting[0]!.requestId, actorPersonId: org.sectionHead, decision: 'APPROVE' });
    expect((await queries.pendingForApprover(org.sectionHead)).some((item) => item.requestId === waiting[0]!.requestId)).toBe(false);
    expect((await queries.pendingForApprover(org.divisionHead)).some((item) => item.requestId === waiting[0]!.requestId)).toBe(true);
  });

  it('filters every trip for HR by date, type and status', async () => {
    const leader = await createLeavePerson(database, org.section);
    const travelId = await filed(leader, '2027-08-02', '2027-08-02');
    expect((await queries.all({ from: '2027-08-02', to: '2027-08-02', travelType: 'OUT_OF_PROVINCE', status: 'IN_REVIEW' })).map((item) => item.travelId)).toContain(travelId);
    expect((await queries.all({ from: '2027-08-02', to: '2027-08-02', travelType: 'ABROAD' })).map((item) => item.travelId)).not.toContain(travelId);
    expect((await queries.all({ from: '2027-08-02', to: '2027-08-02', status: 'APPROVED' })).map((item) => item.travelId)).not.toContain(travelId);
  });

  it('shows heads a trip on the team calendar with only its place', async () => {
    const leader = await createLeavePerson(database, org.section);
    await filed(leader, '2027-09-06', '2027-09-07');
    const row = (await new LeaveQueries(database).teamCalendar(org.divisionHead, '2027-09')).find((entry) => entry.personId === leader);
    expect(row?.days).toEqual([{ date: '2027-09-06', part: 'FULL', kind: 'TRAVEL', place: 'สถาบันบำราศนราดูร' }, { date: '2027-09-07', part: 'FULL', kind: 'TRAVEL', place: 'สถาบันบำราศนราดูร' }]);
    expect(JSON.stringify(row)).not.toMatch(/อบรม|1500|subject|cost/);
  });
});
