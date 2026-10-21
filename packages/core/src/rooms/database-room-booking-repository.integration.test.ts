import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { RoomActor } from '@backoffice/contracts';
import { DatabaseRoomBookingRepository, DatabaseRoomCatalogRepository } from './database-room-booking-repository';
import { RoomBookingQueries } from './room-booking-queries';
import { RoomBookingService } from './room-booking-service';
import { RoomCatalogService } from './room-catalog-service';

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
  const manager: RoomActor = { personId: approverId, roles: [{ name: 'room-manager', organizationId: ownerUnit }] };
  const approver: RoomActor = { personId: approverId, roles: [{ name: 'room-booking-approver', organizationId: ownerUnit }] };
  const booker: RoomActor = { personId: bookerId, roles: [] };
  const service = () => new RoomBookingService(new DatabaseRoomBookingRepository(database), undefined, undefined, () => now);
  const createRoom = () => new RoomCatalogService(new DatabaseRoomCatalogRepository(database)).createRoom(manager, { name: `ห้อง ${randomUUID().slice(0, 8)}`, place: 'อาคารอำนวยการ', capacity: 30, ownerOrganizationId: ownerUnit, isBookable: true });
  const input = (roomId: string, dates = ['2026-11-05', '2026-11-06']) => ({ roomId, dates, startMinute: 540, endMinute: 720, title: 'ประชุมทดสอบ', attendeeCount: 10 });

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP()), (?, ?, UTC_TIMESTAMP())', [ownerUnit, 'งานธุรการ', bookerUnit, 'งานการพยาบาล']);
    for (const [id, name] of [[bookerId, 'ผู้จอง ทดสอบ'], [otherBookerId, 'ผู้จอง อีกคน'], [approverId, 'ธุรการ ทดสอบ']] as const) {
      await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), name]);
    }
    await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, effective_from, created_at) VALUES (UUID(), ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [bookerId, bookerUnit]);
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
    const booking = await service().submit(booker, input(room.id));

    const calendar = await new RoomBookingQueries(database).calendar(new Date('2026-11-04T17:00:00Z'), new Date('2026-11-06T17:00:00Z'), room.id);

    expect(calendar).toEqual([
      expect.objectContaining({ bookingId: booking.id, date: '2026-11-05', startsAt: new Date('2026-11-05T02:00:00Z'), endsAt: new Date('2026-11-05T05:00:00Z'), status: 'PENDING', title: 'ประชุมทดสอบ', bookerName: 'ผู้จอง ทดสอบ', bookerOrganizationName: 'งานการพยาบาล' }),
      expect.objectContaining({ date: '2026-11-06' })
    ]);
    const outbox = await database.query<{ payload: string }>('SELECT payload FROM outbox_event WHERE idempotency_key LIKE ?', ['notification.in_app:room-booking:%']);
    expect(outbox.map((row) => JSON.parse(row.payload)).filter((payload) => payload.targetPath === `/rooms/bookings/${booking.id}`).map((payload) => payload.recipientPersonId).sort()).toEqual([approverId, bookerId].sort());
  });

  it('hides released days and rejected bookings from the calendar and frees them', async () => {
    const room = await createRoom();
    const rejected = await service().submit(booker, input(room.id, ['2026-11-10']));
    await service().decide(approver, { bookingId: rejected.id, decision: 'REJECT', reason: 'ห้องไม่ว่าง' });
    const kept = await service().submit(booker, input(room.id, ['2026-11-11', '2026-11-12']));
    await service().decide(approver, { bookingId: kept.id, decision: 'APPROVE' });
    await new RoomBookingService(new DatabaseRoomBookingRepository(database), undefined, undefined, () => new Date('2026-11-11T03:00:00Z')).cancel(booker, { bookingId: kept.id, reason: 'จบเร็ว' });

    const calendar = await new RoomBookingQueries(database).calendar(new Date('2026-11-09T17:00:00Z'), new Date('2026-11-12T17:00:00Z'), room.id);

    expect(calendar.map((entry) => [entry.reference, entry.date])).toEqual([[kept.reference, '2026-11-11']]);
    await expect(service().submit({ personId: otherBookerId, roles: [] }, input(room.id, ['2026-11-10']))).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('shows the full booking, including reasons, only to its booker and approvers', async () => {
    const room = await createRoom();
    const booking = await service().submit(booker, input(room.id, ['2026-11-20']));
    await service().decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'งดใช้ห้อง' });
    const queries = new RoomBookingQueries(database);

    const forBooker = await queries.detail(booking.id, booker);

    expect(forBooker).toMatchObject({ reference: booking.reference, status: 'REJECTED', viewerIsBooker: true, viewerCanDecide: false, days: [expect.objectContaining({ date: '2026-11-20', status: 'ACTIVE' })] });
    expect(forBooker?.history.map((entry) => [entry.action, entry.reason, entry.actorName])).toEqual([['SUBMITTED', null, 'ผู้จอง ทดสอบ'], ['REJECTED', 'งดใช้ห้อง', 'ธุรการ ทดสอบ']]);
    await expect(queries.detail(booking.id, approver)).resolves.toMatchObject({ viewerCanDecide: true });
    await expect(queries.detail(booking.id, { personId: otherBookerId, roles: [] })).resolves.toBeNull();
    const audit = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE target_id = ?', [booking.id]);
    expect(audit.map((row) => row.metadata).join()).not.toContain('งดใช้ห้อง');
  });

  it('lists pending bookings only for approvers in scope', async () => {
    const room = await createRoom();
    const booking = await service().submit(booker, input(room.id, ['2026-11-25']));
    const queries = new RoomBookingQueries(database);
    expect((await queries.pendingForApprover(approver)).map((entry) => entry.id)).toContain(booking.id);
    expect(await queries.pendingForApprover({ personId: otherBookerId, roles: [{ name: 'room-booking-approver', organizationId: bookerUnit }] })).toEqual([]);
    expect((await queries.myBookings(bookerId)).map((entry) => entry.id)).toContain(booking.id);
  });
});
