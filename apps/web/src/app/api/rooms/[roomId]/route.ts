import { NextResponse } from 'next/server';
import { DatabaseRoomCatalogRepository, RoomCatalogService } from '@backoffice/core';
import { requireActor } from '../../../../lib/actor';
import { roomDatabase } from '../room-database';
import { roomErrorResponse } from '../room-error-response';

export async function PATCH(request: Request, context: { params: Promise<{ roomId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { roomId } = await context.params;
    return NextResponse.json(await new RoomCatalogService(new DatabaseRoomCatalogRepository(roomDatabase())).updateRoom(actor, roomId, await request.json()));
  } catch (error) { return roomErrorResponse(error); }
}
