import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { commandChainResolver, createLeaveOrganization, createLeavePerson, insertPerson } from '../leave/leave-fixtures';
import { OfficialTravelService } from '../official-travel/travel-service';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { FleetRequestService } from './fleet-request-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('FleetRequestService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const noDelegations = { findActiveFor: async () => null };
  // 10:00 Bangkok on 27 October 2026: fiscal year 2570.
  const now = new Date('2026-10-27T03:00:00Z');
  const service = new FleetRequestService(database, commandChainResolver(database), () => now);
  const travel = new OfficialTravelService(database, commandChainResolver(database));
  let org: Awaited<ReturnType<typeof createLeaveOrganization>>;
  let manager: string;
  const run = randomUUID().slice(0, 6);
  const draft = (extra: object = {}) => ({ purpose: 'ส่งเอกสารลับ', destination: 'สสจ.มหาสารคาม', province: 'มหาสารคาม', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z', passengerCount: 2, passengerNames: 'นายเอ นายบี', ...extra });
  const row = async (id: string) => (await database.query<{ reference: string; requestId: string | null; organizationId: string; dispatchStatus: string; departAt: Date; tripId: string | null; headStatus: string | null }>(
    'SELECT f.reference, f.request_id AS requestId, f.organization_id AS organizationId, f.dispatch_status AS dispatchStatus, f.depart_at AS departAt, f.trip_id AS tripId, r.status AS headStatus FROM fleet_request f LEFT JOIN request r ON r.id = f.request_id WHERE f.id = ?', [id]))[0]!;
  const notices = async (subject: string, targetPath: string) => (await database.query<{ payload: string; key: string }>("SELECT payload, idempotency_key AS `key` FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ? AND payload LIKE ?", [`%${subject}%`, `%${targetPath}%`])).map((event) => ({ ...JSON.parse(event.payload), key: event.key }));
  const audits = (action: string, id: string) => database.query<{ metadata: string; actor: string }>('SELECT metadata, actor_person_id AS actor FROM audit_event WHERE action = ? AND target_id = ?', [action, id]);
  const decide = (requestId: string, actorPersonId: string, decision: 'APPROVE' | 'RETURN') => new ApprovalService(new DatabaseWorkflowRepository(database), noDelegations).decideRequest({ requestId, actorPersonId, decision, ...(decision === 'APPROVE' ? {} : { reason: 'แก้เวลา' }) });
  const filed = async (personId: string, extra: object = {}) => {
    const result = await service.submit(personId, draft(extra));
    if (!result.ok) throw new Error(result.code);
    return result.fleetRequestId;
  };
  /** An approved คำขอไปราชการ for the given people, with the given vehicle and dates. */
  const approvedTrip = async (leader: string, others: string[], vehicle: string, startDate = '2026-11-10', endDate = '2026-11-11') => {
    const result = await travel.submit(leader, { subject: 'ประชุมวิชาการ', organiser: 'สสจ.', place: 'โรงแรม', province: 'ขอนแก่น', travelType: 'IN_PROVINCE', vehicle, fundingSource: 'HOSPITAL_FUND', startDate, endDate, memberPersonIds: others });
    if (!result.ok) throw new Error(result.code);
    await database.execute("UPDATE request r JOIN official_travel_member m ON m.request_id = r.id SET r.status = 'APPROVED' WHERE m.travel_id = ?", [result.travelId]);
    return result.travelId;
  };
  /** A PLANNED เที่ยวรถ carrying the given ใบ, as การจัดรถ will leave it. */
  const plannedTrip = async (fleetRequestIds: string[], status = 'PLANNED') => {
    const vehicleId = randomUUID();
    const driver = randomUUID();
    const tripId = randomUUID();
    await insertPerson(database, driver);
    await database.execute("INSERT INTO fleet_vehicle (id, registration, make_model, kind, seats, status, created_at, updated_at) VALUES (?, ?, 'Toyota', 'VAN', 12, 'ACTIVE', UTC_TIMESTAMP(), UTC_TIMESTAMP())", [vehicleId, `T5${run}${vehicleId.slice(0, 4)}`]);
    await database.execute("INSERT INTO fleet_driver (person_id, phone, is_active, created_at, updated_at) VALUES (?, '0800000000', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [driver]);
    await database.execute("INSERT INTO fleet_trip (id, vehicle_id, driver_person_id, starts_at, ends_at, status, created_by_person_id, created_at, updated_at) VALUES (?, ?, ?, '2026-11-10 01:00:00', '2026-11-10 09:00:00', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [tripId, vehicleId, driver, status, manager]);
    for (const id of fleetRequestIds) await database.execute("UPDATE fleet_request SET dispatch_status = 'ASSIGNED', trip_id = ? WHERE id = ?", [tripId, id]);
    return { tripId, driver };
  };
  const approvedFiling = async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    await decide((await row(id)).requestId!, org.sectionHead, 'APPROVE');
    return { requester, id };
  };

  beforeAll(async () => {
    await runMigrations(database);
    org = await createLeaveOrganization(database);
    manager = randomUUID();
    await insertPerson(database, manager);
    if ((await database.query('SELECT id FROM role WHERE name = ?', ['fleet-manager'])).length === 0) await database.execute("INSERT INTO role (id, name, created_at) VALUES (UUID(), 'fleet-manager', UTC_TIMESTAMP())");
    await database.execute("INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) SELECT UUID(), ?, id, NULL, UTC_TIMESTAMP() FROM role WHERE name = 'fleet-manager' LIMIT 1", [manager]);
  });
  afterAll(async () => { await database.close(); });

  it('files a ใบ with a fleet คำขอ to the nearest head, numbered in the fiscal year, audited without the purpose', async () => {
    const requester = await createLeavePerson(database, org.section);
    const result = await service.submit(requester, draft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await row(result.fleetRequestId);
    expect(saved).toMatchObject({ organizationId: org.section, dispatchStatus: 'WAITING', headStatus: 'IN_REVIEW', tripId: null });
    expect(saved.reference).toMatch(/^VR-2570-\d{4,}$/);
    const [request] = await database.query<{ moduleCode: string; requestor: string }>('SELECT module_code AS moduleCode, requestor_person_id AS requestor FROM request WHERE id = ?', [saved.requestId]);
    expect(request).toEqual({ moduleCode: 'fleet', requestor: requester });
    const steps = await database.query<{ assignee: string }>('SELECT assignee_snapshot AS assignee FROM approval_step WHERE request_id = ?', [saved.requestId]);
    expect(steps.map((step) => JSON.parse(step.assignee).personId)).toEqual([org.sectionHead]);
    const [audit] = await audits('fleet.request.submitted', result.fleetRequestId);
    expect(audit!.actor).toBe(requester);
    expect(JSON.parse(audit!.metadata)).toEqual({ reference: saved.reference, status: 'HEAD_REVIEW' });
    const history = await database.query<{ action: string; reason: string | null }>('SELECT action, reason FROM fleet_request_history WHERE fleet_request_id = ?', [result.fleetRequestId]);
    expect(history).toEqual([{ action: 'SUBMITTED', reason: null }]);
  });

  it('numbers filings one after another, and never twice under concurrency', async () => {
    const people = await Promise.all([1, 2, 3].map(() => createLeavePerson(database, org.section)));
    const first = await row(await filed(people[0]!));
    const raced = await Promise.all([filed(people[1]!), filed(people[2]!)]);
    const numbers = [first, ...(await Promise.all(raced.map(row)))].map((saved) => Number(saved.reference.slice(8)));
    expect(new Set(numbers).size).toBe(3);
    expect(Math.min(numbers[1]!, numbers[2]!)).toBeGreaterThan(numbers[0]!);
  });

  it('writes nothing for a requester with no head, no unit, or broken time rules', async () => {
    const unit = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [unit, `หน่วยไม่มีหัวหน้า ${unit}`]);
    const headless = await createLeavePerson(database, unit);
    const homeless = await createLeavePerson(database, null);
    const requester = await createLeavePerson(database, org.section);
    expect(await service.submit(headless, draft())).toEqual({ ok: false, code: 'NO_APPROVER' });
    expect(await service.submit(homeless, draft())).toEqual({ ok: false, code: 'NO_ORGANIZATION' });
    expect(await service.submit(requester, draft({ departAt: '2026-10-27T01:00:00.000Z' }))).toEqual({ ok: false, code: 'IN_PAST' });
    const [{ count }] = await database.query<{ count: number }>('SELECT COUNT(*) AS count FROM fleet_request WHERE requester_person_id IN (?, ?, ?)', [headless, homeless, requester]) as [{ count: number }];
    expect(Number(count)).toBe(0);
    expect((await database.query('SELECT id FROM request WHERE requestor_person_id = ?', [headless]))).toHaveLength(0);
  });

  it('files from an approved ไปราชการ by รถราชการ without a head คำขอ, tells the fleet managers, and allows one active ใบ per trip', async () => {
    const leader = await createLeavePerson(database, org.section);
    const member = await createLeavePerson(database, org.section);
    const travelId = await approvedTrip(leader, [member], 'GOVERNMENT_CAR');
    const result = await service.submit(member, draft({ officialTravelId: travelId }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await row(result.fleetRequestId)).toMatchObject({ requestId: null, dispatchStatus: 'WAITING', organizationId: org.section });
    const sent = await notices('มีใบขอใช้รถรอจัดรถ', `/fleet/requests/${result.fleetRequestId}`);
    expect(sent.map((notice) => notice.recipientPersonId)).toContain(manager);
    expect(sent.map((notice) => notice.recipientPersonId)).not.toContain(member);
    expect(sent.find((notice) => notice.recipientPersonId === manager)).toMatchObject({ moduleCode: 'fleet', key: `notification.in_app:fleet:waiting:${result.fleetRequestId}:${manager}` });
    expect(JSON.stringify(sent)).not.toContain('ส่งเอกสาร');
    const [audit] = await audits('fleet.request.submitted', result.fleetRequestId);
    expect(JSON.parse(audit!.metadata)).toMatchObject({ status: 'WAITING', travelId });
    expect(await service.submit(leader, draft({ officialTravelId: travelId }))).toEqual({ ok: false, code: 'TRAVEL_ALREADY_HAS_CAR' });
    expect(await service.cancel(member, result.fleetRequestId, 'ไม่ไปแล้ว')).toEqual({ ok: true });
    expect((await service.submit(leader, draft({ officialTravelId: travelId }))).ok).toBe(true);
  });

  it('refuses a ใบ from ไปราชการ by private car, for a non-member, after the trip ended, or for an unknown trip', async () => {
    const leader = await createLeavePerson(database, org.section);
    const outsider = await createLeavePerson(database, org.section);
    const privateTrip = await approvedTrip(leader, [], 'PRIVATE_CAR', '2026-11-12', '2026-11-12');
    const ended = await approvedTrip(leader, [], 'GOVERNMENT_CAR', '2026-10-20', '2026-10-21');
    const open = await approvedTrip(leader, [], 'GOVERNMENT_CAR', '2026-11-20', '2026-11-20');
    for (const [personId, travelId] of [[leader, privateTrip], [outsider, open], [leader, ended], [leader, randomUUID()]] as const) {
      expect(await service.submit(personId, draft({ officialTravelId: travelId }))).toEqual({ ok: false, code: 'TRAVEL_NOT_ELIGIBLE' });
    }
  });

  it('stores the contact phone on submit and resubmit, empty when not given', async () => {
    const requester = await createLeavePerson(database, org.section);
    const contactPhone = async (id: string) => (await database.query<{ contactPhone: string }>('SELECT contact_phone AS contactPhone FROM fleet_request WHERE id = ?', [id]))[0]!.contactPhone;
    expect(await contactPhone(await filed(requester))).toBe('');
    const id = await filed(requester, { contactPhone: '081-111-2222' });
    expect(await contactPhone(id)).toBe('081-111-2222');
    await decide((await row(id)).requestId!, org.sectionHead, 'RETURN');
    expect(await service.resubmit(requester, id, draft({ contactPhone: '089-333-4444' }))).toEqual({ ok: true });
    expect(await contactPhone(id)).toBe('089-333-4444');
  });

  it('resubmits a returned ใบ with new times, and only then', async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    const later = draft({ departAt: '2026-11-11T01:00:00.000Z', returnAt: '2026-11-11T05:00:00.000Z' });
    expect(await service.resubmit(requester, id, later)).toEqual({ ok: false, code: 'NOT_RETURNED' });
    await decide((await row(id)).requestId!, org.sectionHead, 'RETURN');
    expect(await service.resubmit(org.sectionHead, id, later)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.resubmit(requester, id, draft({ departAt: '2026-11-11T01:10:00.000Z', returnAt: '2026-11-11T05:00:00.000Z' }))).toEqual({ ok: false, code: 'NOT_QUARTER_HOUR' });
    expect(await service.resubmit(requester, id, later)).toEqual({ ok: true });
    const saved = await row(id);
    expect(saved.headStatus).toBe('IN_REVIEW');
    expect(new Date(saved.departAt).toISOString()).toBe('2026-11-11T01:00:00.000Z');
    expect(JSON.parse((await audits('fleet.request.resubmitted', id))[0]!.metadata)).toEqual({ reference: saved.reference, status: 'HEAD_REVIEW' });
  });

  it('cancels a ใบ waiting for its head together with the คำขอ, keeping the reason in the history only', async () => {
    const requester = await createLeavePerson(database, org.section);
    const id = await filed(requester);
    expect(await service.cancel(org.sectionHead, id, 'ไม่ไปแล้ว')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.cancel(requester, id, 'ไม่ไปแล้ว')).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ dispatchStatus: 'CANCELLED', headStatus: 'CANCELLED' });
    const history = await database.query<{ action: string; reason: string | null }>('SELECT action, reason FROM fleet_request_history WHERE fleet_request_id = ? ORDER BY created_at, action DESC', [id]);
    expect(history).toEqual([{ action: 'SUBMITTED', reason: null }, { action: 'CANCELLED', reason: 'ไม่ไปแล้ว' }]);
    const [audit] = await audits('fleet.request.cancelled', id);
    expect(JSON.parse(audit!.metadata)).toEqual({ reference: (await row(id)).reference, status: 'CANCELLED' });
    expect((await database.query<{ count: number }>("SELECT COUNT(*) AS count FROM outbox_event WHERE payload LIKE '%ไม่ไปแล้ว%'"))[0]!.count).toBe(0);
    expect(await service.cancel(requester, id, 'ไม่ไปแล้ว')).toEqual({ ok: false, code: 'NOT_PENDING' });
  });

  it('cancels the only ใบ on a PLANNED เที่ยวรถ, cancels the เที่ยวรถ and tells its driver once', async () => {
    const { requester, id } = await approvedFiling();
    const { tripId, driver } = await plannedTrip([id]);
    expect(await service.cancel(requester, id, 'งานเลื่อน')).toEqual({ ok: true });
    expect((await database.query<{ status: string }>('SELECT status FROM fleet_trip WHERE id = ?', [tripId]))[0]!.status).toBe('CANCELLED');
    expect(await row(id)).toMatchObject({ dispatchStatus: 'CANCELLED', tripId, headStatus: 'APPROVED' });
    expect((await notices('ยกเลิกงานขับ', `/fleet/trips/${tripId}`)).map((notice) => notice.recipientPersonId)).toEqual([driver]);
    expect(await notices('ผู้ขอยกเลิกใบขอใช้รถ', `/fleet/trips/${tripId}`)).toEqual([]);
    expect((await notices('ผู้ขอยกเลิกใบขอใช้รถ', `/fleet/requests/${id}`)).map((notice) => notice.recipientPersonId)).toContain(manager);
    expect(JSON.parse((await audits('fleet.trip.cancelled', tripId))[0]!.metadata)).toMatchObject({ status: 'CANCELLED' });
  });

  it('leaves a shared เที่ยวรถ running and tells its driver the requester cancelled', async () => {
    const first = await approvedFiling();
    const second = await approvedFiling();
    const { tripId, driver } = await plannedTrip([first.id, second.id]);
    expect(await service.cancel(first.requester, first.id, 'งานเลื่อน')).toEqual({ ok: true });
    expect((await database.query<{ status: string }>('SELECT status FROM fleet_trip WHERE id = ?', [tripId]))[0]!.status).toBe('PLANNED');
    expect((await notices('ผู้ขอยกเลิกใบขอใช้รถ', `/fleet/trips/${tripId}`)).map((notice) => notice.recipientPersonId)).toEqual([driver]);
    expect(await notices('ยกเลิกงานขับ', `/fleet/trips/${tripId}`)).toEqual([]);
  });

  it('refuses to cancel once the car has left', async () => {
    const { requester, id } = await approvedFiling();
    await plannedTrip([id], 'DEPARTED');
    expect(await service.cancel(requester, id, 'งานเลื่อน')).toEqual({ ok: false, code: 'NOT_PENDING' });
    expect((await row(id)).dispatchStatus).toBe('ASSIGNED');
  });
});
