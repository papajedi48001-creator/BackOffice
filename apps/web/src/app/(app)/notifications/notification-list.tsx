'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../../../lib/bangkok-time';

export interface NotificationListItem { id: string; requestId: string | null; moduleLabel: string; module?: string; subject: string; readAt: string | null; createdAt: string; }

/** Unread notices only; opening one marks it read, takes it off the list and goes to its page. */
export function NotificationList({ notifications }: { notifications: NotificationListItem[] }) {
  const router = useRouter();
  const [opened, setOpened] = useState<string[]>([]);
  const shown = notifications.filter((notification) => !notification.readAt && !opened.includes(notification.id));
  async function open(notification: NotificationListItem) {
    const response = await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
    if (!response.ok) return;
    const body = await response.json() as { href: string };
    setOpened((ids) => [...ids, notification.id]);
    router.push(body.href);
    router.refresh?.();
  }
  if (!shown.length) return <p className="notice-empty">{t('noNotifications')}</p>;
  return <ul className="notice-list">{shown.map((notification) => <li key={notification.id} data-module={notification.module}>
    <button type="button" className="notice-card" onClick={() => void open(notification)}>
      <span className="notice-module">{notification.moduleLabel}</span>
      <span className="notice-subject">{notification.subject}</span>
      <time dateTime={notification.createdAt}>{formatBangkokDateTime(notification.createdAt)}</time>
    </button>
  </li>)}</ul>;
}
