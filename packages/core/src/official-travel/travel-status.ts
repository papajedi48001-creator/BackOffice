import type { RequestStatus } from '@backoffice/contracts';

export type TripStatus = 'RETURNED' | 'IN_REVIEW' | 'CANCELLED' | 'REJECTED' | 'APPROVED';

/** A trip's status from its people's คำขอ: a return needs the หัวหน้าคณะ first, then anything still waiting; a trip with anyone approved goes. */
export function tripStatus(statuses: readonly RequestStatus[]): TripStatus {
  if (statuses.includes('RETURNED')) return 'RETURNED';
  if (statuses.includes('IN_REVIEW')) return 'IN_REVIEW';
  if (statuses.every((status) => status === 'CANCELLED')) return 'CANCELLED';
  if (statuses.every((status) => status === 'REJECTED' || status === 'CANCELLED')) return 'REJECTED';
  return 'APPROVED';
}
