'use client';

import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';

export interface NotificationListItem { id: string; requestId: string | null; moduleLabel: string; subject: string; readAt: string | null; createdAt: string; }

export function NotificationList({ notifications }: { notifications: NotificationListItem[] }) {
  const router = useRouter();
  async function open(notification: NotificationListItem) {
    const response = await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
    if (!response.ok) return;
    const body = await response.json() as { href: string };
    router.push(body.href);
  }
  if (!notifications.length) return <p>{t('noNotifications')}</p>;
  return <ul>{notifications.map((notification) => <li key={notification.id}><button type="button" onClick={() => void open(notification)}><span className="notification-module">[{notification.moduleLabel}]</span> {notification.subject}</button><span>{notification.readAt ? t('read') : t('unread')}</span><time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString('th-TH')}</time></li>)}</ul>;
}
