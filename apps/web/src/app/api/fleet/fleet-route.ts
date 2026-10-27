import { NextResponse } from 'next/server';
import { canManageFleet, FleetCatalogService, FleetDispatchService, FleetQueries, FleetRequestService, OfficialTravelQueries } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { DatabaseApproverResolver } from '../../../lib/database-approver-resolver';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';
import { settle } from '../travel/travel-route';

export { forbidden, readInput, settle, withSessionAndDatabase };
export { canManageFleet };

export const fleetRequests = (database: Database) => new FleetRequestService(database, new DatabaseApproverResolver(database));
export const fleetDispatch = (database: Database) => new FleetDispatchService(database);
export const fleetCatalog = (database: Database) => new FleetCatalogService(database);
export const fleetQueries = (database: Database) => new FleetQueries(database);
export const staffSearch = (database: Database, text: string) => new OfficialTravelQueries(database).people(text);

const statusByCode: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_PENDING: 409, NOT_RETURNED: 409, VEHICLE_BUSY: 409, DRIVER_BUSY: 409,
  TRAVEL_ALREADY_HAS_CAR: 409, DRIVER_HAS_TRIPS: 409, DUPLICATE_REGISTRATION: 409
};

/** A service result as JSON: `{ error: code }` with 409 for a state conflict, 404 when missing, otherwise 400. */
export function fleetResult(result: { ok: true } | { ok: false; code: string }, extra: Record<string, unknown> = {}, okStatus = 200): Response {
  if (result.ok) return NextResponse.json({ ...result, ...extra }, { status: okStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}
