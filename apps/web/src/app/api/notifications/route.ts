import { NextResponse } from 'next/server';
import { createDatabase } from '@backoffice/db';
import { requireAuthorized } from '../../../lib/require-authorized';
import { readRuntimeValue } from '../../../lib/runtime-env';

type NotificationRow = { id: string; requestId: string; subject: string; readAt: string | null; createdAt: string };

export async function GET(request: Request): Promise<Response> {
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const session = await requireAuthorized(request);
    const database = createDatabase(databaseUrl);
    try {
      const notifications = await database.query<NotificationRow>('SELECT id, request_id AS requestId, subject, read_at AS readAt, created_at AS createdAt FROM notification WHERE recipient_person_id = ? AND channel = ? ORDER BY created_at DESC', [session.personId!, 'in_app']);
      const count = (await database.query<{ unreadCount: number }>('SELECT COUNT(*) AS unreadCount FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [session.personId!, 'in_app']))[0];
      return NextResponse.json({ notifications, unreadCount: Number(count?.unreadCount ?? 0) });
    } finally { await database.close(); }
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'notifications_not_available' }, { status });
  }
}
