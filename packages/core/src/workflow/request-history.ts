import type { ApprovalStep } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export type RequestHistoryKind = 'APPROVE' | 'REJECT' | 'RETURN' | 'CANCEL';

export interface RequestHistoryView {
  requestorName: string;
  organizationName: string;
  steps: Array<{ sequence: number; assigneePersonId: string; status: ApprovalStep['status'] }>;
  entries: Array<{ at: string; actorName: string; kind: RequestHistoryKind; reason: string | null }>;
}

const personName = (alias: string) => `COALESCE(${alias}.display_name, ${alias}.employee_code, 'ไม่ระบุ')`;

export class RequestHistory {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async load(requestId: string): Promise<RequestHistoryView | null> {
    const [request] = await this.database.query<{ requestorName: string; organizationName: string }>(
      `SELECT ${personName('requestor')} AS requestorName, COALESCE(organization.name, 'ไม่ระบุ') AS organizationName
       FROM request
       JOIN person requestor ON requestor.id = request.requestor_person_id
       LEFT JOIN organization ON organization.id = JSON_VALUE(request.organization_snapshot, '$.organizationId')
       WHERE request.id = ?`,
      [requestId]
    );
    if (!request) return null;
    const steps = await this.database.query<{ sequence: number | string; assigneePersonId: string; status: ApprovalStep['status'] }>(
      `SELECT CAST(sequence AS UNSIGNED) AS sequence, JSON_VALUE(assignee_snapshot, '$.personId') AS assigneePersonId, status
       FROM approval_step WHERE request_id = ? ORDER BY CAST(sequence AS UNSIGNED)`,
      [requestId]
    );
    const entries = await this.database.query<{ at: string; actorName: string; kind: RequestHistoryKind; reason: string | null }>(
      `SELECT at, actorName, kind, reason FROM (
         SELECT decision.created_at AS createdAt, DATE_FORMAT(decision.created_at, '%Y-%m-%dT%H:%i:%sZ') AS at, ${personName('actor')} AS actorName, decision.decision AS kind, decision.reason AS reason
         FROM approval_decision decision
         JOIN approval_step step ON step.id = decision.approval_step_id
         JOIN person actor ON actor.id = decision.actor_person_id
         WHERE step.request_id = ?
         UNION ALL
         SELECT cancellation.created_at, DATE_FORMAT(cancellation.created_at, '%Y-%m-%dT%H:%i:%sZ'), ${personName('actor')}, 'CANCEL', cancellation.reason
         FROM request_cancellation cancellation
         JOIN person actor ON actor.id = cancellation.actor_person_id
         WHERE cancellation.request_id = ?
       ) history ORDER BY createdAt`,
      [requestId, requestId]
    );
    return {
      requestorName: request.requestorName,
      organizationName: request.organizationName,
      steps: steps.map((step) => ({ sequence: Number(step.sequence), assigneePersonId: step.assigneePersonId, status: step.status })),
      entries: entries.map((entry) => ({ at: entry.at, actorName: entry.actorName, kind: entry.kind, reason: entry.reason }))
    };
  }
}
