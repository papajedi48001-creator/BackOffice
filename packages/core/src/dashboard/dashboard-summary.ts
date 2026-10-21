import type { Database } from '@backoffice/db';

export interface DashboardSummary { displayName: string | null; organizationName: string | null; pendingApprovals: number; unreadNotifications: number; }

// A request waits on a person only when its lowest-numbered pending step is theirs; sequence is stored as text.
const pendingApprovalsSql = `SELECT COUNT(*) AS total FROM request r
  JOIN approval_step s ON s.request_id = r.id AND s.status = 'PENDING'
  WHERE r.status = 'IN_REVIEW'
    AND JSON_VALUE(s.assignee_snapshot, '$.personId') = ?
    AND NOT EXISTS (SELECT 1 FROM approval_step earlier WHERE earlier.request_id = r.id AND earlier.status = 'PENDING' AND CAST(earlier.sequence AS UNSIGNED) < CAST(s.sequence AS UNSIGNED))`;

const profileSql = `SELECT p.display_name AS displayName, (
    SELECT o.name FROM employment_assignment a JOIN organization o ON o.id = a.organization_id
    WHERE a.person_id = p.id AND a.effective_from <= UTC_TIMESTAMP() AND (a.effective_until IS NULL OR a.effective_until > UTC_TIMESTAMP())
    ORDER BY a.effective_from DESC LIMIT 1
  ) AS organizationName FROM person p WHERE p.id = ?`;

export async function loadDashboardSummary(db: Pick<Database, 'query'>, personId: string): Promise<DashboardSummary> {
  const [profile, pending, unread] = await Promise.all([
    db.query<{ displayName: string | null; organizationName: string | null }>(profileSql, [personId]),
    db.query<{ total: number }>(pendingApprovalsSql, [personId]),
    db.query<{ total: number }>('SELECT COUNT(*) AS total FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [personId, 'in_app'])
  ]);
  return { displayName: profile[0]?.displayName ?? null, organizationName: profile[0]?.organizationName ?? null, pendingApprovals: Number(pending[0]?.total ?? 0), unreadNotifications: Number(unread[0]?.total ?? 0) };
}
