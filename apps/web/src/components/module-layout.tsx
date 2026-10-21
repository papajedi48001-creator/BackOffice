import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ModuleSubnav } from './module-subnav';
import { moduleSections, type ModuleSection } from '../lib/modules';
import { readSession } from '../lib/session';

async function visibleSections(code: string): Promise<ModuleSection[]> {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated) redirect('/');
  return moduleSections(code, session);
}

/** Wraps every page of a module with its section bar. */
export async function ModuleLayout({ code, children }: { code: string; children: React.ReactNode }) {
  const sections = await visibleSections(code);
  return <><ModuleSubnav sections={sections.map(({ href, labelKey }) => ({ href, labelKey }))} />{children}</>;
}

/** The module's own path opens its first section the person can see. */
export async function ModuleIndex({ code }: { code: string }) {
  const [first] = await visibleSections(code);
  if (first) redirect(first.href);
  return <section><p role="alert">{t('hrNoAccess')}</p></section>;
}
