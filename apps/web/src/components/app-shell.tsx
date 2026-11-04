import { t, type MessageKey } from '@backoffice/i18n';
import type { SubmitAction } from '../lib/modules';
import { ProfileMenu, type BellItem, type ShellProfile } from './profile-menu';
import { BrandLogo } from './brand-logo';
import { ShellFrame } from './shell-frame';
import { SidebarNav } from './sidebar-nav';
import { SignOutButton } from './sign-out-button';
import { RequestAction } from './request-action';
import { SupportChat } from './support-chat';

/** `development`: the module is in DEVELOPMENT mode (ตั้งค่าโปรแกรม), shown with a กำลังพัฒนา marker. */
export interface NavigationItem { href: string; label: MessageKey; badge?: number; module?: string; development?: boolean; submitAction?: SubmitAction; }
const noProfile: ShellProfile = { displayName: null, positionTitle: null, photoUrl: null };
/** `chat`: the แชตกับผู้ดูแลระบบ button; left out (tests, pages without a database), there is no button. */
export function AppShell({ navigation, profile = noProfile, bell = { unread: 0, items: [] }, chat, children }: { navigation: NavigationItem[]; profile?: ShellProfile; bell?: { unread: number; items: BellItem[] }; chat?: { admin: boolean; images: boolean; unread: number }; children: React.ReactNode }) {
  return <ShellFrame navigation={navigation}>
    <aside className="sidebar">
      <div className="brand-block"><BrandLogo size={44} decorative className="brand-mark" /><div><p className="brand">{t('hospitalName')}</p><h1>{t('appName')}</h1></div></div>
      <SidebarNav items={navigation} />
      <SignOutButton />
    </aside>
    <main className="app-main"><div className="app-topbar"><div className="topbar-lead"><RequestAction navigation={navigation} /><p className="permission-notice">{t('permissionNotice')}</p></div><ProfileMenu profile={profile} unread={bell.unread} items={bell.items} /></div>{children}</main>
    {chat ? <SupportChat admin={chat.admin} images={chat.images} unread={chat.unread} /> : null}
  </ShellFrame>;
}
