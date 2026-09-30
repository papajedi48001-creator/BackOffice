import { t } from '@backoffice/i18n';

export function StatusBadge({ status }: { status: 'PENDING' | 'APPROVED' }) { return <span className={`status status-${status.toLowerCase()}`}>{t(status === 'PENDING' ? 'pending' : 'approved')}</span>; }
