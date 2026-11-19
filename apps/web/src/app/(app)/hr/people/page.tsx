import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory, canManagePeople } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { readSession } from '../../../../lib/session';
import { PeopleTable } from '../../../../components/people-table';
import { RouteDialog } from '../../../../components/route-dialog';
import { PersonEditor } from './[personId]/person-editor';

export default async function PeoplePage({ searchParams }: { searchParams?: Promise<{ edit?: string | string[] }> } = {}) {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const scope = new AuthorizationService().organizationScope(session, 'hr.person.read');
  if (scope !== 'all' && scope.length === 0) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const people = await new HrDirectory(database).listPeople({ organizationIds: scope });
  const addPerson = canManagePeople(session) ? <Link className="button-link" href="/hr/people/new">{t('hrAddPerson')}</Link> : null;
  if (people.length === 0) return <section><div className="page-heading"><h2>{t('peopleTitle')}</h2>{addPerson ? <nav className="page-actions">{addPerson}</nav> : null}</div><p>{t('noPeople')}</p></section>;
  // ปุ่มดินสอ: `?edit=<id>` opens that person's editor in a popup over the list; the editor checks access as the person page does.
  const editId = (await searchParams)?.edit;
  const editor = typeof editId === 'string' && editId !== '' ? await PersonEditor({ personId: editId, session, inDialog: true }) : null;
  return (
    <section>
      <PeopleTable people={people} actions={addPerson} canExport={new AuthorizationService().canActHospitalWide(session, 'data.export', 'hr')} />
      {editor && typeof editor === 'object' ? <RouteDialog title={`${t('hrEditPerson')} ${editor.title}`} closeHref="/hr/people">{editor.body}</RouteDialog> : null}
    </section>
  );
}
