import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createDatabase } from '@backoffice/db';
import { t } from '@backoffice/i18n';
import { readRuntimeValue } from '../../../lib/runtime-env';
import { readSession } from '../../../lib/session';
import { AuditEventTable, type AuditEventRow } from './audit-event-table';

type StoredAuditEventRow = { createdAt: string | Date; action: string; result: string; metadata: string };

const auditActions = new Set<AuditEventRow['action']>(['workflow.request.submitted', 'workflow.request.decided']);
const auditResults = new Set<AuditEventRow['result']>(['SUCCESS', 'APPROVE', 'REJECT', 'RETURN']);

export default async function AuditPage() {
  const session = readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return <section><h2>{t('auditTitle')}</h2><p role="alert">ไม่สามารถอ่านบันทึกการตรวจสอบได้</p></section>;
  const database = createDatabase(databaseUrl);
  try {
    const rows = await database.query<StoredAuditEventRow>('SELECT created_at AS createdAt, action, result, metadata FROM audit_event WHERE actor_person_id = ? ORDER BY created_at DESC, id DESC', [session.personId]);
    return <section><h2>{t('auditTitle')}</h2><AuditEventTable events={rows.map(toAuditEventRow).filter((event): event is AuditEventRow => event !== null)} /></section>;
  } finally {
    await database.close();
  }
}

function toAuditEventRow(row: StoredAuditEventRow): AuditEventRow | null {
  if (!auditActions.has(row.action as AuditEventRow['action']) || !auditResults.has(row.result as AuditEventRow['result'])) return null;
  let requestReference: string | null = null;
  try {
    const metadata = JSON.parse(row.metadata) as { requestReference?: unknown };
    if (typeof metadata.requestReference === 'string') requestReference = metadata.requestReference;
  } catch {
    return null;
  }
  return { createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, action: row.action as AuditEventRow['action'], result: row.result as AuditEventRow['result'], requestReference };
}
