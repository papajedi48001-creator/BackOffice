import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { LeaveService } from '../leave/leave-service';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, LEAVE_TYPE_IDS } from '../leave/leave-fixtures';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { OfficialTravelService } from './travel-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('OfficialTravelService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const noDelegations = { findActiveFor: async () => null };
  const service = new OfficialTravelService(database, commandChainResolver(database));
  const leave = new LeaveService(database, commandChainResolver(database), noDelegations);
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  const trip = (startDate: string, endDate: string, memberPersonIds: string[] = [], extra: object = {}) => ({ subject: 'ประชุมวิชาการการพยาบาล', organiser: 'สสจ.มหาสารคาม', place: 'โรงแรมตักสิลา', province: 'มหาสารคาม', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', costAllowance: 240, startDate, endDate, memberPersonIds, ...extra });
  const count = async (sql: string, parameters: unknown[]) => Number((await database.query<{ count: number }>(sql, parameters as never))[0]?.count);
  const members = (travelId: string) => database.query<{ requestId: string; personId: string; status: string; requestor: string }>('SELECT m.request_id AS requestId, m.person_id AS personId, r.status, r.requestor_person_id AS requestor FROM official_travel_member m JOIN request r ON r.id = m.request_id WHERE m.travel_id = ? ORDER BY m.created_at, m.person_id', [travelId]);
  const decide = (requestId: string, actorPersonId: string, decision: 'APPROVE' | 'REJECT' | 'RETURN') => new ApprovalService(new DatabaseWorkflowRepository(database), noDelegations).decideRequest({ requestId, actorPersonId, decision, ...(decision === 'APPROVE' ? {} : { reason: 'แก้วันที่' }) });

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
  });
  afterAll(async () => { await database.close(); });

  it('files one trip with a คำขอ for each person, each up their own chain, audited without subject or costs', async () => {
    const leader = await createLeavePerson(database, org.section);
    const second = await createLeavePerson(database, org.section);
    const third = await createLeavePerson(database, org.division);
    const result = await service.submit(leader, trip('2027-02-01', '2027-02-02', [second, third]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await members(result.travelId);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.requestor === row.personId && row.status === 'IN_REVIEW')).toBe(true);
    const [request] = await database.query<{ moduleCode: string }>('SELECT module_code AS moduleCode FROM request WHERE id = ?', [rows.find((row) => row.personId === third)!.requestId]);
    expect(request?.moduleCode).toBe('official-travel');
    const steps = await database.query<{ assignee: string }>('SELECT assignee_snapshot AS assignee FROM approval_step WHERE request_id = ? ORDER BY CAST(sequence AS UNSIGNED)', [rows.find((row) => row.personId === third)!.requestId]);
    expect(steps.map((step) => JSON.parse(step.assignee).personId)).toEqual([org.divisionHead, org.director]);
    const [travel] = await database.query<{ days: string; leader: string }>('SELECT CAST(days AS CHAR) AS days, leader_person_id AS leader FROM official_travel WHERE id = ?', [result.travelId]);
    expect(travel).toEqual({ days: '2.0', leader });
    const audits = await database.query<{ actor: string; metadata: string }>("SELECT actor_person_id AS actor, metadata FROM audit_event WHERE action = 'official_travel.submitted' AND target_id = ?", [result.travelId]);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor).toBe(leader);
    expect(JSON.parse(audits[0]!.metadata)).toMatchObject({ travelType: 'IN_PROVINCE', memberCount: 3, days: 2 });
    expect(audits[0]!.metadata).not.toContain('ประชุม');
    expect(audits[0]!.metadata).not.toContain('240');
  });

  it('files nothing when one person already has leave on a trip day, and names that person', async () => {
    const leader = await createLeavePerson(database, org.section);
    const onLeave = await createLeavePerson(database, org.section);
    expect((await leave.submit(onLeave, { leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate: '2027-02-09', endDate: '2027-02-09', reason: 'ธุระ' })).ok).toBe(true);
    expect(await service.submit(leader, trip('2027-02-08', '2027-02-10', [onLeave]))).toEqual({ ok: false, code: 'OVERLAPS_LEAVE', personId: onLeave });
    expect(await count('SELECT COUNT(*) AS count FROM official_travel WHERE leader_person_id = ?', [leader])).toBe(0);
    expect(await count('SELECT COUNT(*) AS count FROM request WHERE requestor_person_id = ?', [leader])).toBe(0);
  });

  it('refuses a second trip over the same days, and a ใบลา over a trip', async () => {
    const leader = await createLeavePerson(database, org.section);
    expect((await service.submit(leader, trip('2027-03-01', '2027-03-02'))).ok).toBe(true);
    expect(await service.submit(leader, trip('2027-03-02', '2027-03-03'))).toEqual({ ok: false, code: 'OVERLAPS_TRAVEL', personId: leader });
    expect(await leave.submit(leader, { leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate: '2027-03-02', endDate: '2027-03-02', reason: 'ธุระ' })).toEqual({ ok: false, code: 'OVERLAPS_OFFICIAL_TRAVEL' });
    expect((await leave.submit(leader, { leaveTypeId: LEAVE_TYPE_IDS.VACATION, startDate: '2027-03-03', endDate: '2027-03-03', reason: 'ธุระ' })).ok).toBe(true);
  });

  it('names a person with no unit or no record', async () => {
    const leader = await createLeavePerson(database, org.section);
    const homeless = await createLeavePerson(database, null);
    expect(await service.submit(leader, trip('2027-04-01', '2027-04-01', [homeless]))).toEqual({ ok: false, code: 'NO_ORGANIZATION', personId: homeless });
    expect(await service.submit(leader, trip('2027-04-01', '2027-04-01', ['00000000-0000-4000-0000-00000000dead']))).toEqual({ ok: false, code: 'INVALID_MEMBERS', personId: '00000000-0000-4000-0000-00000000dead' });
  });

  it('resubmits only the returned คำขอ and keeps an approved person approved', async () => {
    const leader = await createLeavePerson(database, org.section);
    const other = await createLeavePerson(database, org.division);
    const result = await service.submit(leader, trip('2027-05-03', '2027-05-04', [other]));
    if (!result.ok) throw new Error(result.code);
    const [mine, theirs] = await members(result.travelId).then((rows) => [rows.find((row) => row.personId === leader)!, rows.find((row) => row.personId === other)!]);
    expect(await service.resubmit(leader, result.travelId, trip('2027-05-04', '2027-05-05'))).toEqual({ ok: false, code: 'NOT_RETURNED' });
    await decide(mine!.requestId, org.sectionHead, 'RETURN');
    await decide(theirs!.requestId, org.divisionHead, 'APPROVE');
    await decide(theirs!.requestId, org.director, 'APPROVE');
    expect(await service.resubmit(other, result.travelId, trip('2027-05-04', '2027-05-05'))).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.resubmit(leader, result.travelId, trip('2027-05-04', '2027-05-05'))).toEqual({ ok: true });
    const after = await members(result.travelId);
    expect(after.find((row) => row.personId === leader)?.status).toBe('IN_REVIEW');
    expect(after.find((row) => row.personId === other)?.status).toBe('APPROVED');
    const [travel] = await database.query<{ startDate: string }>("SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate FROM official_travel WHERE id = ?", [result.travelId]);
    expect(travel?.startDate).toBe('2027-05-04');
  });

  it('cancels every waiting คำขอ of a trip, and only for the หัวหน้าคณะ', async () => {
    const leader = await createLeavePerson(database, org.section);
    const other = await createLeavePerson(database, org.section);
    const result = await service.submit(leader, trip('2027-06-01', '2027-06-01', [other]));
    if (!result.ok) throw new Error(result.code);
    expect(await service.cancel(other, result.travelId, 'งานยกเลิก')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.cancel(leader, result.travelId, 'งานยกเลิก')).toEqual({ ok: true });
    expect((await members(result.travelId)).map((row) => row.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(await service.cancel(leader, result.travelId, 'งานยกเลิก')).toEqual({ ok: false, code: 'NOT_PENDING' });
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'official_travel.cancelled' AND target_id = ?", [result.travelId]);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).not.toContain('งานยกเลิก');
  });
});
