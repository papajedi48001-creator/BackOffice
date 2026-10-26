import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadDashboardSummary } from '@backoffice/core';
import { createDatabase } from '@backoffice/db';
import { ModuleLauncher, type LauncherSummary } from '../../../components/module-launcher';
import { collectBadges } from '../../../lib/dashboard-badges';
import { availableModules, visibleModules } from '../../../lib/modules';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { readSession } from '../../../lib/session';

export default async function DashboardPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated) redirect('/');
  let modules = visibleModules(session);
  let summary: LauncherSummary = { displayName: null, greetingName: null, organizationName: null, pendingApprovals: null, unreadNotifications: null };
  let badges: Record<string, number | undefined> = {};
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (databaseUrl && session.personId) {
    let database: ReturnType<typeof createDatabase> | undefined;
    try {
      database = createDatabase(databaseUrl);
      modules = await availableModules(modules, database, session);
      [summary, badges] = await Promise.all([loadDashboardSummary(database, session.personId), collectBadges(modules, database, session)]);
    } catch (error) {
      console.error('dashboard_summary_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    } finally { await database?.close().catch(() => undefined); }
  }
  return <ModuleLauncher modules={modules} badges={badges} summary={summary} today={new Date()} />;
}
