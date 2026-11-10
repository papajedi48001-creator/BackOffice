import { NextResponse } from 'next/server';
import { AttendanceSettingsService, canManageAttendance, canManageAttendanceDevices, canReadAttendanceAudit, DeviceService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export { canManageAttendance, canManageAttendanceDevices, canReadAttendanceAudit, forbidden, readInput, withSessionAndDatabase };

export const attendanceSettings = (database: Database) => new AttendanceSettingsService(database);
export const attendanceDevices = (database: Database) => new DeviceService(database);

const statusByCode: Record<string, number> = { NOT_FOUND: 404, DUPLICATE_NAME: 409, DEVICE_REVOKED: 409 };

/** A service result as JSON, `{ error: code }` with 404/409 where the code says so, otherwise 400. Never cached: it can hold a รหัสจับคู่. */
export function attendanceResult(result: { ok: true } | { ok: false; code: string }, okStatus = 200): Response {
  const headers = { 'cache-control': 'no-store' };
  if (result.ok) return NextResponse.json(result, { status: okStatus, headers });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400, headers });
}

export const routeId = async (context: { params: Promise<{ id: string }> }) => (await context.params).id;
