import { NextResponse } from 'next/server';
import { DatabaseRoomBookingRepository, RoomBookingService } from '@backoffice/core';
import { requireActor } from '../../../../../../lib/actor';
import { roomDatabase } from '../../../room-database';
import { roomErrorResponse } from '../../../room-error-response';

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { bookingId } = await context.params;
    const body = await request.json() as { reason?: unknown };
    const { booking, releasedDayCount } = await new RoomBookingService(new DatabaseRoomBookingRepository(roomDatabase())).cancel(actor, { bookingId, reason: body.reason as string });
    return NextResponse.json({ id: booking.id, reference: booking.reference, status: booking.status, releasedDayCount });
  } catch (error) { return roomErrorResponse(error); }
}
