import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell, type NavigationItem } from '../../components/app-shell';
import { readSession } from '../../lib/session';
import { readRuntimeValue } from '../../lib/runtime-env';
import { navigationFor } from '../../lib/modules';
import { openDatabase, readUnreadNotifications } from '../../lib/unread-notifications';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  const unreadNotifications = databaseUrl && session.personId ? await readUnreadNotifications(session.personId, openDatabase(databaseUrl)) : undefined;
  const navigation: NavigationItem[] = navigationFor(session).map((item) => item.href === '/notifications' ? { ...item, badge: unreadNotifications } : item);
  return <AppShell navigation={navigation}>{children}</AppShell>;
}
