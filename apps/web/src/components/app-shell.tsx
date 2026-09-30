import Link from 'next/link';
import { t, type MessageKey } from '@backoffice/i18n';

export interface NavigationItem { href: string; label: MessageKey; }
export function AppShell({ navigation, children }: { navigation: NavigationItem[]; children: React.ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><p className="brand">{t('hospitalName')}</p><h1>{t('appName')}</h1><nav aria-label={t('appName')}><ul>{navigation.map((item) => <li key={item.href}><Link href={item.href}>{t(item.label)}</Link></li>)}</ul></nav></aside><main className="app-main"><p className="permission-notice">{t('permissionNotice')}</p>{children}</main></div>;
}
