/** Events of the spec's Notifications table that the fleet module sends itself (head-stage notices come from the central workflow). */
export type FleetEvent = 'waiting' | 'assigned' | 'declined' | 'changed' | 'requester-cancelled' | 'trip-cancelled';

export interface FleetNoticeContext {
  /** Who acted; never told of their own act. */
  actorPersonId: string;
  fleetRequestId?: string;
  tripId?: string;
  managerPersonIds?: readonly string[];
  requesterPersonIds?: readonly string[];
  /** Every ใบ on a changed เที่ยวรถ with its requester. */
  requesters?: ReadonlyArray<{ personId: string; fleetRequestId: string }>;
  driverPersonId?: string | null;
  previousDriverPersonId?: string | null;
  registration?: string;
}

export interface FleetNotice { recipientPersonId: string; subject: string; targetPath: string }

const requestPath = (id: string | undefined) => `/fleet/requests/${id}`;
const tripPath = (id: string | undefined) => `/fleet/trips/${id}`;
const people = (ids: ReadonlyArray<string | null | undefined> | undefined) => (ids ?? []).filter((id): id is string => Boolean(id));

/** Who hears of a fleet event, with what subject and link. No purpose, destination, passengers or reason ever goes in. */
export function noticesFor(event: FleetEvent, ctx: FleetNoticeContext): FleetNotice[] {
  const all = ((): FleetNotice[] => {
    const to = (ids: ReadonlyArray<string | null | undefined> | undefined, subject: string, targetPath: string) => people(ids).map((recipientPersonId) => ({ recipientPersonId, subject, targetPath }));
    switch (event) {
      case 'waiting': return to(ctx.managerPersonIds, 'มีใบขอใช้รถรอจัดรถ', requestPath(ctx.fleetRequestId));
      case 'assigned': return [...to(ctx.requesterPersonIds, `จัดรถแล้ว > ${ctx.registration}`, requestPath(ctx.fleetRequestId)), ...to([ctx.driverPersonId], 'มีงานขับใหม่', tripPath(ctx.tripId))];
      case 'declined': return to(ctx.requesterPersonIds, 'ไม่จัดรถ', requestPath(ctx.fleetRequestId));
      case 'changed': return [
        ...(ctx.requesters ?? []).map((requester) => ({ recipientPersonId: requester.personId, subject: 'เปลี่ยนรถหรือเวลา', targetPath: requestPath(requester.fleetRequestId) })),
        ...to([ctx.driverPersonId, ctx.previousDriverPersonId], 'เปลี่ยนรถหรือเวลา', tripPath(ctx.tripId))
      ];
      case 'requester-cancelled': return [...to(ctx.managerPersonIds, 'ผู้ขอยกเลิกใบขอใช้รถ', requestPath(ctx.fleetRequestId)), ...to([ctx.driverPersonId], 'ผู้ขอยกเลิกใบขอใช้รถ', tripPath(ctx.tripId))];
      case 'trip-cancelled': return to([ctx.driverPersonId], 'ยกเลิกงานขับ', tripPath(ctx.tripId));
    }
  })();
  // One notice per person, the first that applies, so the idempotency key `<event>:<id>:<recipient>` stays unique; the actor is left out.
  const seen = new Set<string>([ctx.actorPersonId]);
  return all.filter((notice) => !seen.has(notice.recipientPersonId) && Boolean(seen.add(notice.recipientPersonId)));
}
