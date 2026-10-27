import { t, type MessageKey } from '@backoffice/i18n';
import { ProfileMenu, type BellItem, type ShellProfile } from './profile-menu';
import { ShellFrame } from './shell-frame';
import { SidebarNav } from './sidebar-nav';
import { SignOutButton } from './sign-out-button';

export interface NavigationItem { href: string; label: MessageKey; badge?: number; module?: string; }
const noProfile: ShellProfile = { displayName: null, positionTitle: null, photoUrl: null };
export function AppShell({ navigation, profile = noProfile, bell = { unread: 0, items: [] }, children }: { navigation: NavigationItem[]; profile?: ShellProfile; bell?: { unread: number; items: BellItem[] }; children: React.ReactNode }) {
  return <ShellFrame navigation={navigation}>
    <aside className="sidebar">
      <div className="brand-block"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg></span><div><p className="brand">{t('hospitalName')}</p><h1>{t('appName')}</h1></div></div>
      <SidebarNav items={navigation} />
      <SignOutButton />
    </aside>
    <main className="app-main"><div className="app-topbar"><p className="permission-notice">{t('permissionNotice')}</p><ProfileMenu profile={profile} unread={bell.unread} items={bell.items} /></div>{children}</main>
  </ShellFrame>;
}
