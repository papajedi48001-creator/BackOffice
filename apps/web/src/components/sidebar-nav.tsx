'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@backoffice/i18n';
import type { NavigationItem } from './app-shell';
import { ModuleIcon } from './module-icon';

// useLayoutEffect warns during server rendering; the pill is placed in the browser only.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * เมนูด้านซ้าย (DESIGN.md): each item has its module icon in a coloured box that bounces on hover.
 * A faint pill follows the pointer or keyboard focus; the solid white pill stays on the current page and moves only when an item is clicked.
 */
export function SidebarNav({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = items.find((item) => isCurrent(item.href))?.href ?? null;
  const [active, setActive] = useState<string | null>(current);
  const [hovered, setHovered] = useState<string | null>(current);
  const [ready, setReady] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);

  // A navigation (back button, a link elsewhere) moves the solid pill to the page now shown.
  useEffect(() => { setActive(current); }, [current]);

  const place = useCallback((element: HTMLSpanElement | null, href: string | null) => {
    const link = href ? track.current?.querySelector<HTMLAnchorElement>(`a[data-href="${CSS.escape(href)}"]`) : null;
    if (!element) return;
    element.style.opacity = link ? '' : '0';
    if (!link) return;
    // On phones the menu is two columns, so the pill moves across as well as down.
    element.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`;
    element.style.width = `${link.offsetWidth}px`;
    element.style.height = `${link.offsetHeight}px`;
  }, []);

  useBrowserLayoutEffect(() => { place(pill.current, active); setReady(true); }, [active, items, place]);
  useBrowserLayoutEffect(() => { place(ghost.current, hovered); }, [hovered, items, place]);

  return <nav aria-label={t('appName')}><div ref={track} className={`nav-track${ready ? ' is-ready' : ''}`} onPointerLeave={() => setHovered(active)}>
    <span ref={ghost} className="nav-ghost" aria-hidden="true" data-at={hovered ?? undefined} />
    <span ref={pill} className="nav-pill" aria-hidden="true" data-at={active ?? undefined} />
    <ul>{items.map((item) => <li key={item.href}><Link href={item.href} data-href={item.href} data-module={item.module}
      className={[active === item.href ? 'is-active' : '', item.development ? 'is-development' : ''].filter(Boolean).join(' ') || undefined}
      aria-current={isCurrent(item.href) ? 'page' : undefined}
      onPointerEnter={() => setHovered(item.href)} onFocus={() => setHovered(item.href)} onClick={() => setActive(item.href)}>
      {item.icon ? <span className="nav-icon" aria-hidden="true"><ModuleIcon name={item.icon} /></span> : null}
      {t(item.label)}{item.development ? <span className="nav-dev-tag">{t('moduleDevelopmentShort')}</span> : null}{item.badge ? <span className="nav-badge" aria-label={`${item.badge} ${t(item.href === '/notifications' ? 'unreadNotifications' : 'launcherBadgeSuffix')}`}>{item.badge}</span> : null}
    </Link></li>)}</ul>
  </div></nav>;
}
