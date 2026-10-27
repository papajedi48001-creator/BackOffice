import type { Database } from '@backoffice/db';
import { notificationTarget } from './module-notification';

export interface PendingApproval { requestId: string; reference: string; moduleCode: string; requestorName: string | null; submittedAt: string; href: string; }

// A request waits on a person only when its lowest-numbered pending step is theirs; sequence is stored as text. The dashboard count uses the same rule.
export const waitingOnPersonSql = `r.status = 'IN_REVIEW'
    AND JSON_VALUE(s.assignee_snapshot, '$.personId') = ?
    AND NOT EXISTS (SELECT 1 FROM approval_step earlier WHERE earlier.request_id = r.id AND earlier.status = 'PENDING' AND CAST(earlier.sequence AS UNSIGNED) < CAST(s.sequence AS UNSIGNED))`;

/** The page a คำขอ opens on: a ใบลา on its leave page, anything else in คำขอ. */
export function requestHref(moduleCode: string, requestId: string): string {
  return notificationTarget(moduleCode, requestId).targetPath ?? `/requests/${requestId}`;
}

export async function listPendingApprovals(db: Pick<Database, 'query'>, personId: string): Promise<PendingApproval[]> {
  const rows = await db.query<Omit<PendingApproval, 'href'>>(`SELECT r.id AS requestId, r.reference, r.module_code AS moduleCode, p.display_name AS requestorName,
      DATE_FORMAT(COALESCE(r.submitted_at, r.created_at), '%Y-%m-%dT%H:%i:%s.000Z') AS submittedAt
    FROM request r
    JOIN approval_step s ON s.request_id = r.id AND s.status = 'PENDING'
    LEFT JOIN person p ON p.id = r.requestor_person_id
    WHERE ${waitingOnPersonSql}
    ORDER BY COALESCE(r.submitted_at, r.created_at), r.id`, [personId]);
  return rows.map((row) => ({ ...row, href: requestHref(row.moduleCode, row.requestId) }));
}

/** Whether the คำขอ menu has anything left to show: a request of theirs still open, or a step waiting on them now. */
export async function hasOpenRequestWork(db: Pick<Database, 'query'>, personId: string): Promise<boolean> {
  const rows = await db.query<{ found: number }>(`SELECT EXISTS (SELECT 1 FROM request WHERE requestor_person_id = ? AND status IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED'))
      OR EXISTS (SELECT 1 FROM request r JOIN approval_step s ON s.request_id = r.id AND s.status = 'PENDING' WHERE ${waitingOnPersonSql}) AS found`, [personId, personId]);
  return Number(rows[0]?.found ?? 0) === 1;
}
