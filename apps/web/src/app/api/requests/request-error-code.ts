const knownWorkflowCodes = new Set(['NO_APPROVER', 'REQUEST_NOT_PENDING', 'CONFLICT_OF_INTEREST', 'NO_PENDING_APPROVAL', 'APPROVER_REQUIRED', 'REASON_REQUIRED', 'REQUEST_NOT_FOUND', 'NOT_REQUESTOR', 'REQUEST_NOT_CANCELLABLE', 'REQUEST_NOT_RETURNED']);

export function requestErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 401) return 'UNAUTHENTICATED';
    if (error.status === 403) return 'FORBIDDEN';
  }
  if (error instanceof Error && knownWorkflowCodes.has(error.message)) return error.message;
  return 'INTERNAL_ERROR';
}
