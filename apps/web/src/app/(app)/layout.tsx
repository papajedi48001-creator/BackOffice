import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { getSharedDatabase } from '../../lib/database';
import { navigationFor } from '../../lib/modules';
import { roleChoiceName } from '../../lib/role-choice-labels';
import { readSession } from '../../lib/session';
import { emptyProfile, loadShellData, noChat, type ShellData } from '../../lib/shell-data';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  // The proxy already sends a pending choice to the picker; this keeps the pages safe if it is bypassed.
  if (session.roleSelectionRequired) redirect('/choose-role');
  const role = session.activeRole && (session.roleChoices?.length ?? 0) > 0 ? { name: roleChoiceName(session.activeRole), canSwitch: (session.roleChoices?.length ?? 0) > 1 } : null;
  const database = getSharedDatabase();
  const shell: ShellData = database && session.personId ? await loadShellData(database, session) : { navigation: navigationFor(session), profile: emptyProfile, bell: { unread: 0, items: [] }, chat: noChat(session) };
  return <AppShell navigation={shell.navigation} profile={shell.profile} bell={shell.bell} chat={shell.chat} role={role}>{children}</AppShell>;
}
