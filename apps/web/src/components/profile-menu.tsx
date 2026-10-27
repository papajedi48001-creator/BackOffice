'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { t } from '@backoffice/i18n';
import { formatBangkokDateTime } from '../lib/bangkok-time';
import { initialsOf } from '../lib/initials';

export interface BellItem { id: string; moduleLabel: string; module?: string; subject: string; readAt: string | null; createdAt: string; }
export interface ShellProfile { displayName: string | null; positionTitle: string | null; photoUrl: string | null; }

/**
 * The signed-in person at the top right: photo or initials, name and ตำแหน่งงาน. The menu links to their own profile,
 * lists unread notices (opening one marks it read and goes to its page) and links to the notification centre.
 */
export function ProfileMenu({ profile, unread, items }: { profile: ShellProfile; unread: number; items: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<string[]>([]);
  const [photoFailed, setPhotoFailed] = useState(false);
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
    setOpened((current) => [...current, item.id]);
    setOpen(false);
    router.push(body.href);
    router.refresh();
  }
  const unreadItems = items.filter((item) => !item.readAt && !opened.includes(item.id));
  const count = Math.max(0, unread - opened.length);
  const name = profile.displayName ?? t('profileUnknownName');
  const label = count ? `${name} ${count} ${t('unreadNotifications')}` : name;
  const avatar = profile.photoUrl && !photoFailed
    // A plain <img>: the photo route is private and authenticated by the session cookie.
    ? <img className="profile-avatar" src={profile.photoUrl} alt="" width={40} height={40} onError={() => setPhotoFailed(true)} />
    : <span className="profile-avatar profile-initials" aria-hidden="true">{initialsOf(profile.displayName)}</span>;
  return <div className="profile-menu" ref={root}>
    <button type="button" className="profile-chip" aria-label={label} aria-expanded={open} aria-controls="profile-panel" onClick={() => setOpen((value) => !value)}>
      <span className="profile-avatar-wrap">{avatar}{count ? <span className="profile-count" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}</span>
      <span className="profile-text" aria-hidden="true"><span className="profile-name">{name}</span>{profile.positionTitle ? <span className="profile-position">{profile.positionTitle}</span> : null}</span>
      <svg className="profile-caret" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open && <div id="profile-panel" className="profile-panel">
      <div className="profile-panel-head"><p className="profile-name">{name}</p>{profile.positionTitle ? <p className="profile-position">{profile.positionTitle}</p> : null}</div>
      <Link className="profile-link" href="/hr/me" onClick={() => setOpen(false)}>{t('profileMyInfo')}</Link>
      {unreadItems.length ? <>
        <p className="profile-section-title">{t('bellLabel')}</p>
        <ul>{unreadItems.map((item) => <li key={item.id} className="is-unread" data-module={item.module}>
          <button type="button" onClick={() => void openNotice(item)}><span className="notice-module">{item.moduleLabel}</span><span className="profile-subject">{item.subject}</span><time dateTime={item.createdAt}>{formatBangkokDateTime(item.createdAt)}</time></button>
        </li>)}</ul>
      </> : null}
      <Link className="profile-link profile-all" href="/notifications" onClick={() => setOpen(false)}>{t('bellSeeAll')}</Link>
    </div>}
  </div>;
}
