import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDatabase } from '@backoffice/db';
import { t } from '@backoffice/i18n';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { readSession } from '../../../lib/session';
import { moduleLabel } from '../../../lib/modules';
import { NotificationList, type NotificationListItem } from './notification-list';

type NotificationRow = Omit<NotificationListItem, 'moduleLabel'> & { moduleCode: string | null };

export default async function NotificationsPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <section><h2>{t('notificationsTitle')}</h2><p role="alert">{t('notificationLoadError')}</p></section>;
  const database = createDatabase(databaseUrl);
  try {
    const notifications = await database.query<NotificationRow>('SELECT id, request_id AS requestId, module_code AS moduleCode, subject, read_at AS readAt, created_at AS createdAt FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL ORDER BY created_at DESC', [session.personId, 'in_app']);
    return <section><h2>{t('notificationsTitle')}</h2><NotificationList notifications={notifications.map(({ moduleCode, ...notification }) => ({ ...notification, moduleLabel: moduleLabel(moduleCode), ...(moduleCode ? { module: moduleCode } : {}) }))} /></section>;
  } finally { await database.close(); }
}
