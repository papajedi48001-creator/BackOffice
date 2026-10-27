import { randomUUID } from 'node:crypto';
import { fleetAssignmentInputSchema, fleetTripUpdateSchema, odometerInputSchema, reasonInputSchema, type FleetAssignmentInput, type FleetErrorCode, type FleetTripUpdate } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { checkDeparture, checkReturn, checkTripRange, tripCovers } from './fleet-rules';
import { fleetRequestStatus } from './fleet-status';
import { auditFleet, busyDriver, busyVehicle, cancelTripIfEmpty, insertHistory, lockFleetDriver, lockFleetRequest, lockFleetTrip, lockFleetVehicle, toSqlDatetime, writeFleetNotices, type LockedFleetRequest, type LockedFleetTrip } from './fleet-store';

type Failure<Code extends FleetErrorCode = FleetErrorCode> = { ok: false; code: Code };
export type FleetAssignResult = { ok: true; tripId: string } | Failure;
export type FleetDispatchResult = { ok: true } | Failure;

const fail = <Code extends FleetErrorCode>(code: Code): Failure<Code> => ({ ok: false, code });

/** Thrown inside a transaction to undo what it already wrote; the caller gets the code back. */
class Rollback extends Error {
  constructor(readonly code: FleetErrorCode) { super(code); }
}

interface Rider extends LockedFleetRequest { departAt: Date; returnAt: Date }
interface Placed { ok: true; tripId: string; driverPersonId: string; registration: string; isNew: boolean }
interface Crew { vehicleId: string; driverPersonId: string; startsAt: Date; endsAt: Date }
const TRIP_FIELDS = ['vehicleId', 'driverPersonId', 'startsAt', 'endsAt'] as const;
const valueOf = (value: string | Date) => (value instanceof Date ? value.toISOString() : value);

/**
 * การจัดรถ and the trip log for `fleet-manager`s and drivers. Callers check `canManageFleet` before the manager methods.
 * Each call is one READ COMMITTED transaction. Lock order, as in FleetRequestService: the ใบ, its เที่ยวรถ (by id when two), the car, the driver.
 */
export class FleetDispatchService {
  constructor(private readonly database: Database, private readonly now: () => Date = () => new Date(), private readonly createId: () => string = randomUUID) {}

  /** Rule 5: a ใบ in รอจัดรถ joins a PLANNED เที่ยวรถ that covers it, or opens a new one. */
  async assign(actorPersonId: string, fleetRequestId: string, input: FleetAssignmentInput): Promise<FleetAssignResult> {
    const target = fleetAssignmentInputSchema.parse(input);
    return this.transaction(async (database) => {
      const rider = await this.lockRider(database, fleetRequestId);
      if (!rider) return fail('NOT_FOUND');
      if (rider.dispatchStatus !== 'WAITING' || fleetRequestStatus({ ...rider, tripStatus: null }) !== 'WAITING') return fail('NOT_PENDING');
      const placed = await this.place(database, actorPersonId, rider, target);
      if (!placed.ok) return placed;
      const historyId = await this.recordAssigned(database, actorPersonId, rider, placed);
      await writeFleetNotices(database, 'assigned', historyId, { actorPersonId, fleetRequestId, tripId: placed.tripId, requesterPersonIds: [rider.requesterPersonId], driverPersonId: placed.driverPersonId, registration: placed.registration });
      return { ok: true as const, tripId: placed.tripId };
    });
  }

  /** Rule 6: the ใบ goes back to รอจัดรถ; a เที่ยวรถ left empty is cancelled and its driver told. */
  async unassign(actorPersonId: string, fleetRequestId: string): Promise<FleetDispatchResult> {
    return this.transaction(async (database) => {
      const rider = await this.lockRider(database, fleetRequestId);
      if (!rider) return fail('NOT_FOUND');
      const trip = await this.plannedTripOf(database, rider);
      if (!trip) return fail('NOT_PENDING');
      const { historyId, tripCancelled } = await this.detach(database, actorPersonId, rider, trip.id);
      await writeFleetNotices(database, 'changed', historyId, { actorPersonId, tripId: trip.id, requesters: [{ personId: rider.requesterPersonId, fleetRequestId }], driverPersonId: tripCancelled ? null : trip.driverPersonId });
      return { ok: true as const };
    });
  }

