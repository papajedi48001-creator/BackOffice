'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type MessageKey } from '@backoffice/i18n';

export interface SectionLink { href: string; labelKey: MessageKey; badge?: number; }

/** Section bar inside a module. One section needs no bar. */
export function ModuleSubnav({ sections }: { sections: SectionLink[] }) {
  const pathname = usePathname();
  if (sections.length < 2) return null;
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // When one section sits inside another (/rooms/bookings/new in /rooms/bookings), only the longest match is current.
  const current = sections.filter((section) => matches(section.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isCurrent = (href: string) => href === current;
  return <nav className="module-subnav" aria-label={t('moduleSectionsLabel')}><ul>{sections.map((section) => <li key={section.href}><Link href={section.href} aria-current={isCurrent(section.href) ? 'page' : undefined}>{t(section.labelKey)}{section.badge ? <span className="count-badge" aria-label={`${section.badge} ${t('launcherBadgeSuffix')}`}>{section.badge}</span> : null}</Link></li>)}</ul></nav>;
}
