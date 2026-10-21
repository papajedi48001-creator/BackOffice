import { NextResponse } from 'next/server';
import { DatabaseRoomCatalogRepository, RoomBookingQueries, RoomCatalogService } from '@backoffice/core';
import { requireActor } from '../../../lib/actor';
import { roomDatabase } from './room-database';
import { roomErrorResponse } from './room-error-response';

export async function GET(request: Request): Promise<Response> {
  try {
    await requireActor(request);
    return NextResponse.json({ rooms: await new RoomBookingQueries(roomDatabase()).listRooms({ bookableOnly: new URL(request.url).searchParams.get('all') !== '1' }) });
  } catch (error) { return roomErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const room = await new RoomCatalogService(new DatabaseRoomCatalogRepository(roomDatabase())).createRoom(actor, await request.json());
    return NextResponse.json(room, { status: 201 });
  } catch (error) { return roomErrorResponse(error); }
}
