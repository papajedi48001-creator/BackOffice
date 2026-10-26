import { LeaveQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { leaveSession } from '../leave-page';
import { BulkApprove } from './bulk-approve';

export default async function LeaveApprovalsPage() {
  const session = await leaveSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('leaveApprovals')}</h2><p role="alert">{t('leaveLoadError')}</p></section>;
  const pending = await new LeaveQueries(database).pendingForApprover(session.personId);
  return <section>
    <h2>{t('leaveApprovals')}</h2>
    {pending.length === 0 ? <p>{t('leaveNoPending')}</p> : <BulkApprove items={pending} />}
  </section>;
}
