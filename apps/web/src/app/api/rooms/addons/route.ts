import { NextResponse } from 'next/server';
import { DatabaseRoomCatalogRepository, RoomBookingQueries, RoomCatalogService } from '@backoffice/core';
import { requireActor } from '../../../../lib/actor';
import { roomDatabase } from '../room-database';
import { roomErrorResponse } from '../room-error-response';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireActor(request);
    return NextResponse.json({ addons: await new RoomBookingQueries(roomDatabase()).listAddons({ activeOnly: new URL(request.url).searchParams.get('all') !== '1' }) });
  } catch (error) { return roomErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    return NextResponse.json(await new RoomCatalogService(new DatabaseRoomCatalogRepository(roomDatabase())).createAddon(actor, await request.json()), { status: 201 });
  } catch (error) { return roomErrorResponse(error); }
}