  /** Rule 6: unassign and assign in one step; nothing changes if the ใบ cannot land on the new เที่ยวรถ. */
  async move(actorPersonId: string, fleetRequestId: string, input: FleetAssignmentInput): Promise<FleetAssignResult> {
    const target = fleetAssignmentInputSchema.parse(input);
    return this.transaction(async (database) => {
      const rider = await this.lockRider(database, fleetRequestId);
      if (!rider) return fail('NOT_FOUND');
      if (rider.dispatchStatus !== 'ASSIGNED' || !rider.tripId) return fail('NOT_PENDING');
      if ('tripId' in target && target.tripId === rider.tripId) return { ok: true as const, tripId: rider.tripId };
      // Both เที่ยวรถ rows by id, so two moves in opposite directions queue instead of deadlocking.
      for (const id of [rider.tripId, 'tripId' in target ? target.tripId : null].filter((id): id is string => Boolean(id)).sort()) await lockFleetTrip(database, id);
      const source = await this.plannedTripOf(database, rider);
      if (!source) return fail('NOT_PENDING');
      // Off the old เที่ยวรถ first, so a car or driver it frees can take the ใบ.
      const unassigned = await this.detach(database, actorPersonId, rider, source.id);
      const placed = await this.place(database, actorPersonId, rider, target);
      if (!placed.ok) throw new Rollback(placed.code);
      const historyId = await this.recordAssigned(database, actorPersonId, rider, placed);
      await writeFleetNotices(database, 'changed', historyId, { actorPersonId, tripId: placed.tripId, requesters: [{ personId: rider.requesterPersonId, fleetRequestId }] });
      const sameDriver = placed.driverPersonId === source.driverPersonId;
      // The new driver hears of it unless they simply keep driving both เที่ยวรถ they already had.
      if (!sameDriver || unassigned.tripCancelled || placed.isNew) await writeFleetNotices(database, 'assigned', historyId, { actorPersonId, fleetRequestId, tripId: placed.tripId, driverPersonId: placed.driverPersonId });
      if (!sameDriver && !unassigned.tripCancelled) await writeFleetNotices(database, 'changed', unassigned.historyId, { actorPersonId, tripId: source.id, driverPersonId: source.driverPersonId });
      return { ok: true as const, tripId: placed.tripId };
    });
  }

  /** Rule 7: ไม่จัดรถ, closed. The reason is kept in the history only. */
  async decline(actorPersonId: string, fleetRequestId: string, reason: string): Promise<FleetDispatchResult> {
    const valid = reasonInputSchema.parse({ reason });
    return this.transaction(async (database) => {
      const rider = await this.lockRider(database, fleetRequestId);
      if (!rider) return fail('NOT_FOUND');
      if (rider.dispatchStatus !== 'WAITING' || fleetRequestStatus({ ...rider, tripStatus: null }) !== 'WAITING') return fail('NOT_PENDING');
      await database.execute("UPDATE fleet_request SET dispatch_status = 'DECLINED', updated_at = UTC_TIMESTAMP() WHERE id = ?", [fleetRequestId]);
      const historyId = await insertHistory(database, { fleetRequestId, action: 'DECLINED', actorPersonId, reason: valid.reason });
      await auditFleet(database, { action: 'fleet.request.declined', targetType: 'fleet_request', targetId: fleetRequestId, actorPersonId, metadata: { reference: rider.reference, status: 'DECLINED' } });
      await writeFleetNotices(database, 'declined', historyId, { actorPersonId, fleetRequestId, requesterPersonIds: [rider.requesterPersonId] });
      return { ok: true as const };
    });
  }

