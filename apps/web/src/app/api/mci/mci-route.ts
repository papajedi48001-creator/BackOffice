import { NextResponse } from 'next/server';
import { canCommandMci, MciIncidentService, MciPatientService, MciResponderService, MciSettingsService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export { canCommandMci, forbidden, readInput, withSessionAndDatabase };

export const mciIncidents = (database: Database) => new MciIncidentService(database);
export const mciResponders = (database: Database) => new MciResponderService(database);
export const mciPatients = (database: Database) => new MciPatientService(database);
export const mciSettings = (database: Database) => new MciSettingsService(database);

const statusByCode: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403,
  INCIDENT_ALREADY_OPEN: 409, INCIDENT_CLOSED: 409, INCIDENT_OPEN: 409, NO_OPEN_INCIDENT: 409, ALREADY_OUT: 409, DUPLICATE_NAME: 409, PROTECTED: 409
};

/** A service result as JSON: `{ error: code }` with 403/404/409 where the code says so, otherwise 400. */
export function mciResult(result: { ok: true } | { ok: false; code: string }, okStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: okStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}
