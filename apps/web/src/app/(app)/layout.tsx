import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { getSharedDatabase } from '../../lib/database';
import { navigationFor } from '../../lib/modules';
import { readSession } from '../../lib/session';
import { shellRole } from '../../lib/shell-role';
import { emptyProfile, loadShellData, noChat, type ShellData } from '../../lib/shell-data';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await readSession(new Request('http://localhost', { headers: requestHeaders }));
  if (!session?.authenticated) redirect('/');
  // The proxy already sends a pending choice to the picker; this keeps the pages safe if it is bypassed.
  if (session.roleSelectionRequired) redirect('/choose-role');
  const role = shellRole(session);
  const database = getSharedDatabase();
  const shell: ShellData = database && session.personId ? await loadShellData(database, session) : { navigation: navigationFor(session), profile: emptyProfile, bell: { unread: 0, items: [] }, chat: noChat(session) };
  // Module colours chosen on ตั้งค่าโปรแกรม: palette-only CSS (appearanceCss), placed after the stylesheet so it wins.
  return <>
    {shell.accentCss ? <style>{shell.accentCss}</style> : null}
    <AppShell navigation={shell.navigation} profile={shell.profile} bell={shell.bell} chat={shell.chat} role={role}>{children}</AppShell>
  </>;
}
