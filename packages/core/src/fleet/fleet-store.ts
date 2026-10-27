import { randomUUID } from 'node:crypto';
import { notificationEventPayloadSchema, type DispatchStatus, type RequestStatus, type TripStatus, type VehicleStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { bangkokToday } from '../official-travel/travel-store';
import { FLEET_MODULE } from './fleet-module';
import { noticesFor, type FleetEvent, type FleetNoticeContext } from './fleet-notices';

type Writer = Pick<Database, 'query' | 'execute'>;

export type FleetHistoryAction = 'SUBMITTED' | 'FILED_FROM_TRAVEL' | 'RESUBMITTED' | 'CANCELLED' | 'ASSIGNED' | 'UNASSIGNED' | 'DECLINED';

/** The Thai fiscal year, in พ.ศ., of a Bangkok date: it starts on 1 October. */
export function fleetFiscalYear(now: Date): number {
  const [year, month] = bangkokToday(now).split('-').map(Number) as [number, number];
  return year + (month >= 10 ? 1 : 0) + 543;
}

export const formatFleetReference = (fiscalYear: number, sequence: number) => `VR-${fiscalYear}-${String(sequence).padStart(4, '0')}`;

/** The next VR-<พ.ศ.>-<nnnn>; the fiscal year's row stays locked to the end of the caller's transaction, so concurrent filings never share a number. */
export async function nextFleetReference(db: Writer, now: Date): Promise<string> {
  const fiscalYear = fleetFiscalYear(now);
  await db.execute('INSERT INTO fleet_request_sequence (fiscal_year, last_value) VALUES (?, 0) ON DUPLICATE KEY UPDATE fiscal_year = fiscal_year', [fiscalYear]);
  const [row] = await db.query<{ lastValue: number }>('SELECT last_value AS lastValue FROM fleet_request_sequence WHERE fiscal_year = ? FOR UPDATE', [fiscalYear]);
  const next = Number(row!.lastValue) + 1;
  await db.execute('UPDATE fleet_request_sequence SET last_value = ? WHERE fiscal_year = ?', [next, fiscalYear]);
  return formatFleetReference(fiscalYear, next);
}

export interface LockedFleetRequest {
  id: string; reference: string; requesterPersonId: string; requestId: string | null; officialTravelId: string | null;
  dispatchStatus: DispatchStatus; tripId: string | null; headStatus: RequestStatus | null;
}

/** The ใบ and its head คำขอ, locked. Lock order everywhere: the ใบ, then its เที่ยวรถ. */
export async function lockFleetRequest(db: Writer, id: string): Promise<LockedFleetRequest | null> {
  const [row] = await db.query<LockedFleetRequest>(
    'SELECT f.id, f.reference, f.requester_person_id AS requesterPersonId, f.request_id AS requestId, f.official_travel_id AS officialTravelId, f.dispatch_status AS dispatchStatus, f.trip_id AS tripId, r.status AS headStatus FROM fleet_request f LEFT JOIN request r ON r.id = f.request_id WHERE f.id = ? FOR UPDATE',
    [id]
  );
  return row ?? null;
}

export interface LockedFleetTrip { id: string; status: TripStatus; driverPersonId: string; vehicleId: string; startsAt: Date; endsAt: Date; odometerOut: number | null }

export async function lockFleetTrip(db: Writer, id: string): Promise<LockedFleetTrip | null> {
  const [row] = await db.query<LockedFleetTrip>('SELECT id, status, driver_person_id AS driverPersonId, vehicle_id AS vehicleId, starts_at AS startsAt, ends_at AS endsAt, odometer_out AS odometerOut FROM fleet_trip WHERE id = ? FOR UPDATE', [id]);
  return row ?? null;
}

/** A UTC instant as a MariaDB DATETIME literal. */
export const toSqlDatetime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

/** The car's row, locked. Every write that puts a car on a time range takes it before the driver's row, so two dispatchers queue here. */
export async function lockFleetVehicle(db: Writer, id: string): Promise<{ id: string; registration: string; status: VehicleStatus } | null> {
  const [row] = await db.query<{ id: string; registration: string; status: VehicleStatus }>('SELECT id, registration, status FROM fleet_vehicle WHERE id = ? FOR UPDATE', [id]);
  return row ?? null;
}

/** The driver's row, locked after the car's; deactivating a driver locks it too, so a driver cannot be dropped while being put on a เที่ยวรถ. */
export async function lockFleetDriver(db: Writer, personId: string): Promise<{ personId: string; isActive: boolean } | null> {
  const [row] = await db.query<{ personId: string; isActive: number }>('SELECT person_id AS personId, is_active AS isActive FROM fleet_driver WHERE person_id = ? FOR UPDATE', [personId]);
  return row ? { personId: row.personId, isActive: Number(row.isActive) === 1 } : null;
}

/** Overlap with a non-cancelled เที่ยวรถ; back-to-back (one ends when the next starts) is free. Parameters: `endsAt`, `startsAt`. */
export const OVERLAPPING_TRIP = "status <> 'CANCELLED' AND starts_at < ? AND ends_at > ?";

async function overlaps(db: Pick<Database, 'query'>, column: 'vehicle_id' | 'driver_person_id', value: string, startsAt: Date, endsAt: Date, excludeTripId?: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM fleet_trip WHERE ${column} = ? AND ${OVERLAPPING_TRIP} AND id <> ? LIMIT 1`,
    [value, toSqlDatetime(endsAt), toSqlDatetime(startsAt), excludeTripId ?? '']
  );
  return rows.length > 0;
}

/** Whether the car is on another non-cancelled เที่ยวรถ that overlaps the range. Authoritative only with the car's row locked. */
export const busyVehicle = (db: Pick<Database, 'query'>, vehicleId: string, startsAt: Date, endsAt: Date, excludeTripId?: string) => overlaps(db, 'vehicle_id', vehicleId, startsAt, endsAt, excludeTripId);

/** Whether the driver is on another non-cancelled เที่ยวรถ that overlaps the range. Authoritative only with the driver's row locked. */
export const busyDriver = (db: Pick<Database, 'query'>, driverPersonId: string, startsAt: Date, endsAt: Date, excludeTripId?: string) => overlaps(db, 'driver_person_id', driverPersonId, startsAt, endsAt, excludeTripId);

/** Records a step of a ใบ; the reason lives here and nowhere else. Returns the entry id. */
export async function insertHistory(db: Writer, entry: { fleetRequestId: string; action: FleetHistoryAction; actorPersonId: string; reason?: string | null }): Promise<string> {
  const id = randomUUID();
  await db.execute('INSERT INTO fleet_request_history (id, fleet_request_id, action, actor_person_id, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [id, entry.fleetRequestId, entry.action, entry.actorPersonId, entry.reason ?? null]);
  return id;
}

/** One in-app notice through the outbox, keyed `notification.in_app:fleet:<event>:<id>:<recipient>`. */
export async function writeFleetNotice(db: Writer, notice: { event: FleetEvent; id: string; recipientPersonId: string; subject: string; targetPath: string }): Promise<void> {
  const payload = notificationEventPayloadSchema.parse({ recipientPersonId: notice.recipientPersonId, subject: notice.subject, targetPath: notice.targetPath, moduleCode: FLEET_MODULE });
  await db.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), NULL)', [randomUUID(), 'notification.in_app', `notification.in_app:fleet:${notice.event}:${notice.id}:${notice.recipientPersonId}`, JSON.stringify(payload)]);
}

/** Writes every notice of an event, keyed by `id` (the ใบ, the เที่ยวรถ or a history entry). */
export async function writeFleetNotices(db: Writer, event: FleetEvent, id: string, ctx: FleetNoticeContext): Promise<void> {
  for (const notice of noticesFor(event, ctx)) await writeFleetNotice(db, { event, id, ...notice });
}

export function auditFleet(db: Pick<Database, 'execute'>, entry: { action: string; targetType: 'fleet_request' | 'fleet_trip'; targetId: string; actorPersonId: string; metadata: Record<string, unknown> }): Promise<void> {
  return new AuditService(new DatabaseAuditRepository(db)).recordAudit({ actorPersonId: entry.actorPersonId, action: entry.action, targetType: entry.targetType, targetId: entry.targetId, result: 'SUCCESS', metadata: entry.metadata });
}

/** Cancels a PLANNED เที่ยวรถ that no longer carries an ASSIGNED ใบ, audits it and tells its driver ยกเลิกงานขับ. True when it cancelled. */
export async function cancelTripIfEmpty(db: Writer, tripId: string, actorPersonId: string): Promise<boolean> {
  const trip = await lockFleetTrip(db, tripId);
  if (!trip || trip.status !== 'PLANNED') return false;
  const [{ count }] = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM fleet_request WHERE trip_id = ? AND dispatch_status = 'ASSIGNED'", [tripId]) as [{ count: number }];
  if (Number(count) > 0) return false;
  await db.execute("UPDATE fleet_trip SET status = 'CANCELLED', updated_at = UTC_TIMESTAMP() WHERE id = ?", [tripId]);
  const [vehicle] = await db.query<{ registration: string }>('SELECT registration FROM fleet_vehicle WHERE id = ?', [trip.vehicleId]);
  await auditFleet(db, { action: 'fleet.trip.cancelled', targetType: 'fleet_trip', targetId: tripId, actorPersonId, metadata: { registration: vehicle?.registration, status: 'CANCELLED' } });
  await writeFleetNotices(db, 'trip-cancelled', tripId, { actorPersonId, tripId, driverPersonId: trip.driverPersonId });
  return true;
}
