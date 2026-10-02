export function canApproveRequest(actorPersonId: string | undefined, input: { status: string; assigneePersonId: string | undefined }): boolean {
  return input.status === 'IN_REVIEW' && Boolean(actorPersonId) && actorPersonId === input.assigneePersonId;
}

export function canViewRequest(actorPersonId: string | undefined, input: { requestorPersonId: string; approverPersonIds: string[] }): boolean {
  if (!actorPersonId) return false;
  return actorPersonId === input.requestorPersonId || input.approverPersonIds.includes(actorPersonId);
}
