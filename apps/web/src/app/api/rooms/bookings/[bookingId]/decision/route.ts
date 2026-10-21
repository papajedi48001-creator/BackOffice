import { NextResponse } from 'next/server';
import { DatabaseRoomBookingRepository, RoomBookingService } from '@backoffice/core';
import { requireActor } from '../../../../../../lib/actor';
import { roomDatabase } from '../../../room-database';
import { roomErrorResponse } from '../../../room-error-response';

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { bookingId } = await context.params;
    const body = await request.json() as { decision?: unknown; reason?: unknown };
    const booking = await new RoomBookingService(new DatabaseRoomBookingRepository(roomDatabase())).decide(actor, { bookingId, decision: body.decision as 'APPROVE', reason: body.reason as string | undefined });
    return NextResponse.json({ id: booking.id, reference: booking.reference, status: booking.status });
  } catch (error) { return roomErrorResponse(error); }
}