  /** Rule 6: change a PLANNED เที่ยวรถ's car, driver or times; rule 5 runs again, ignoring the เที่ยวรถ itself, and every ใบ on it must still fit. */
  async updateTrip(actorPersonId: string, tripId: string, input: FleetTripUpdate): Promise<FleetDispatchResult> {
    const update = fleetTripUpdateSchema.parse(input);
    return this.transaction(async (database) => {
      // Only the เที่ยวรถ row is locked: a ใบ joining it locks the row too, so it either sees the new range or is seen here.
      const trip = await lockFleetTrip(database, tripId);
      if (!trip) return fail('NOT_FOUND');
      if (trip.status !== 'PLANNED') return fail('NOT_PENDING');
      const current: Crew = { vehicleId: trip.vehicleId, driverPersonId: trip.driverPersonId, startsAt: new Date(trip.startsAt), endsAt: new Date(trip.endsAt) };
      const next: Crew = { vehicleId: update.vehicleId ?? current.vehicleId, driverPersonId: update.driverPersonId ?? current.driverPersonId, startsAt: update.startsAt ? new Date(update.startsAt) : current.startsAt, endsAt: update.endsAt ? new Date(update.endsAt) : current.endsAt };
      const range = checkTripRange(next.startsAt, next.endsAt);
      if (range) return fail(range);
      const riders = await database.query<{ id: string; requesterPersonId: string; departAt: Date; returnAt: Date }>("SELECT id, requester_person_id AS requesterPersonId, depart_at AS departAt, return_at AS returnAt FROM fleet_request WHERE trip_id = ? AND dispatch_status = 'ASSIGNED' ORDER BY id", [tripId]);
      if (riders.some((rider) => !tripCovers(next, { departAt: new Date(rider.departAt), returnAt: new Date(rider.returnAt) }))) return fail('TRIP_DOES_NOT_COVER');
      const crew = await this.checkCrew(database, next, tripId);
      if (!crew.ok) return crew;
      await database.execute('UPDATE fleet_trip SET vehicle_id = ?, driver_person_id = ?, starts_at = ?, ends_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [next.vehicleId, next.driverPersonId, toSqlDatetime(next.startsAt), toSqlDatetime(next.endsAt), tripId]);
      const changedFields = TRIP_FIELDS.filter((field) => valueOf(current[field]) !== valueOf(next[field]));
      await auditFleet(database, { action: 'fleet.trip.updated', targetType: 'fleet_trip', targetId: tripId, actorPersonId, metadata: { registration: crew.registration, status: 'PLANNED', changedFields } });
      // A change can repeat, so each one gets its own key.
      await writeFleetNotices(database, 'changed', this.createId(), { actorPersonId, tripId, requesters: riders.map((rider) => ({ personId: rider.requesterPersonId, fleetRequestId: rider.id })), driverPersonId: next.driverPersonId, previousDriverPersonId: current.driverPersonId });
      return { ok: true as const };
    });
  }

  /** Rule 8, ออกเดินทาง: by the เที่ยวรถ's driver, or a manager when `asManager`; anyone else is told it does not exist. */
  async depart(actorPersonId: string, tripId: string, odometer: number, asManager: boolean): Promise<FleetDispatchResult> {
    const reading = odometerInputSchema.parse({ odometer }).odometer;
    return this.logTrip(actorPersonId, tripId, asManager, 'PLANNED', async (database, trip) => {
      const [last] = await database.query<{ odometerIn: number }>("SELECT odometer_in AS odometerIn FROM fleet_trip WHERE vehicle_id = ? AND status = 'RETURNED' AND odometer_in IS NOT NULL ORDER BY returned_at DESC LIMIT 1", [trip.vehicleId]);
      const now = this.now();
      const problem = checkDeparture({ startsAt: new Date(trip.startsAt) }, reading, last ? Number(last.odometerIn) : null, now);
      if (problem) return problem;
      await database.execute("UPDATE fleet_trip SET status = 'DEPARTED', odometer_out = ?, departed_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", [reading, toSqlDatetime(now), tripId]);
      return { action: 'fleet.trip.departed', status: 'DEPARTED', odometer: reading };
    });
  }

  /** Rule 8, กลับถึง: same people as `depart`; the reading may not be below the one at departure. */
  async returnTrip(actorPersonId: string, tripId: string, odometer: number, asManager: boolean): Promise<FleetDispatchResult> {
    const reading = odometerInputSchema.parse({ odometer }).odometer;
    return this.logTrip(actorPersonId, tripId, asManager, 'DEPARTED', async (database, trip) => {
      const problem = checkReturn(Number(trip.odometerOut ?? 0), reading);
      if (problem) return problem;
      await database.execute("UPDATE fleet_trip SET status = 'RETURNED', odometer_in = ?, returned_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", [reading, toSqlDatetime(this.now()), tripId]);
      return { action: 'fleet.trip.returned', status: 'RETURNED', odometer: reading };
    });
  }

  private async logTrip(actorPersonId: string, tripId: string, asManager: boolean, from: 'PLANNED' | 'DEPARTED', step: (database: Database, trip: LockedFleetTrip) => Promise<FleetErrorCode | { action: string; status: string; odometer: number }>): Promise<FleetDispatchResult> {
    return this.transaction(async (database) => {
      const trip = await lockFleetTrip(database, tripId);
      if (!trip || (!asManager && trip.driverPersonId !== actorPersonId)) return fail('NOT_FOUND');
      if (trip.status !== from) return fail('NOT_PENDING');
      // The car's row keeps two readings of the same car in order.
      const vehicle = await lockFleetVehicle(database, trip.vehicleId);
      const logged = await step(database, trip);
      if (typeof logged === 'string') return fail(logged);
      await auditFleet(database, { action: logged.action, targetType: 'fleet_trip', targetId: tripId, actorPersonId, metadata: { registration: vehicle?.registration, status: logged.status, odometer: logged.odometer } });
      return { ok: true as const };
    });
  }

  /** Puts a locked ใบ on the target เที่ยวรถ, creating it when the target is a car, a driver and a range. */
  private async place(database: Database, actorPersonId: string, rider: Rider, target: FleetAssignmentInput): Promise<Placed | Failure> {
    let placed: Placed;
    if ('tripId' in target) {
      const trip = await lockFleetTrip(database, target.tripId);
      if (!trip) return fail('NOT_FOUND');
      if (trip.status !== 'PLANNED' || !tripCovers({ startsAt: new Date(trip.startsAt), endsAt: new Date(trip.endsAt) }, rider)) return fail('TRIP_DOES_NOT_COVER');
      const [vehicle] = await database.query<{ registration: string }>('SELECT registration FROM fleet_vehicle WHERE id = ?', [trip.vehicleId]);
      placed = { ok: true, tripId: trip.id, driverPersonId: trip.driverPersonId, registration: vehicle!.registration, isNew: false };
    } else {
      const crew: Crew = { vehicleId: target.vehicleId, driverPersonId: target.driverPersonId, startsAt: new Date(target.startsAt), endsAt: new Date(target.endsAt) };
      const range = checkTripRange(crew.startsAt, crew.endsAt);
      if (range) return fail(range);
      if (!tripCovers(crew, rider)) return fail('TRIP_DOES_NOT_COVER');
      const checked = await this.checkCrew(database, crew);
      if (!checked.ok) return checked;
      const tripId = this.createId();
      await database.execute(
        "INSERT INTO fleet_trip (id, vehicle_id, driver_person_id, starts_at, ends_at, status, created_by_person_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'PLANNED', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
        [tripId, crew.vehicleId, crew.driverPersonId, toSqlDatetime(crew.startsAt), toSqlDatetime(crew.endsAt), actorPersonId]
      );
      placed = { ok: true, tripId, driverPersonId: crew.driverPersonId, registration: checked.registration, isNew: true };
    }
    await database.execute("UPDATE fleet_request SET dispatch_status = 'ASSIGNED', trip_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", [placed.tripId, rider.id]);
    return placed;
  }

  /** Rule 5 for a car, a driver and a range: the car's row then the driver's row are locked before the overlap is read. */
  private async checkCrew(database: Database, crew: Crew, excludeTripId?: string): Promise<{ ok: true; registration: string } | Failure> {
    const vehicle = await lockFleetVehicle(database, crew.vehicleId);
    if (!vehicle || vehicle.status !== 'ACTIVE') return fail('VEHICLE_UNAVAILABLE');
    const driver = await lockFleetDriver(database, crew.driverPersonId);
    if (!driver?.isActive) return fail('DRIVER_INACTIVE');
    if (await busyVehicle(database, crew.vehicleId, crew.startsAt, crew.endsAt, excludeTripId)) return fail('VEHICLE_BUSY');
    if (await busyDriver(database, crew.driverPersonId, crew.startsAt, crew.endsAt, excludeTripId)) return fail('DRIVER_BUSY');
    return { ok: true, registration: vehicle.registration };
  }

  private async recordAssigned(database: Database, actorPersonId: string, rider: Rider, placed: Placed): Promise<string> {
    const historyId = await insertHistory(database, { fleetRequestId: rider.id, action: 'ASSIGNED', actorPersonId });
    await auditFleet(database, { action: 'fleet.request.assigned', targetType: 'fleet_request', targetId: rider.id, actorPersonId, metadata: { reference: rider.reference, status: 'ASSIGNED', tripId: placed.tripId, registration: placed.registration } });
    return historyId;
  }

  /** Takes a ใบ off its เที่ยวรถ, back to รอจัดรถ, and cancels the เที่ยวรถ if that left it empty. */
  private async detach(database: Database, actorPersonId: string, rider: Rider, tripId: string): Promise<{ historyId: string; tripCancelled: boolean }> {
    await database.execute("UPDATE fleet_request SET dispatch_status = 'WAITING', trip_id = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?", [rider.id]);
    const historyId = await insertHistory(database, { fleetRequestId: rider.id, action: 'UNASSIGNED', actorPersonId });
    await auditFleet(database, { action: 'fleet.request.unassigned', targetType: 'fleet_request', targetId: rider.id, actorPersonId, metadata: { reference: rider.reference, status: 'WAITING', tripId } });
    return { historyId, tripCancelled: await cancelTripIfEmpty(database, tripId, actorPersonId) };
  }

  /** The ใบ's เที่ยวรถ, locked, when the ใบ is on it and it has not left yet. */
  private async plannedTripOf(database: Database, rider: Rider): Promise<LockedFleetTrip | null> {
    if (rider.dispatchStatus !== 'ASSIGNED' || !rider.tripId) return null;
    const trip = await lockFleetTrip(database, rider.tripId);
    return trip?.status === 'PLANNED' ? trip : null;
  }

  /** The ใบ, locked, with its times. */
  private async lockRider(database: Database, fleetRequestId: string): Promise<Rider | null> {
    const locked = await lockFleetRequest(database, fleetRequestId);
    if (!locked) return null;
    const [times] = await database.query<{ departAt: Date; returnAt: Date }>('SELECT depart_at AS departAt, return_at AS returnAt FROM fleet_request WHERE id = ?', [fleetRequestId]);
    return { ...locked, departAt: new Date(times!.departAt), returnAt: new Date(times!.returnAt) };
  }

  private async transaction<T>(work: (database: Database) => Promise<T>): Promise<T | Failure> {
    try {
      return await this.database.transaction(work, { isolationLevel: 'READ COMMITTED' });
    } catch (error) {
      if (error instanceof Rollback) return fail(error.code);
      throw error;
    }
  }
}
