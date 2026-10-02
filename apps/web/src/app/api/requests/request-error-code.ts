const knownWorkflowCodes = new Set(['NO_APPROVER', 'REQUEST_NOT_PENDING', 'CONFLICT_OF_INTEREST', 'NO_PENDING_APPROVAL', 'APPROVER_REQUIRED', 'REASON_REQUIRED']);

export function requestErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 401) return 'UNAUTHENTICATED';
    if (error.status === 403) return 'FORBIDDEN';
  }
  if (error instanceof Error && knownWorkflowCodes.has(error.message)) return error.message;
  return 'INTERNAL_ERROR';
}
