import type { Database } from '@backoffice/db';

/** One decision a person made on their own request in the admin or manager tier (audit metadata `selfApproval: true`). */
export interface SelfApprovalEntry { createdAt: string; actorDisplayName: string | null; actorRole: string | null; action: string; result: string; reference: string | null; }

const LIMIT = 200;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
}

function referenceOf(metadata: string): string | null {
  try {
    const parsed = JSON.parse(metadata) as { requestReference?: unknown; bookingReference?: unknown; reference?: unknown };
    const found = [parsed.requestReference, parsed.bookingReference, parsed.reference].find((value) => typeof value === 'string');
    return typeof found === 'string' ? found : null;
  } catch { return null; }
}

/** Newest first. For the admin list "อนุมัติคำขอของตนเอง"; the caller checks the viewer is in the admin tier. Never returns a reason. */
export async function listSelfApprovals(database: Pick<Database, 'query'>): Promise<SelfApprovalEntry[]> {
  const rows = await database.query<{ createdAt: Date | string; actorDisplayName: string | null; actorRole: string | null; action: string; result: string; metadata: string }>(
    `SELECT a.created_at AS createdAt, p.display_name AS actorDisplayName, a.actor_role AS actorRole, a.action, a.result, a.metadata
     FROM audit_event a LEFT JOIN person p ON p.id = a.actor_person_id
     WHERE JSON_VALUE(a.metadata, '$.selfApproval') = 'true' ORDER BY a.created_at DESC, a.id DESC LIMIT ${LIMIT}`
  );
  return rows.map((row) => ({ createdAt: toIso(row.createdAt), actorDisplayName: row.actorDisplayName, actorRole: row.actorRole, action: row.action, result: row.result, reference: referenceOf(row.metadata) }));
}
