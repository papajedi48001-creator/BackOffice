import { NextResponse } from 'next/server';
import { BookingConflictError } from '@backoffice/core';
import { AuthorizationError } from '../../../lib/require-authorized';

const statusByCode: Record<string, number> = {
  INVALID_DATES: 400, INVALID_TIME_RANGE: 400, OUTSIDE_BOOKING_WINDOW: 400, OVER_CAPACITY: 400, INVALID_ADDON: 400, REASON_REQUIRED: 400,
  FORBIDDEN: 403, CONFLICT_OF_INTEREST: 403,
  ROOM_NOT_FOUND: 404, BOOKING_NOT_FOUND: 404, ADDON_NOT_FOUND: 404,
  ROOM_NOT_BOOKABLE: 409, BOOKING_NOT_PENDING: 409, CANCEL_NOT_ALLOWED: 409, NOTHING_TO_RELEASE: 409,
  SERVICE_UNAVAILABLE: 503
};

export function roomErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) return NextResponse.json({ error: error.status === 401 ? 'unauthenticated' : 'FORBIDDEN' }, { status: error.status });
  if (error instanceof BookingConflictError) return NextResponse.json({ error: 'BOOKING_CONFLICT', conflicts: error.conflicts.map((range) => ({ startsAt: range.startsAt.toISOString(), endsAt: range.endsAt.toISOString() })) }, { status: 409 });
  if (error instanceof Error && error.name === 'ZodError') return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  const code = error instanceof Error ? error.message : '';
  const status = statusByCode[code];
  if (status) return NextResponse.json({ error: code }, { status });
  // Database messages can echo row values such as meeting titles, so log the error class only.
  console.error('backoffice.room_booking_failed', { code: error instanceof Error ? error.name : 'unknown' });
  return NextResponse.json({ error: 'room_booking_failed' }, { status: 500 });
}
