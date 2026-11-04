import { NextResponse } from 'next/server';
import { DatabaseRoomBookingRepository, RoomBookingQueries, RoomBookingService } from '@backoffice/core';
import { requireActor } from '../../../../lib/actor';
import { roomDatabase } from '../room-database';
import { roomErrorResponse } from '../room-error-response';

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    return NextResponse.json({ bookings: await new RoomBookingQueries(roomDatabase()).myBookings(actor.personId) });
  } catch (error) { return roomErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const booking = await new RoomBookingService(new DatabaseRoomBookingRepository(roomDatabase())).submit(actor, await request.json());
    return NextResponse.json({ id: booking.id, reference: booking.reference, status: booking.status }, { status: 201 });
  } catch (error) { return roomErrorResponse(error); }
}
