import Link from 'next/link';
import type { TravelListItem } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatLeaveRange } from '../../../lib/leave-labels';
import { travelReportStatusLabel, travelTypeLabel } from '../../../lib/travel-labels';
import { LeaveStatus } from '../leave/leave-list';

/** Trips in one table; `showLeader` adds the หัวหน้าคณะ and head count for HR. */
export function TravelTable({ items, showLeader = false }: { items: TravelListItem[]; showLeader?: boolean }) {
  return <div className="leave-table-scroll"><table>
    <thead><tr><th>{t('travelSubject')}</th>{showLeader && <th>{t('travelLeader')}</th>}<th>{t('travelPlace')}</th><th>{t('travelType')}</th><th>{t('travelDates')}</th><th>{t('travelDays')}</th><th>{t('status')}</th><th>{t('travelReportStatus')}</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.travelId}>
      <td><Link href={`/travel/${item.travelId}`}>{item.subject}</Link></td>
      {showLeader && <td>{item.leaderDisplayName ?? '—'} · {item.memberCount} {t('travelPeopleUnit')}</td>}
      <td>{item.place} · {item.province}</td>
      <td>{travelTypeLabel(item.travelType)}</td>
      <td>{formatLeaveRange(item)}</td>
      <td>{item.days}</td>
      <td><LeaveStatus status={item.status} /></td>
      <td>{travelReportStatusLabel(item.reportStatus)}</td>
    </tr>)}</tbody>
  </table></div>;
}
