import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { requireAuthorized } from '../../../../../lib/require-authorized';
import { readRuntimeValue } from '../../../../../lib/runtime-env';

export async function PATCH(request: Request, context: { params: Promise<{ notificationId: string }> }): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const { notificationId } = await context.params;
    const database = createDatabase(databaseUrl);
    try {
      const notification = (await database.query<{ requestId: string }>('SELECT request_id AS requestId FROM notification WHERE id = ? AND recipient_person_id = ? AND channel = ? LIMIT 1', [notificationId, session.personId!, 'in_app']))[0];
      if (!notification?.requestId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await database.execute('UPDATE notification SET read_at = UTC_TIMESTAMP() WHERE id = ? AND recipient_person_id = ? AND read_at IS NULL', [notificationId, session.personId!]);
      return NextResponse.json({ requestId: notification.requestId });
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'notification_not_available' }, { status });
  }
}
