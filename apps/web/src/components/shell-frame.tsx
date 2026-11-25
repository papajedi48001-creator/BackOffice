'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { matchModule } from '../lib/module-theme';
import { SIDEBAR_COOKIE, SIDEBAR_DEFAULT, isSidebarRail, serializeSidebarCookie, type SidebarWidth } from '../lib/sidebar-width';
import type { NavigationItem } from './app-shell';
import { SidebarEdge } from './sidebar-edge';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Sets data-module on the shell so the page takes its module's colour, and holds the menu width
 * (เมนูซ้ายลากปรับขนาด): `--sidebar-w`, `data-sidebar-rail` when folded, saved in a cookie so the next page draws it the same.
 */
export function ShellFrame({ navigation, sidebar, children }: { navigation: NavigationItem[]; sidebar?: SidebarWidth; children: React.ReactNode }) {
  const [width, setWidth] = useState<SidebarWidth>(sidebar ?? { width: SIDEBAR_DEFAULT, lastWide: SIDEBAR_DEFAULT });
  function change(next: SidebarWidth) {
    setWidth(next);
    document.cookie = `${SIDEBAR_COOKIE}=${serializeSidebarCookie(next)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }
  const style = { '--sidebar-w': `${width.width}px` } as React.CSSProperties;
  return <div className="app-shell" data-module={matchModule(usePathname(), navigation)} data-sidebar-rail={isSidebarRail(width.width) ? '' : undefined} style={style}>
    {children}
    <SidebarEdge state={width} onChange={change} />
  </div>;
}
