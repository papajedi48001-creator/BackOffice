'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@backoffice/i18n';
import type { SubmitIconName } from '../lib/modules';
import { matchModule } from '../lib/module-theme';
import type { NavigationItem } from './app-shell';

const glyphs: Record<SubmitIconName, React.ReactNode> = {
  // calendar with a plus
  leave: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 13v6M9 16h6"/></>,
  // briefcase
  travel: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18M11 13v2h2v-2"/></>,
  car: <><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H8.3a2 2 0 0 0-1.6.8L4 10l-1.5.6C1.7 10.9 1 11.6 1 12.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></>,
  // door with a check
  room: <><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M2 21h20"/><path d="M12 12h.01"/><path d="m16 8 2 2 4-4"/></>
};

/** The current module's ยื่นคำขอ action, at the top of every page of the module; hidden on the form it opens. */
export function RequestAction({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname();
  const code = matchModule(pathname, navigation);
  const action = navigation.find((item) => item.module === code)?.submitAction;
  if (!action || pathname === action.href || pathname.startsWith(`${action.href}/`)) return null;
  return <Link className="request-action" href={action.href}>
    <span className="request-action-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyphs[action.icon]}</svg></span>
    <span className="request-action-label">{t(action.label)}</span>
  </Link>;
}
