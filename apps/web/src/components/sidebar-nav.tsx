'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@backoffice/i18n';
import type { NavigationItem } from './app-shell';

export function SidebarNav({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return <nav aria-label={t('appName')}><ul>{items.map((item) => <li key={item.href}><Link href={item.href} data-module={item.module} className={item.development ? 'is-development' : undefined} aria-current={isCurrent(item.href) ? 'page' : undefined}>{t(item.label)}{item.development ? <span className="nav-dev-tag">{t('moduleDevelopmentShort')}</span> : null}{item.badge ? <span className="nav-badge" aria-label={`${item.badge} ${t(item.href === '/notifications' ? 'unreadNotifications' : 'launcherBadgeSuffix')}`}>{item.badge}</span> : null}</Link></li>)}</ul></nav>;
}
