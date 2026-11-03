import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { RoomActor } from '@backoffice/contracts';
import { DatabaseRoomBookingRepository, DatabaseRoomCatalogRepository } from './database-room-booking-repository';
import { RoomBookingQueries } from './room-booking-queries';
import { RoomBookingService } from './room-booking-service';
import { RoomCatalogService } from './room-catalog-service';
import { ApprovalService } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('room booking on MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const now = new Date('2026-11-01T03:00:00Z');
  const ownerUnit = randomUUID();
  const bookerUnit = randomUUID();
  const bookerId = randomUUID();
  const otherBookerId = randomUUID();
  const approverId = randomUUID();
  const headId = randomUUID();
  const manager: RoomActor = { personId: approverId, roles: [{ name: 'room-manager', organizationId: ownerUnit }] };
  const approver: RoomActor = { personId: approverId, roles: [{ name: 'room-booking-approver', organizationId: ownerUnit }] };
  const booker: RoomActor = { personId: bookerId, roles: [] };
  // The booker's head, as the command chain would find it.
  const heads = { resolve: async () => [{ personId: headId, organizationId: bookerUnit }] };
  const service = () => new RoomBookingService(new DatabaseRoomBookingRepository(database, heads), undefined, undefined, () => now);
  const headDecides = (requestId: string, decision: 'APPROVE' | 'REJECT' | 'RETURN', reason?: string) => new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null }).decideRequest({ requestId, actorPersonId: headId, decision, ...(reason ? { reason } : {}) });
  /** Submits and has the head เห็นชอบ, so the booking waits for the room manager. */
  const submitted = async (actor: RoomActor, bookingInput: ReturnType<typeof input>) => { const booking = await service().submit(actor, bookingInput); await headDecides(booking.requestId!, 'APPROVE'); return { ...booking, status: 'PENDING' as const }; };
  const createRoom = () => new RoomCatalogService(new DatabaseRoomCatalogRepository(database)).createRoom(manager, { name: `ห้อง ${randomUUID().slice(0, 8)}`, place: 'อาคารอำนวยการ', capacity: 30, ownerOrganizationId: ownerUnit, isBookable: true });
  const input = (roomId: string, dates = ['2026-11-05', '2026-11-06']) => ({ roomId, dates, startMinute: 540, endMinute: 720, title: 'ประชุมทดสอบ', attendeeCount: 10 });

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP()), (?, ?, UTC_TIMESTAMP())', [ownerUnit, 'งานธุรการ', bookerUnit, 'งานการพยาบาล']);
    for (const [id, name] of [[bookerId, 'ผู้จอง ทดสอบ'], [otherBookerId, 'ผู้จอง อีกคน'], [approverId, 'ธุรการ ทดสอบ'], [headId, 'หัวหน้า ทดสอบ']] as const) {
      await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), name]);
    }
    for (const personId of [bookerId, otherBookerId, approverId]) await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, effective_from, created_at) VALUES (UUID(), ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [personId, bookerUnit]);
    const roleName = 'room-booking-approver';
    await database.execute('INSERT IGNORE INTO role (id, name, created_at) VALUES (UUID(), ?, UTC_TIMESTAMP())', [roleName]);
    await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) SELECT UUID(), ?, id, ?, UTC_TIMESTAMP() FROM role WHERE name = ?', [approverId, ownerUnit, roleName]);
  });
  afterAll(async () => database.close());

  it('lets only one of two overlapping submissions hold the room', async () => {
    const room = await createRoom();
    const results = await Promise.allSettled([service().submit(booker, input(room.id)), service().submit({ personId: otherBookerId, roles: [] }, input(room.id, ['2026-11-06']))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { message: 'BOOKING_CONFLICT' } });
  });

  it('gives concurrent bookings distinct references', async () => {
    const rooms = await Promise.all(Array.from({ length: 5 }, () => createRoom()));
    const bookings = await Promise.all(rooms.map((room) => service().submit(booker, input(room.id))));
    expect(new Set(bookings.map((booking) => booking.reference)).size).toBe(5);
    expect(bookings.every((booking) => /^RB-2569-\d{4}$/.test(booking.reference))).toBe(true);
  });

  it('stores days in UTC, notifies the approver, and shows the booking on the calendar', async () => {
    const room = await createRoom();
    const booking = await submitted(booker, input(room.id));

    const calendar = await new RoomBookingQueries(database).calendar(new Date('2026-11-04T17:00:00Z'), new Date('2026-11-06T17:00:00Z'), room.id);

    expect(calendar).toEqual([
      expect.objectContaining({ bookingId: booking.id, date: '2026-11-05', startsAt: new Date('2026-11-05T02:00:00Z'), endsAt: new Date('2026-11-05T05:00:00Z'), status: 'PENDING', title: 'ประชุมทดสอบ', bookerName: 'ผู้จอง ทดสอบ', bookerOrganizationName: 'งานการพยาบาล' }),
      expect.objectContaining({ date: '2026-11-06' })
    ]);
    const outbox = await database.query<{ payload: string }>("SELECT payload FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ?", [`%${booking.id}%`]);
    expect(outbox.map((row) => JSON.parse(row.payload)).filter((payload) => payload.targetPath === `/rooms/bookings/${booking.id}`).map((payload) => payload.recipientPersonId)).toEqual(expect.arrayContaining([approverId, bookerId])); // hospital-wide approvers in a shared database are notified too
  });

  it('hides released days and rejected bookings from the calendar and frees them', async () => {
    const room = await createRoom();
    const rejected = await submitted(booker, input(room.id, ['2026-11-10']));
    await service().decide(approver, { bookingId: rejected.id, decision: 'REJECT', reason: 'ห้องไม่ว่าง' });
    const kept = await submitted(booker, input(room.id, ['2026-11-11', '2026-11-12']));
    await service().decide(approver, { bookingId: kept.id, decision: 'APPROVE' });
    await new RoomBookingService(new DatabaseRoomBookingRepository(database), undefined, undefined, () => new Date('2026-11-11T03:00:00Z')).cancel(booker, { bookingId: kept.id, reason: 'จบเร็ว' });

    const calendar = await new RoomBookingQueries(database).calendar(new Date('2026-11-09T17:00:00Z'), new Date('2026-11-12T17:00:00Z'), room.id);

    expect(calendar.map((entry) => [entry.reference, entry.date])).toEqual([[kept.reference, '2026-11-11']]);
    await expect(submitted({ personId: otherBookerId, roles: [] }, input(room.id, ['2026-11-10']))).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('shows the full booking, including reasons, only to its booker and approvers', async () => {
    const room = await createRoom();
    const booking = await submitted(booker, input(room.id, ['2026-11-20']));
    await service().decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'งดใช้ห้อง' });
    const queries = new RoomBookingQueries(database);

    const forBooker = await queries.detail(booking.id, booker);

    expect(forBooker).toMatchObject({ reference: booking.reference, status: 'REJECTED', viewerIsBooker: true, viewerCanDecide: false, days: [expect.objectContaining({ date: '2026-11-20', status: 'ACTIVE' })] });
    expect(forBooker?.history.map((entry) => [entry.action, entry.reason, entry.actorName])).toEqual([['SUBMITTED', null, 'ผู้จอง ทดสอบ'], ['HEAD_APPROVED', null, 'หัวหน้า ทดสอบ'], ['REJECTED', 'งดใช้ห้อง', 'ธุรการ ทดสอบ']]);
    await expect(queries.detail(booking.id, approver)).resolves.toMatchObject({ viewerCanDecide: true });
    await expect(queries.detail(booking.id, { personId: otherBookerId, roles: [] })).resolves.toBeNull();
    const audit = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ?', [booking.id]);
    expect(audit.map((row) => row.metadata).join()).not.toContain('งดใช้ห้อง');
  });

  it('tells each viewer whether they may open a calendar booking, without exposing who booked it', async () => {
    const room = await createRoom();
    const booking = await submitted(booker, input(room.id, ['2026-11-26', '2026-11-27']));
    const queries = new RoomBookingQueries(database);
    const view = (actor: RoomActor) => queries.calendarForViewer(new Date('2026-11-25T17:00:00Z'), new Date('2026-11-27T17:00:00Z'), actor, room.id);

    const forBooker = await view(booker);
    expect(forBooker.map((entry) => entry.date)).toEqual(['2026-11-26', '2026-11-27']);
    expect(forBooker[0]).toMatchObject({ bookingId: booking.id, roomPlace: 'อาคารอำนวยการ', bookerName: 'ผู้จอง ทดสอบ', canOpen: true });
    expect(forBooker[0]).not.toHaveProperty('bookerPersonId');
    expect((await view(approver)).every((entry) => entry.canOpen)).toBe(true);
    expect((await view({ personId: otherBookerId, roles: [] })).some((entry) => entry.canOpen)).toBe(false);
    expect((await view({ personId: otherBookerId, roles: [{ name: 'room-booking-approver', organizationId: bookerUnit }] })).some((entry) => entry.canOpen)).toBe(false);
  });

  it('lists pending bookings only for approvers in scope', async () => {
    const room = await createRoom();
    const booking = await submitted(booker, input(room.id, ['2026-11-25']));
    const queries = new RoomBookingQueries(database);
    expect((await queries.pendingForApprover(approver)).map((entry) => entry.id)).toContain(booking.id);
    expect(await queries.pendingForApprover({ personId: otherBookerId, roles: [{ name: 'room-booking-approver', organizationId: bookerUnit }] })).toEqual([]);
    expect((await queries.myBookings(bookerId)).map((entry) => entry.id)).toContain(booking.id);
  });

  it('counts the bookings a room still has to come', async () => {
    const room = await createRoom();
    await submitted(booker, input(room.id, ['2026-11-24', '2026-11-25']));
    const queries = new RoomBookingQueries(database);
    const count = async (at: string) => (await queries.listRooms({ bookableOnly: false }, new Date(at))).find((item) => item.id === room.id)?.upcomingBookingCount;
    expect(await count('2026-11-01T00:00:00Z')).toBe(1);
    expect(await count('2026-11-26T00:00:00Z')).toBe(0);
  });

  it('leaves out pending bookings that have already ended and the approver\'s own bookings', async () => {
    const room = await createRoom();
    const ended = await submitted(booker, input(room.id, ['2026-11-24']));
    const upcoming = await submitted(booker, input(room.id, ['2026-11-27']));
    const own = await submitted(approver, input(room.id, ['2026-11-28']));
    const pending = (await new RoomBookingQueries(database).pendingForApprover(approver, new Date('2026-11-26T00:00:00Z'))).map((entry) => entry.id);
    expect(pending).toContain(upcoming.id);
    expect(pending).not.toContain(ended.id);
    expect(pending).not.toContain(own.id);
  });

  describe('the head\'s เห็นชอบ in คำขอ', () => {
    const requestStatus = async (requestId: string) => (await database.query<{ status: string }>('SELECT status FROM request WHERE id = ?', [requestId]))[0]?.status;
    const bookingStatus = async (bookingId: string) => (await database.query<{ status: string }>('SELECT status FROM room_booking WHERE id = ?', [bookingId]))[0]?.status;

    it('opens a คำขอ for the head on submit and holds the slots meanwhile', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-01']));

      expect(booking).toMatchObject({ status: 'HEAD_REVIEW', requestId: expect.any(String) });
      expect(await requestStatus(booking.requestId!)).toBe('IN_REVIEW');
      const steps = await database.query<{ assignee: string }>("SELECT JSON_VALUE(assignee_snapshot, '$.personId') AS assignee FROM approval_step WHERE request_id = ? AND status = 'PENDING'", [booking.requestId]);
      expect(steps.map((step) => step.assignee)).toEqual([headId]);
      await expect(service().submit({ personId: otherBookerId, roles: [] }, input(room.id, ['2026-12-01']))).rejects.toThrow('BOOKING_CONFLICT');
      await expect(service().decide(manager, { bookingId: booking.id, decision: 'APPROVE' })).rejects.toThrow('BOOKING_NOT_PENDING');
    });

    it('hands the booking to the room managers when the head agrees, and lets a room manager approve it', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-02']));

      await headDecides(booking.requestId!, 'APPROVE');

      expect(await bookingStatus(booking.id)).toBe('PENDING');
      const notices = await database.query<{ payload: string }>("SELECT payload FROM outbox_event WHERE type = 'notification.in_app' AND payload LIKE ?", [`%/rooms/bookings/${booking.id}%`]);
      expect(notices.map((row) => JSON.parse(row.payload)).filter((payload) => payload.subject.startsWith('มีการจองห้องรออนุมัติ') && payload.actionRequired === true).map((payload) => payload.recipientPersonId)).toContain(approverId);
      await expect(service().decide(manager, { bookingId: booking.id, decision: 'APPROVE' })).resolves.toMatchObject({ status: 'APPROVED' });
    });

    it('rejects the booking and frees its slots when the head does not agree', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-03']));

      await headDecides(booking.requestId!, 'REJECT', 'ไม่ใช่งานของหน่วย');

      expect(await bookingStatus(booking.id)).toBe('REJECTED');
      const detail = await new RoomBookingQueries(database).detail(booking.id, booker);
      expect(detail?.history.at(-1)).toMatchObject({ action: 'HEAD_REJECTED', reason: 'ไม่ใช่งานของหน่วย', actorName: 'หัวหน้า ทดสอบ' });
      await expect(service().submit({ personId: otherBookerId, roles: [] }, input(room.id, ['2026-12-03']))).resolves.toMatchObject({ status: 'HEAD_REVIEW' });
    });

    it('opens the booking to the head on its คำขอ, who may decide only while it waits on them', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-07']));
      const queries = new RoomBookingQueries(database);
      const head: RoomActor = { personId: headId, roles: [] };

      await expect(queries.detail(booking.id, head)).resolves.toMatchObject({ status: 'HEAD_REVIEW', requestId: booking.requestId, viewerIsHead: true, viewerCanHeadDecide: true, viewerCanDecide: false });
      await expect(queries.detail(booking.id, booker)).resolves.toMatchObject({ viewerIsHead: false, viewerCanHeadDecide: false });
      expect(await queries.bookingIdForRequest(booking.requestId!)).toBe(booking.id);
      await headDecides(booking.requestId!, 'APPROVE');
      await expect(queries.detail(booking.id, head)).resolves.toMatchObject({ status: 'PENDING', viewerIsHead: true, viewerCanHeadDecide: false });
      expect((await queries.calendar(new Date('2026-12-06T17:00:00Z'), new Date('2026-12-07T17:00:00Z'), room.id)).map((entry) => entry.status)).toEqual(['PENDING']);
    });

    it('opens the booking to an active ผู้แทน of the head, who may decide it for them', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-08']));
      const deputyId = randomUUID();
      const lapsedId = randomUUID();
      for (const id of [deputyId, lapsedId]) await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), 'ผู้แทน ทดสอบ']);
      await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (UUID(), ?, ?, 'room-booking', 'ลาพักร้อน', UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP())", [headId, deputyId]);
      await database.execute("INSERT INTO delegation (id, delegator_person_id, delegate_person_id, module_code, reason, effective_from, effective_until, created_at) VALUES (UUID(), ?, ?, 'room-booking', 'เก่า', UTC_TIMESTAMP() - INTERVAL 3 DAY, UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP())", [headId, lapsedId]);
      const queries = new RoomBookingQueries(database);

      await expect(queries.detail(booking.id, { personId: deputyId, roles: [] })).resolves.toMatchObject({ viewerIsHead: true, viewerCanHeadDecide: true });
      await expect(queries.detail(booking.id, { personId: lapsedId, roles: [] })).resolves.toBeNull();
    });

    it('shows a booking waiting for its head on the calendar', async () => {
      const room = await createRoom();
      await service().submit(booker, input(room.id, ['2026-12-08']));
      expect((await new RoomBookingQueries(database).calendar(new Date('2026-12-07T17:00:00Z'), new Date('2026-12-08T17:00:00Z'), room.id)).map((entry) => entry.status)).toEqual(['HEAD_REVIEW']);
    });

    it('refuses ส่งกลับแก้ไข, because a booking is not edited after it is submitted', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-04']));

      await expect(headDecides(booking.requestId!, 'RETURN', 'แก้เวลา')).rejects.toThrow('RETURN_NOT_ALLOWED');

      expect(await requestStatus(booking.requestId!)).toBe('IN_REVIEW');
      expect(await bookingStatus(booking.id)).toBe('HEAD_REVIEW');
    });

    it('cancels the head\'s คำขอ with the booking', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-05']));

      await service().cancel(booker, { bookingId: booking.id, reason: 'เลื่อนประชุม' });

      expect(await bookingStatus(booking.id)).toBe('CANCELLED');
      expect(await requestStatus(booking.requestId!)).toBe('CANCELLED');
    });

    it('gives older bookings without a คำขอ straight to the room managers', async () => {
      const room = await createRoom();
      const booking = await service().submit(booker, input(room.id, ['2026-12-06']));
      await database.execute("UPDATE room_booking SET status = 'PENDING', request_id = NULL WHERE id = ?", [booking.id]);
      await expect(service().decide(manager, { bookingId: booking.id, decision: 'APPROVE' })).resolves.toMatchObject({ status: 'APPROVED' });
    });
  });
});
