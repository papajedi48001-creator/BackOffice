import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { commandChainResolver, createLeaveOrganization, createLeavePerson } from '../leave/leave-fixtures';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { TravelReportService } from './travel-report-service';
import { OfficialTravelQueries } from './travel-queries';
import { OfficialTravelService } from './travel-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const staff = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'staff', organizationId: null }], dataOwnerModules: [] });

describeWithDatabase('TravelReportService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new OfficialTravelService(database, commandChainResolver(database));
  const reports = new TravelReportService(database);
  const queries = new OfficialTravelQueries(database);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const report = { summary: 'ได้เรียนรู้แนวทางป้องกันการติดเชื้อใหม่', application: 'จัดอบรมต่อให้ทีมผู้ป่วยใน' };
  async function trip(startDate: string, endDate: string, members: string[] = [], approve = true): Promise<{ travelId: string; leader: string }> {
    const leader = await createLeavePerson(database, org.section);
    const result = await service.submit(leader, { subject: 'อบรมการป้องกันการติดเชื้อ', organiser: 'สถาบันบำราศนราดูร', place: 'สถาบันบำราศนราดูร', province: 'นนทบุรี', travelType: 'OUT_OF_PROVINCE', vehicle: 'PUBLIC_TRANSPORT', fundingSource: 'HOSPITAL_FUND', startDate, endDate, memberPersonIds: members });
    if (!result.ok) throw new Error(result.code);
    if (approve) {
      const requests = await database.query<{ requestId: string }>('SELECT request_id AS requestId FROM official_travel_member WHERE travel_id = ?', [result.travelId]);
      const approvals = new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null });
      for (const { requestId } of requests) for (const actorPersonId of [org.sectionHead, org.divisionHead, org.director]) await approvals.decideRequest({ requestId, actorPersonId, decision: 'APPROVE' });
    }
    return { travelId: result.travelId, leader };
  }

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
  });
  afterAll(async () => { await database.close(); });

  it('takes the report from the หัวหน้าคณะ once an approved trip has ended, and keeps one report per trip', async () => {
    const member = await createLeavePerson(database, org.section);
    const { travelId, leader } = await trip('2027-10-04', '2027-10-05', [member]);
    expect(await reports.save(leader, travelId, report, '2027-10-05')).toEqual({ ok: false, code: 'REPORT_NOT_DUE' });
    expect(await reports.save(member, travelId, report, '2027-10-06')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reports.save(leader, 'missing', report, '2027-10-06')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await reports.save(leader, travelId, report, '2027-10-06')).toEqual({ ok: true });
    expect(await reports.save(leader, travelId, { ...report, application: 'ปรับแนวทางของหอผู้ป่วย' }, '2027-10-07')).toEqual({ ok: true });
    const seen = await queries.detail(travelId, staff(member));
    expect(seen?.report).toMatchObject({ summary: report.summary, application: 'ปรับแนวทางของหอผู้ป่วย' });
    expect(seen?.canReport).toBe(false);
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'official_travel.report.saved' AND target_id = ?", [travelId]);
    expect(audits.map((audit) => JSON.parse(audit.metadata)).sort((left, right) => Number(right.firstSave) - Number(left.firstSave))).toEqual([{ travelId, firstSave: true }, { travelId, firstSave: false }]);
    expect(audits.map((audit) => audit.metadata).join()).not.toMatch(/เรียนรู้|หอผู้ป่วย/);
  });

  it('refuses a report for a trip that is not approved', async () => {
    const { travelId, leader } = await trip('2027-10-11', '2027-10-11', [], false);
    expect(await reports.save(leader, travelId, report, '2027-12-01')).toEqual({ ok: false, code: 'REPORT_NOT_DUE' });
  });

  it('tells the leader and HR which ended trips still have no report', async () => {
    const { travelId, leader } = await trip('2027-10-18', '2027-10-18');
    const pending = await trip('2027-10-19', '2027-10-19', [], false);
    const leaderView = await queries.detail(travelId, staff(leader), '2027-10-20');
    expect(leaderView?.canReport).toBe(true);
    expect((await queries.mine(leader, '2027-10-20'))[0]?.reportStatus).toBe('MISSING');
    expect((await queries.mine(leader, '2027-10-18'))[0]?.reportStatus).toBe('NOT_DUE');
    const missing = (await queries.all({ from: '2027-10-18', to: '2027-10-19', reportMissing: true }, '2027-10-20')).map((item) => item.travelId);
    expect(missing).toContain(travelId);
    expect(missing).not.toContain(pending.travelId);
    expect(await reports.save(leader, travelId, report, '2027-10-20')).toEqual({ ok: true });
    expect((await queries.mine(leader, '2027-10-20'))[0]?.reportStatus).toBe('SUBMITTED');
    expect((await queries.all({ from: '2027-10-18', to: '2027-10-19', reportMissing: true }, '2027-10-20')).map((item) => item.travelId)).not.toContain(travelId);
  });
});
