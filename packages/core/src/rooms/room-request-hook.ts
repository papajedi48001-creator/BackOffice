import { randomUUID } from 'node:crypto';
import type { ApprovalAction, RequestStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { roleGrantsPermission } from '../access/policy';

type Executor = Pick<Database, 'query' | 'execute'>;

/**
 * The head's เห็นชอบ in คำขอ moves an การจองห้อง on, in the decision's own transaction:
 * เห็นชอบ hands it to the room managers (PENDING), ไม่เห็นชอบ ends it (REJECTED) and frees its slots.
 * A booking cannot be edited after submission, so ส่งกลับแก้ไข is refused.
 */
export async function followRoomBookingDecision(database: Executor, input: { requestId: string; status: RequestStatus; decision: ApprovalAction; reason: string | null; actorPersonId: string }): Promise<void> {
  if (input.decision === 'RETURN') throw new Error('RETURN_NOT_ALLOWED');
  const [booking] = await database.query<{ id: string; status: string }>('SELECT id, status FROM room_booking WHERE request_id = ? LIMIT 1 FOR UPDATE', [input.requestId]);
  if (!booking) return;
  if (booking.status !== 'HEAD_REVIEW') throw new Error('BOOKING_NOT_IN_HEAD_REVIEW');
  if (input.status === 'IN_REVIEW') return; // another head still has to agree
  const approved = input.status === 'APPROVED';
  if (approved) await database.execute("UPDATE room_booking SET status = 'PENDING', updated_at = UTC_TIMESTAMP() WHERE id = ?", [booking.id]);
  else await database.execute("UPDATE room_booking SET status = 'REJECTED', decided_by_person_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", [input.actorPersonId, booking.id]);
  await database.execute('INSERT INTO room_booking_history (id, booking_id, actor_person_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))', [randomUUID(), booking.id, input.actorPersonId, approved ? 'HEAD_APPROVED' : 'HEAD_REJECTED', approved ? null : input.reason]);
}

/** Once the head has agreed, the room managers for the room's unit are told the booking waits for them. */
export async function roomBookingWatchers(database: Pick<Database, 'query'>, requestId: string): Promise<Array<{ personId: string; subject: string; targetPath: string; actionRequired: boolean }>> {
  const [booking] = await database.query<{ id: string; reference: string; ownerOrganizationId: string; bookerPersonId: string }>(
    'SELECT b.id, b.reference, r.owner_organization_id AS ownerOrganizationId, b.booker_person_id AS bookerPersonId FROM room_booking b JOIN room r ON r.id = b.room_id WHERE b.request_id = ? LIMIT 1', [requestId]);
  if (!booking) return [];
  const rows = await database.query<{ personId: string; roleName: string }>(
    'SELECT DISTINCT a.person_id AS personId, r.name AS roleName FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE (a.organization_id IS NULL OR a.organization_id = ?)', [booking.ownerOrganizationId]);
  const managers = [...new Set(rows.filter((row) => roleGrantsPermission(row.roleName, 'room.booking.decide')).map((row) => row.personId))].filter((personId) => personId !== booking.bookerPersonId).sort();
  return managers.map((personId) => ({ personId, subject: `มีการจองห้องรออนุมัติ (${booking.reference})`, targetPath: `/rooms/bookings/${booking.id}`, actionRequired: true }));
}
