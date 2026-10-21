import type { ApproverResolver } from '@backoffice/core';
import type { Database } from '@backoffice/db';

export class DatabaseApproverResolver implements ApproverResolver {
  constructor(private readonly database: Pick<Database, 'query'>) {}
  async resolve(input: { moduleCode: string; requestorPersonId: string; organizationId: string }) {
    const rows = await this.database.query<{ personId: string; organizationId: string }>('SELECT manager_person_id AS personId, organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND organization_id = ? AND effective_until IS NULL AND manager_person_id IS NOT NULL LIMIT 1', [input.requestorPersonId, input.organizationId]);
    return rows;
  }
}
