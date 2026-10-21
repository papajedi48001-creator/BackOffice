import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell, type NavigationItem } from '../../components/app-shell';
import { readSession } from '../../lib/session';
import { createDatabase } from '@backoffice/db';
import { readRuntimeValue } from '../../lib/runtime-env';
import { navigationFor } from '../../lib/modules';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  let unreadNotifications = 0;
  if (databaseUrl && session.personId) {
    const database = createDatabase(databaseUrl);
    try {
      const count = (await database.query<{ unreadCount: number }>('SELECT COUNT(*) AS unreadCount FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [session.personId, 'in_app']))[0];
      unreadNotifications = Number(count?.unreadCount ?? 0);
    } finally { await database.close(); }
  }
  const navigation: NavigationItem[] = navigationFor(session).map((item) => item.href === '/notifications' ? { ...item, badge: unreadNotifications } : item);
  return <AppShell navigation={navigation}>{children}</AppShell>;
}
