export function canApproveRequest(actorPersonId: string | undefined, input: { status: string; assigneePersonId: string | undefined }): boolean {
  return input.status === 'IN_REVIEW' && Boolean(actorPersonId) && actorPersonId === input.assigneePersonId;
}
