import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HrProfileService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { HrProfileView } from '../../../../components/hr-profile-view';
import { attachmentsEnabled } from '../../../../lib/attachments';
import { getSharedDatabase } from '../../../../lib/database';
import { profilePhotoUrl } from '../../../../lib/profile-photo';
import { readSession } from '../../../../lib/session';

export default async function MyProfilePage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const database = getSharedDatabase();
  const view = database ? await new HrProfileService(database).get(session.personId, session) : null;
  const uploadsEnabled = attachmentsEnabled();
  if (!view || typeof view === 'string') return <section><h2>{t('hrMyProfile')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  return <section>
    <h2>{t('hrMyProfile')}</h2>
    <HrProfileView view={view} contactEndpoint="/api/hr/me/contact" personalEndpoint="/api/hr/me/personal" photo={{ url: uploadsEnabled && view.work.photoAttachmentId ? profilePhotoUrl(view.work.personId, view.work.photoAttachmentId) : null, uploadsEnabled }} />
  </section>;
}
