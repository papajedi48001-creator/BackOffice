import { NextResponse } from 'next/server';
import { requestErrorCode } from './request-error-code';

const statusByCode: Record<string, 404 | 409 | 422> = {
  REQUEST_NOT_FOUND: 404,
  NOT_REQUESTOR: 404,
  REQUEST_NOT_CANCELLABLE: 409,
  REQUEST_NOT_RETURNED: 409,
  REASON_REQUIRED: 422,
  NO_APPROVER: 422
};

export function lifecycleErrorStatus(code: string): 404 | 409 | 422 | 400 {
  return statusByCode[code] ?? 400;
}

// Logs only the error code: a cancellation reason must never reach the log.
export function lifecycleFailure(error: unknown): Response {
  const code = requestErrorCode(error);
  console.error('backoffice.request_lifecycle_failed', { code });
  if (code === 'UNAUTHENTICATED') return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (code === 'FORBIDDEN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ error: code.toLowerCase() }, { status: lifecycleErrorStatus(code) });
}
