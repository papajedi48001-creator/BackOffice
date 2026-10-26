import Link from 'next/link';
import { OfficialTravelQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { formatLeaveRange } from '../../../../lib/leave-labels';
import { travelTypeLabel } from '../../../../lib/travel-labels';
import { travelSession } from '../travel-page';

/** One row per person waiting on me; the decision is made on the trip page, where every person and step shows. */
export default async function TravelApprovalsPage() {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('travelApprovals')}</h2><p role="alert">{t('travelLoadError')}</p></section>;
  const pending = await new OfficialTravelQueries(database).pendingForApprover(session.personId);
  return <section>
    <h2>{t('travelApprovals')}</h2>
    {pending.length === 0 ? <p>{t('travelNoPending')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('travelMembers')}</th><th>{t('travelSubject')}</th><th>{t('travelPlace')}</th><th>{t('travelType')}</th><th>{t('travelDates')}</th><th>{t('travelDays')}</th></tr></thead>
      <tbody>{pending.map((item) => <tr key={item.requestId}>
        <td>{[item.personDisplayName, item.organizationName].filter(Boolean).join(' · ')}</td>
        <td><Link href={`/travel/${item.travelId}`}>{item.subject}</Link></td>
        <td>{item.place}</td>
        <td>{travelTypeLabel(item.travelType)}</td>
        <td>{formatLeaveRange(item)}</td>
        <td>{item.days}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
