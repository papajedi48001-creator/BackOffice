import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ModuleSubnav } from './module-subnav';
import { collectSectionBadges } from '../lib/dashboard-badges';
import { getSharedDatabase } from '../lib/database';
import { readDisabledModules } from '../lib/module-gate';
import { availableSections, moduleSections, type ModuleSection } from '../lib/modules';
import { readSession } from '../lib/session';

async function readSignedIn() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated) redirect('/');
  return session;
}

async function visibleSections(code: string, session: Awaited<ReturnType<typeof readSignedIn>>): Promise<ModuleSection[]> {
  const sections = moduleSections(code, session);
  const database = getSharedDatabase();
  return database ? availableSections(sections, database, session) : sections;
}

/** Wraps every page of a module with its section bar. */
export async function ModuleLayout({ code, children }: { code: string; children: React.ReactNode }) {
  const session = await readSignedIn();
  const sections = await visibleSections(code, session);
  const database = getSharedDatabase();
  // The proxy already refuses a switched-off module; this keeps its pages closed if a path ever slips past the matcher.
  if (database && code !== 'admin' && (await readDisabledModules(database)).includes(code)) return <ModuleDisabledNotice />;
  const badges = database && session.personId ? await collectSectionBadges(sections, database, session) : {};
  return <><ModuleSubnav sections={sections.map(({ href, labelKey }) => ({ href, labelKey, ...(badges[href] === undefined ? {} : { badge: badges[href] }) }))} />{children}</>;
}

/** The module's own path opens its first section the person can see. */
export async function ModuleIndex({ code }: { code: string }) {
  const [first] = await visibleSections(code, await readSignedIn());
  if (first) redirect(first.href);
  return <section><p role="alert">{t('hrNoAccess')}</p></section>;
}

export function ModuleDisabledNotice() {
  return <section><h2>{t('adminModuleDisabledTitle')}</h2><p role="alert">{t('adminModuleDisabledCopy')}</p></section>;
}
