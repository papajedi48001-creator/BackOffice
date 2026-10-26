import { LeaveSettingsService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { leaveSession } from '../leave-page';
import { LeaveForm } from './leave-form';

export default async function NewLeavePage() {
  const session = await leaveSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('leaveNew')}</h2><p role="alert">{t('leaveLoadError')}</p></section>;
  const types = await new LeaveSettingsService(database).listTypes({ activeOnly: true });
  return <section>
    <h2>{t('leaveNew')}</h2>
    <LeaveForm types={types.map(({ id, code, name, counting }) => ({ id, code, name, counting }))} />
  </section>;
}
