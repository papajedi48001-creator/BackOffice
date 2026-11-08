import { canDecideOwnRequest } from '@backoffice/core';

/** The pending step's assignee; on their own request only in the admin or manager tier (canDecideOwnRequest), as ApprovalService checks. */
export function canApproveRequest(actorPersonId: string | undefined, input: { status: string; assigneePersonId: string | undefined; requestorPersonId?: string; activeRole?: string | null }): boolean {
  const own = input.requestorPersonId !== undefined && actorPersonId === input.requestorPersonId;
  return input.status === 'IN_REVIEW' && Boolean(actorPersonId) && actorPersonId === input.assigneePersonId && (!own || canDecideOwnRequest(input.activeRole));
}

export function canViewRequest(actorPersonId: string | undefined, input: { requestorPersonId: string; approverPersonIds: string[] }): boolean {
  if (!actorPersonId) return false;
  return actorPersonId === input.requestorPersonId || input.approverPersonIds.includes(actorPersonId);
}

export function canCancelRequest(actorPersonId: string | undefined, input: { requestorPersonId: string; status: string }): boolean {
  return Boolean(actorPersonId) && actorPersonId === input.requestorPersonId && (input.status === 'IN_REVIEW' || input.status === 'RETURNED');
}

export function canResubmitRequest(actorPersonId: string | undefined, input: { requestorPersonId: string; status: string }): boolean {
  return Boolean(actorPersonId) && actorPersonId === input.requestorPersonId && input.status === 'RETURNED';
}
