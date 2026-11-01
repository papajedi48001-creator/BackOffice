import { NextResponse } from 'next/server';
import { AdminQueries, AdminService, isAdmin } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export { readInput };

type AdminSession = Parameters<Parameters<typeof withSessionAndDatabase>[1]>[0];

/** Every admin API: signed in, then ผู้ดูแลระบบ, checked here on the server before anything is read or changed. */
export function withAdmin(request: Request, action: (session: AdminSession, database: Database) => Promise<Response>): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => isAdmin(session) ? action(session, database) : forbidden());
}

export const adminService = (database: Database) => new AdminService(database);
export const adminQueries = (database: Database) => new AdminQueries(database);

const statusByCode: Record<string, number> = { NOT_FOUND: 404, LAST_ADMIN: 409, MODULE_LOCKED: 409, PERSON_NOT_ACTIVE: 409 };

export function adminResult(result: { ok: true } | { ok: false; code: string }, okStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: okStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}

export function invalid(field: string): Response {
  return NextResponse.json({ error: 'invalid_input', fields: [field] }, { status: 400 });
}
