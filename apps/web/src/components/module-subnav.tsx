'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '@backoffice/i18n';

export interface SectionLink { href: string; labelKey: MessageKey; badge?: number; }

// useLayoutEffect warns during server rendering; the button is placed in the browser only.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Section bar inside a module. One section needs no bar.
 * แบบ 7.5 (DESIGN.md): the sections sit in a track, and a glowing button in the module colour slides to the section clicked.
 */
export function ModuleSubnav({ sections }: { sections: SectionLink[] }) {
  const pathname = usePathname();
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // When one section sits inside another (/rooms/bookings/new in /rooms/bookings), only the longest match is current.
  const current = sections.filter((section) => matches(section.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const [active, setActive] = useState<string | null>(current);
  const [ready, setReady] = useState(false);
  const track = useRef<HTMLUListElement>(null);
  const thumb = useRef<HTMLLIElement>(null);
  // Set once the button has its first place; later moves slide.
  const placed = useRef(false);

  // A navigation (back button, a link elsewhere) moves the button to the section now shown.
  useEffect(() => { setActive(current); }, [current]);

  const place = useCallback(() => {
    const element = thumb.current;
    const link = active ? track.current?.querySelector<HTMLAnchorElement>(`a[data-href="${CSS.escape(active)}"]`) : null;
    if (!element) return;
    element.style.opacity = link ? '' : '0';
    if (!link) return;
    // The first placement jumps straight to the section instead of sliding in from the left edge.
    if (!placed.current) element.style.transition = 'none';
    // The bar wraps on narrow screens, so the button moves down as well as across.
    element.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`;
    element.style.width = `${link.offsetWidth}px`;
    element.style.height = `${link.offsetHeight}px`;
    if (!placed.current) { void element.offsetWidth; element.style.transition = ''; placed.current = true; }
  }, [active]);

  useBrowserLayoutEffect(() => { place(); setReady(true); }, [place, sections]);
  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  if (sections.length < 2) return null;
  return <nav className="module-subnav" aria-label={t('moduleSectionsLabel')}><ul ref={track} className={ready ? 'is-ready' : undefined}>
    {/* An empty, hidden list item, so the list holds only <li>; it is absolutely placed and takes no room in the row. */}
    <li ref={thumb} className="subnav-thumb" aria-hidden="true" data-at={active ?? undefined} />
    {sections.map((section) => <li key={section.href}><Link href={section.href} data-href={section.href}
      // Every link has a class, so the underlined text-link style for plain links in .app-main never reaches the bar.
      className={active === section.href ? 'subnav-link is-active' : 'subnav-link'}
      aria-current={section.href === current ? 'page' : undefined} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setActive(section.href); }}>
      {t(section.labelKey)}{section.badge ? <span className="count-badge" aria-label={`${section.badge} ${t('launcherBadgeSuffix')}`}>{section.badge}</span> : null}
    </Link></li>)}
  </ul></nav>;
}
