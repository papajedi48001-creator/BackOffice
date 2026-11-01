import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ModuleSubnav } from './module-subnav';
import { collectSectionBadges } from '../lib/dashboard-badges';
import { getSharedDatabase } from '../lib/database';
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
  const badges = database && session.personId ? await collectSectionBadges(sections, database, session) : {};
  return <><ModuleSubnav sections={sections.map(({ href, labelKey }) => ({ href, labelKey, ...(badges[href] === undefined ? {} : { badge: badges[href] }) }))} />{children}</>;
}

/** The module's own path opens its first section the person can see. */
export async function ModuleIndex({ code }: { code: string }) {
  const [first] = await visibleSections(code, await readSignedIn());
  if (first) redirect(first.href);
  return <section><p role="alert">{t('hrNoAccess')}</p></section>;
}
