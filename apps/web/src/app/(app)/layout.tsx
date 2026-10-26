import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { getSharedDatabase } from '../../lib/database';
import { navigationFor } from '../../lib/modules';
import { readSession } from '../../lib/session';
import { loadShellData, type ShellData } from '../../lib/shell-data';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  const database = getSharedDatabase();
  const shell: ShellData = database && session.personId ? await loadShellData(database, session) : { navigation: navigationFor(session), bell: { unread: 0, items: [] } };
  return <AppShell navigation={shell.navigation} bell={shell.bell}>{children}</AppShell>;
}
