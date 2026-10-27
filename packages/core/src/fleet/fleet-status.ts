import type { DispatchStatus, FleetRequestStatus, RequestStatus, TripStatus } from '@backoffice/contracts';

/** The status of a ใบขอใช้รถ. The head คำขอ comes first (null when filed from ไปราชการ), then the dispatch, then the เที่ยวรถ. */
export function fleetRequestStatus(input: { headStatus: RequestStatus | null; dispatchStatus: DispatchStatus; tripStatus: TripStatus | null }): FleetRequestStatus {
  const { headStatus, dispatchStatus, tripStatus } = input;
  if (dispatchStatus === 'CANCELLED' || headStatus === 'CANCELLED') return 'CANCELLED';
  if (headStatus === 'IN_REVIEW') return 'HEAD_REVIEW';
  if (headStatus === 'RETURNED') return 'RETURNED';
  if (headStatus === 'REJECTED') return 'HEAD_REJECTED';
  if (dispatchStatus === 'DECLINED') return 'DECLINED';
  if (dispatchStatus === 'ASSIGNED') {
    if (tripStatus === 'PLANNED') return 'ASSIGNED';
    if (tripStatus === 'DEPARTED') return 'DEPARTED';
    if (tripStatus === 'RETURNED') return 'DONE';
  }
  return 'WAITING';
}

/** The requester may cancel until the car leaves. */
export function canCancel(status: FleetRequestStatus): boolean {
  return status === 'HEAD_REVIEW' || status === 'RETURNED' || status === 'WAITING' || status === 'ASSIGNED';
}
