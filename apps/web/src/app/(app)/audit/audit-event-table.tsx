import { t } from '@backoffice/i18n';

export type AuditEventRow = {
  createdAt: string;
  action: 'workflow.request.submitted' | 'workflow.request.decided';
  result: 'SUCCESS' | 'APPROVE' | 'REJECT' | 'RETURN';
  requestReference: string | null;
};

const actionLabels: Record<AuditEventRow['action'], string> = {
  'workflow.request.submitted': t('auditRequestSubmitted'),
  'workflow.request.decided': t('auditRequestDecided')
};

const resultLabels: Record<AuditEventRow['result'], string> = {
  SUCCESS: t('auditResultSuccess'),
  APPROVE: t('auditResultApproved'),
  REJECT: t('auditResultRejected'),
  RETURN: t('auditResultReturned')
};

export function AuditEventTable({ events }: { events: AuditEventRow[] }) {
  if (!events.length) return <p>{t('noAuditData')}</p>;
  return <table><thead><tr><th>{t('auditTime')}</th><th>{t('auditAction')}</th><th>{t('requestReference')}</th><th>{t('auditResult')}</th></tr></thead><tbody>{events.map((event) => <tr key={`${event.createdAt}-${event.action}-${event.requestReference ?? 'unknown'}`}><td>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(event.createdAt))}</td><td>{actionLabels[event.action]}</td><td>{event.requestReference ?? t('unknownRequest')}</td><td>{resultLabels[event.result]}</td></tr>)}</tbody></table>;
}
