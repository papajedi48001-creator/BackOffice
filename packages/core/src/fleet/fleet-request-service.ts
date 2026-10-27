import { randomUUID } from 'node:crypto';
import { fleetRequestInputSchema, reasonInputSchema, type FleetErrorCode, type FleetRequestInput, type RequestStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { lockPerson } from '../leave/leave-service';
import { loadPersonContext } from '../leave/leave-store';
import { tripStatus } from '../official-travel/travel-status';
import { bangkokToday } from '../official-travel/travel-store';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { RequestService, type ApproverResolver } from '../workflow/request-service';
import { fleetManagerPersonIds } from './fleet-managers';
import { FLEET_MODULE } from './fleet-module';
import { checkFleetRange } from './fleet-rules';
import { canCancel, fleetRequestStatus } from './fleet-status';
import { auditFleet, cancelTripIfEmpty, insertHistory, lockFleetRequest, lockFleetTrip, nextFleetReference, writeFleetNotices } from './fleet-store';

/** A ใบขอใช้รถ as filed; `passengerNames` defaults to empty. */
export type FleetRequestDraft = Parameters<typeof fleetRequestInputSchema.parse>[0];
type Failure<Code extends FleetErrorCode = FleetErrorCode> = { ok: false; code: Code };
export type FleetSubmitResult = { ok: true; fleetRequestId: string } | Failure;

const fail = <Code extends FleetErrorCode>(code: Code): Failure<Code> => ({ ok: false, code });
const toDatetime = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
/** Statuses that hold the one car a ไปราชการ trip may have. */
const CLOSED = new Set(['DECLINED', 'CANCELLED', 'HEAD_REJECTED']);

/** Files, resubmits and cancels a ใบขอใช้รถ for its requester. Each call is one READ COMMITTED transaction. */
export class FleetRequestService {
  constructor(private readonly database: Database, private readonly approvers: ApproverResolver, private readonly now: () => Date = () => new Date(), private readonly createId: () => string = randomUUID) {}

  /** A normal ใบ carries a fleet คำขอ to the nearest head; one from ไปราชการ (rule 2) skips the head and waits for a car straight away. */
  async submit(requesterPersonId: string, draft: FleetRequestDraft): Promise<FleetSubmitResult> {
    const input = fleetRequestInputSchema.parse(draft);
    const now = this.now();
    const range = checkFleetRange(new Date(input.departAt), new Date(input.returnAt), now);
    if (range) return fail(range);
    return this.mapNoApprover(() => this.database.transaction(async (database) => {
      // The trip is locked before the person, as ไปราชการ does, so a second ใบ for the same trip waits for this one.
      if (input.officialTravelId) {
        const travel = await this.checkTravel(database, input.officialTravelId, requesterPersonId, now);
        if (travel) return travel;
      }
      await lockPerson(database, requesterPersonId);
      const organizationId = (await loadPersonContext(database, requesterPersonId))?.organizationId;
      if (!organizationId) return fail('NO_ORGANIZATION');
      const requestId = input.officialTravelId ? null : (await this.requests(database).submitRequest({ moduleCode: FLEET_MODULE, requestorPersonId: requesterPersonId, organizationSnapshot: { organizationId }, target: 'NEAREST_HEAD' })).id;
      const fleetRequestId = this.createId();
      const reference = await nextFleetReference(database, now);
      await database.execute(
        "INSERT INTO fleet_request (id, reference, requester_person_id, organization_id, request_id, official_travel_id, purpose, destination, province, depart_at, return_at, passenger_count, passenger_names, dispatch_status, trip_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
        [fleetRequestId, reference, requesterPersonId, organizationId, requestId, input.officialTravelId ?? null, input.purpose, input.destination, input.province, toDatetime(input.departAt), toDatetime(input.returnAt), input.passengerCount, input.passengerNames]
      );
      await insertHistory(database, { fleetRequestId, action: 'SUBMITTED', actorPersonId: requesterPersonId });
      await auditFleet(database, { action: 'fleet.request.submitted', targetType: 'fleet_request', targetId: fleetRequestId, actorPersonId: requesterPersonId, metadata: { reference, status: requestId ? 'HEAD_REVIEW' : 'WAITING', ...(input.officialTravelId ? { travelId: input.officialTravelId } : {}) } });
      if (!requestId) await writeFleetNotices(database, 'waiting', fleetRequestId, { actorPersonId: requesterPersonId, fleetRequestId, managerPersonIds: await fleetManagerPersonIds(database) });
      return { ok: true as const, fleetRequestId };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** After the head's ส่งกลับแก้ไข: the requester edits the ใบ and sends the คำขอ up again; the time rules run again. */
  async resubmit(requesterPersonId: string, fleetRequestId: string, draft: FleetRequestDraft): Promise<{ ok: true } | Failure> {
    const input = fleetRequestInputSchema.parse(draft);
    return this.mapNoApprover(() => this.database.transaction(async (database) => {
      await lockPerson(database, requesterPersonId);
      const locked = await lockFleetRequest(database, fleetRequestId);
      if (!locked || locked.requesterPersonId !== requesterPersonId) return fail('NOT_FOUND');
      if (!locked.requestId || locked.headStatus !== 'RETURNED') return fail('NOT_RETURNED');
      const range = checkFleetRange(new Date(input.departAt), new Date(input.returnAt), this.now());
      if (range) return fail(range);
      await this.update(database, fleetRequestId, input);
      await this.requests(database).resubmitRequest({ requestId: locked.requestId, actorPersonId: requesterPersonId, target: 'NEAREST_HEAD' });
      await insertHistory(database, { fleetRequestId, action: 'RESUBMITTED', actorPersonId: requesterPersonId });
      await auditFleet(database, { action: 'fleet.request.resubmitted', targetType: 'fleet_request', targetId: fleetRequestId, actorPersonId: requesterPersonId, metadata: { reference: locked.reference, status: 'HEAD_REVIEW' } });
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** The requester cancels, with a reason, until the car leaves. A pending head คำขอ is cancelled too; a เที่ยวรถ left empty is cancelled. */
  async cancel(requesterPersonId: string, fleetRequestId: string, reason: string): Promise<{ ok: true } | Failure<'NOT_FOUND' | 'NOT_PENDING'>> {
    const valid = reasonInputSchema.parse({ reason });
    return this.database.transaction(async (database) => {
      await lockPerson(database, requesterPersonId);
      const locked = await lockFleetRequest(database, fleetRequestId);
      if (!locked || locked.requesterPersonId !== requesterPersonId) return fail('NOT_FOUND');
      const trip = locked.tripId ? await lockFleetTrip(database, locked.tripId) : null;
      const status = fleetRequestStatus({ headStatus: locked.headStatus, dispatchStatus: locked.dispatchStatus, tripStatus: trip?.status ?? null });
      if (!canCancel(status)) return fail('NOT_PENDING');
      if (locked.requestId && (locked.headStatus === 'IN_REVIEW' || locked.headStatus === 'RETURNED')) {
        await this.requests(database).cancelRequest({ requestId: locked.requestId, actorPersonId: requesterPersonId, reason: valid.reason }, { actorAuthorized: true });
      }
      // trip_id stays for the record; a CANCELLED ใบ no longer counts as on the เที่ยวรถ.
      await database.execute("UPDATE fleet_request SET dispatch_status = 'CANCELLED', updated_at = UTC_TIMESTAMP() WHERE id = ?", [fleetRequestId]);
      await insertHistory(database, { fleetRequestId, action: 'CANCELLED', actorPersonId: requesterPersonId, reason: valid.reason });
      await auditFleet(database, { action: 'fleet.request.cancelled', targetType: 'fleet_request', targetId: fleetRequestId, actorPersonId: requesterPersonId, metadata: { reference: locked.reference, status: 'CANCELLED' } });
      if (status === 'ASSIGNED' && trip) {
        // An emptied เที่ยวรถ tells its driver ยกเลิกงานขับ itself, so the driver hears one thing, not both.
        const tripCancelled = await cancelTripIfEmpty(database, trip.id, requesterPersonId);
        await writeFleetNotices(database, 'requester-cancelled', fleetRequestId, { actorPersonId: requesterPersonId, fleetRequestId, tripId: trip.id, managerPersonIds: await fleetManagerPersonIds(database), driverPersonId: tripCancelled ? null : trip.driverPersonId });
      }
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** Rule 2, with the trip row locked: the requester goes on an approved trip by รถราชการ that has not ended, and the trip has no other live ใบ. */
  private async checkTravel(database: Database, travelId: string, requesterPersonId: string, now: Date): Promise<Failure | null> {
    const [travel] = await database.query<{ vehicle: string; endDate: string }>("SELECT vehicle, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate FROM official_travel WHERE id = ? FOR UPDATE", [travelId]);
    if (!travel || travel.vehicle !== 'GOVERNMENT_CAR' || travel.endDate < bangkokToday(now)) return fail('TRAVEL_NOT_ELIGIBLE');
    const members = await database.query<{ personId: string; status: RequestStatus }>('SELECT m.person_id AS personId, r.status FROM official_travel_member m JOIN request r ON r.id = m.request_id WHERE m.travel_id = ?', [travelId]);
    const own = members.find((member) => member.personId === requesterPersonId);
    if (!own || own.status !== 'APPROVED' || tripStatus(members.map((member) => member.status)) !== 'APPROVED') return fail('TRAVEL_NOT_ELIGIBLE');
    const existing = await database.query<{ headStatus: RequestStatus | null; dispatchStatus: 'WAITING' | 'ASSIGNED' | 'DECLINED' | 'CANCELLED'; tripStatus: 'PLANNED' | 'DEPARTED' | 'RETURNED' | 'CANCELLED' | null }>(
      'SELECT r.status AS headStatus, f.dispatch_status AS dispatchStatus, t.status AS tripStatus FROM fleet_request f LEFT JOIN request r ON r.id = f.request_id LEFT JOIN fleet_trip t ON t.id = f.trip_id WHERE f.official_travel_id = ?',
      [travelId]
    );
    return existing.some((row) => !CLOSED.has(fleetRequestStatus(row))) ? fail('TRAVEL_ALREADY_HAS_CAR') : null;
  }

  private async update(database: Database, fleetRequestId: string, input: FleetRequestInput): Promise<void> {
    await database.execute(
      'UPDATE fleet_request SET purpose = ?, destination = ?, province = ?, depart_at = ?, return_at = ?, passenger_count = ?, passenger_names = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [input.purpose, input.destination, input.province, toDatetime(input.departAt), toDatetime(input.returnAt), input.passengerCount, input.passengerNames, fleetRequestId]
    );
  }

  private requests(database: Database): RequestService {
    return new RequestService(new DatabaseWorkflowRepository(database), this.approvers, this.createId);
  }

  private async mapNoApprover<T>(work: () => Promise<T>): Promise<T | Failure> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_APPROVER') return fail('NO_APPROVER');
      throw error;
    }
  }
}
