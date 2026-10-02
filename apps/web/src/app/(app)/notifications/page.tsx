import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDatabase } from '@backoffice/db';
import { t } from '@backoffice/i18n';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { readSession } from '../../../lib/session';
import { NotificationList, type NotificationListItem } from './notification-list';

export default async function NotificationsPage() {
  const session = readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <section><h2>{t('notificationsTitle')}</h2><p role="alert">{t('notificationLoadError')}</p></section>;
  const database = createDatabase(databaseUrl);
  try {
    const notifications = await database.query<NotificationListItem>('SELECT id, request_id AS requestId, subject, read_at AS readAt, created_at AS createdAt FROM notification WHERE recipient_person_id = ? AND channel = ? ORDER BY created_at DESC', [session.personId, 'in_app']);
    return <section><h2>{t('notificationsTitle')}</h2><NotificationList notifications={notifications} /></section>;
  } finally { await database.close(); }
}
