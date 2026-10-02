import { t } from '@backoffice/i18n';

export type RequestDisplayStatus = 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETURNED';

const statusLabel = { IN_REVIEW: 'pending', APPROVED: 'approved', REJECTED: 'rejected', RETURNED: 'returned' } as const;

export function StatusBadge({ status }: { status: RequestDisplayStatus }) { return <span className={`status status-${status.toLowerCase()}`}>{t(statusLabel[status])}</span>; }
