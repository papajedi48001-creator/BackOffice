import Link from 'next/link';
import type { LeaveListItem } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatLeaveRange, leaveKindLabel, leaveStatusLabel } from '../../../lib/leave-labels';

export function LeaveStatus({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase()}`}>{leaveStatusLabel(status)}</span>;
}

/** ใบลา and ขอยกเลิกวันลา in one table; `showPerson` adds who and which unit for approvers and HR. */
export function LeaveTable({ items, showPerson = false }: { items: LeaveListItem[]; showPerson?: boolean }) {
  return <div className="leave-table-scroll"><table>
    <thead><tr><th>{t('requestReference')}</th>{showPerson && <th>{t('leavePerson')}</th>}<th>{t('leaveType')}</th><th>{t('leaveDates')}</th><th>{t('leaveDays')}</th><th>{t('status')}</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.requestId}>
      <td><Link href={`/leave/requests/${item.requestId}`}>{item.reference}</Link>{item.kind === 'CANCEL_DAYS' && <><br /><span className="leave-kind">{leaveKindLabel(item.kind)}</span></>}</td>
      {showPerson && <td>{[item.personDisplayName, item.organizationName].filter(Boolean).join(' · ')}</td>}
      <td>{item.leaveTypeName}</td>
      <td>{formatLeaveRange(item)}</td>
      <td>{item.days}</td>
      <td><LeaveStatus status={item.status} /></td>
    </tr>)}</tbody>
  </table></div>;
}
