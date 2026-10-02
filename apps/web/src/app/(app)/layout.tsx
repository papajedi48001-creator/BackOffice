import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell, type NavigationItem } from '../../components/app-shell';
import { readSession } from '../../lib/session';
import { createDatabase } from '@backoffice/db';
import { readRuntimeValue } from '../../lib/runtime-env';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  const roleNames = new Set(session.roles.map((role) => role.name));
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  let unreadNotifications = 0;
  if (databaseUrl && session.personId) {
    const database = createDatabase(databaseUrl);
    try {
      const count = (await database.query<{ unreadCount: number }>('SELECT COUNT(*) AS unreadCount FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [session.personId, 'in_app']))[0];
      unreadNotifications = Number(count?.unreadCount ?? 0);
    } finally { await database.close(); }
  }
  const navigation: NavigationItem[] = [{ href: '/dashboard', label: 'dashboard' }, { href: '/requests', label: 'requests' }, { href: '/notifications', label: 'notifications', badge: unreadNotifications }, { href: '/audit', label: 'audit' }];
  if (roleNames.has('hr-reader') || roleNames.has('hr-manager')) navigation.splice(1, 0, { href: '/hr/people', label: 'people' }, { href: '/hr/organizations', label: 'organizations' });
  if (roleNames.has('hr-manager')) navigation.push({ href: '/access/roles', label: 'roles' }, { href: '/access/delegations', label: 'delegations' });
  return <AppShell navigation={navigation}>{children}</AppShell>;
}
