import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell, type NavigationItem } from '../../components/app-shell';
import { readSession } from '../../lib/session';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  const roleNames = new Set(session.roles.map((role) => role.name));
  const navigation: NavigationItem[] = [{ href: '/dashboard', label: 'dashboard' }, { href: '/requests', label: 'requests' }, { href: '/audit', label: 'audit' }];
  if (roleNames.has('hr-reader') || roleNames.has('hr-manager')) navigation.splice(1, 0, { href: '/hr/people', label: 'people' }, { href: '/hr/organizations', label: 'organizations' });
  if (roleNames.has('hr-manager')) navigation.push({ href: '/access/roles', label: 'roles' }, { href: '/access/delegations', label: 'delegations' });
  return <AppShell navigation={navigation}>{children}</AppShell>;
}
