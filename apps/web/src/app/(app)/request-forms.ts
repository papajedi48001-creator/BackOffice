'use server';

import { LeaveQueries, OfficialTravelQueries, RoomBookingQueries } from '@backoffice/core';
import { pageActor } from '../../lib/actor';
import { attachmentsEnabled } from '../../lib/attachments';
import { bangkokToday } from '../../lib/bangkok-time';
import { getSharedDatabase } from '../../lib/database';
import { travelPrefill } from './fleet/fleet-page';
import { leaveSession } from './leave/leave-page';
import type { LeaveFormType } from './leave/new/leave-form';
import type { FleetFormValues } from './fleet/new/fleet-form';
import type { BookableRoom, SelectableAddon } from './rooms/bookings/new/booking-form';
import { leaderOf } from './travel/travel-leader';
import type { TravelPerson } from './travel/new/travel-form';

export type RequestFormData =
  | { module: 'leave'; types: LeaveFormType[]; attachments: boolean }
  | { module: 'official-travel'; leader: TravelPerson; attachments: boolean }
  | { module: 'fleet'; fromTravel: boolean; initial?: FleetFormValues; officialTravelId?: string }
  | { module: 'room-booking'; rooms: BookableRoom[]; addons: SelectableAddon[]; today: string }
  | { module: 'none' }
  | { module: 'unavailable' };

/**
 * What the top request button's popup needs, loaded on the server with the same checks the request pages used:
 * a signed-in person, leave types they may file, a คำขอไปราชการ to prefill from only when they may see it.
 * The API still checks everything again on submit.
 */
export async function loadRequestForm(module: string, travelId?: string): Promise<RequestFormData> {
  if (module === 'room-booking') {
    if (!(await pageActor())) return { module: 'none' };
    const database = getSharedDatabase();
    if (!database) return { module: 'unavailable' };
    const queries = new RoomBookingQueries(database);
    const [rooms, addons] = await Promise.all([queries.listRooms({ bookableOnly: true }), queries.listAddons({ activeOnly: true })]);
    return { module, rooms: rooms.map(({ id, name, capacity, place }) => ({ id, name, capacity, place })), addons: addons.map(({ id, name, unit }) => ({ id, name, unit })), today: bangkokToday() };
  }
  if (module !== 'leave' && module !== 'official-travel' && module !== 'fleet') return { module: 'none' };
  const session = await leaveSession();
  if (!session) return { module: 'none' };
  const database = getSharedDatabase();
  if (!database) return { module: 'unavailable' };
  if (module === 'leave') {
    // A type limited to the other gender (ลาคลอดบุตร, ลาไปช่วยภริยาคลอดบุตร) is not offered; the server refuses it too.
    const types = await new LeaveQueries(database).typesFor(session.personId);
    return { module, types: types.map(({ id, code, name, counting }) => ({ id, code, name, counting })), attachments: attachmentsEnabled() };
  }
  if (module === 'official-travel') return { module, leader: await leaderOf(database, session.personId), attachments: attachmentsEnabled() };
  const travel = travelId ? await new OfficialTravelQueries(database).detail(travelId, session) : null;
  return travel ? { module, fromTravel: true, initial: travelPrefill(travel), officialTravelId: travel.travelId } : { module, fromTravel: false };
}
