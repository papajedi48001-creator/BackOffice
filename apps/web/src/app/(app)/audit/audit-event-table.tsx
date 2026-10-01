import { t } from '@backoffice/i18n';

export type AuditEventRow = {
  createdAt: string;
  action: 'workflow.request.submitted' | 'workflow.request.decided';
  result: 'SUCCESS' | 'APPROVE' | 'REJECT' | 'RETURN';
  requestReference: string | null;
};

const actionLabels: Record<AuditEventRow['action'], string> = {
  'workflow.request.submitted': 'สร้างคำขอ',
  'workflow.request.decided': 'อนุมัติคำขอ'
};

const resultLabels: Record<AuditEventRow['result'], string> = {
  SUCCESS: 'สำเร็จ',
  APPROVE: 'อนุมัติแล้ว',
  REJECT: 'ไม่อนุมัติ',
  RETURN: 'ส่งกลับแก้ไข'
};

export function AuditEventTable({ events }: { events: AuditEventRow[] }) {
  if (!events.length) return <p>{t('noAuditData')}</p>;
  return <table><thead><tr><th>{t('auditTime')}</th><th>{t('auditAction')}</th><th>{t('requestReference')}</th><th>{t('auditResult')}</th></tr></thead><tbody>{events.map((event) => <tr key={`${event.createdAt}-${event.action}-${event.requestReference ?? 'unknown'}`}><td>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(event.createdAt))}</td><td>{actionLabels[event.action]}</td><td>{event.requestReference ?? t('unknownRequest')}</td><td>{resultLabels[event.result]}</td></tr>)}</tbody></table>;
}
