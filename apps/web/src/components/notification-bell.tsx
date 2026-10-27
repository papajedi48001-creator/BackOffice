'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';

export interface BellItem { id: string; moduleLabel: string; module?: string; subject: string; readAt: string | null; createdAt: string; }

/** Bell at the top right: the newest in-app notices; opening one marks it read and goes to its page. */
export function NotificationBell({ unread, items }: { unread: number; items: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);
  async function openNotice(item: BellItem) {
    const response = await fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
    if (!response.ok) return;
    const body = await response.json() as { href: string };
    setOpen(false);
    router.push(body.href);
    router.refresh();
  }
  const unreadItems = items.filter((item) => !item.readAt);
  if (!unread) return null;
  const label = unread ? `${t('bellLabel')} ${unread} ${t('unreadNotifications')}` : t('bellLabel');
  return <div className="notification-bell" ref={root}>
    <button type="button" className="bell-button" aria-label={label} aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      {unread ? <span className="bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
    {open && <div id="bell-panel" className="bell-panel">
      <p className="bell-title">{t('bellLabel')}</p>
      {unreadItems.length ? <ul>{unreadItems.map((item) => <li key={item.id} className="is-unread" data-module={item.module}>
        <button type="button" onClick={() => void openNotice(item)}><span className="notice-module">{item.moduleLabel}</span><span className="bell-subject">{item.subject}</span><time dateTime={item.createdAt}>{formatBangkokDateTime(item.createdAt)}</time></button>
      </li>)}</ul> : <p className="bell-empty">{t('bellEmpty')}</p>}
      <Link className="bell-all" href="/notifications" onClick={() => setOpen(false)}>{t('bellSeeAll')}</Link>
    </div>}
  </div>;
}
