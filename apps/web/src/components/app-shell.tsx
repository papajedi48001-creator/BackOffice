import { t, type MessageKey } from '@backoffice/i18n';
import { SidebarNav } from './sidebar-nav';
import { SignOutButton } from './sign-out-button';

export interface NavigationItem { href: string; label: MessageKey; badge?: number; }
export function AppShell({ navigation, children }: { navigation: NavigationItem[]; children: React.ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><p className="brand">{t('hospitalName')}</p><h1>{t('appName')}</h1><SidebarNav items={navigation} /><SignOutButton /></aside><main className="app-main"><p className="permission-notice">{t('permissionNotice')}</p>{children}</main></div>;
}
