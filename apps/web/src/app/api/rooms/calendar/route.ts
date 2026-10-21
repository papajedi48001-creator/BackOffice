import { NextResponse } from 'next/server';
import { bangkokDayStart, RoomBookingQueries } from '@backoffice/core';
import { requireActor } from '../../../../lib/actor';
import { roomDatabase } from '../room-database';
import { roomErrorResponse } from '../room-error-response';

const maxCalendarDays = 42;
const dayMs = 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireActor(request);
    const url = new URL(request.url);
    const from = bangkokDayStart(url.searchParams.get('from') ?? '');
    const to = new Date(bangkokDayStart(url.searchParams.get('to') ?? '').getTime() + dayMs);
    if (to <= from || to.getTime() - from.getTime() > maxCalendarDays * dayMs) throw new Error('INVALID_DATES');
    const entries = await new RoomBookingQueries(roomDatabase()).calendar(from, to, url.searchParams.get('roomId') ?? undefined);
    return NextResponse.json({ entries });
  } catch (error) { return roomErrorResponse(error); }
}
