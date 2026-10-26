'use client';

import { usePathname } from 'next/navigation';
import { matchModule } from '../lib/module-theme';
import type { NavigationItem } from './app-shell';

/** Sets data-module on the shell so the page takes its module's colour. */
export function ShellFrame({ navigation, children }: { navigation: NavigationItem[]; children: React.ReactNode }) {
  return <div className="app-shell" data-module={matchModule(usePathname(), navigation)}>{children}</div>;
}
