import { NextResponse } from 'next/server';
import { OfficialTravelService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { DatabaseApproverResolver } from '../../../lib/database-approver-resolver';

export { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export const travelService = (database: Database) => new OfficialTravelService(database, new DatabaseApproverResolver(database));

const statusByCode: Record<string, number> = { NOT_FOUND: 404, NOT_PENDING: 409, NOT_RETURNED: 409 };

/** A service result as JSON: rule failures are 400 with their code and the person they are about, except the codes above. */
export function travelResult(result: { ok: true } | { ok: false; code: string; personId?: string }, createdStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: createdStatus });
  return NextResponse.json({ error: result.code, ...(result.personId ? { personId: result.personId } : {}) }, { status: statusByCode[result.code] ?? 400 });
}

// The หัวหน้าคณะ is always the session's person; one named in the body is dropped, not trusted.
export const withoutLeader = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'personId' && key !== 'leaderPersonId'));
