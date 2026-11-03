import { NextResponse } from 'next/server';
import { LineService } from '@backoffice/core';
import { lineSettings } from '../../../../lib/line-api';
import { withSessionAndDatabase } from '../../hr/profile-route';

/** Whether the signed-in person has connected LINE, and whether LINE is set up at all. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const status = await new LineService(database).linkStatus(session.personId);
    const settings = lineSettings();
    return NextResponse.json({ linked: status !== null, linkedAt: status?.linkedAt ?? null, configured: Boolean(settings.accessToken && settings.channelSecret) });
  });
}

/** ยกเลิกการเชื่อมต่อ LINE: the person's own link only. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const removed = await new LineService(database).unlink(session.personId);
    return NextResponse.json({ ok: true, removed });
  });
}
