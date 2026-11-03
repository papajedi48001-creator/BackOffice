import { NextResponse } from 'next/server';
import { DatabaseRoomBookingRepository, RoomBookingQueries, RoomBookingService } from '@backoffice/core';
import { requireActor } from '../../../../lib/actor';
import { DatabaseApproverResolver } from '../../../../lib/database-approver-resolver';
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
    const database = roomDatabase();
    // The resolver finds the booker's head, who agrees to the booking in คำขอ before a room manager decides it.
    const booking = await new RoomBookingService(new DatabaseRoomBookingRepository(database, new DatabaseApproverResolver(database))).submit(actor, await request.json());
    return NextResponse.json({ id: booking.id, reference: booking.reference, status: booking.status }, { status: 201 });
  } catch (error) { return roomErrorResponse(error); }
}
