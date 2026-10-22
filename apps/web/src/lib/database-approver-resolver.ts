import { CommandChainService, type ApproverResolver } from '@backoffice/core';
import type { CommandChainTarget } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export class DatabaseApproverResolver implements ApproverResolver {
  constructor(private readonly database: Pick<Database, 'query'>) {}
  async resolve(input: { moduleCode: string; requestorPersonId: string; organizationId: string; target?: CommandChainTarget }) {
    const chain = await new CommandChainService(this.database).resolve({ requestorPersonId: input.requestorPersonId, organizationId: input.organizationId, target: input.target ?? 'NEAREST_HEAD' });
    if (chain.approvers.length > 0) return chain.approvers;
    // Until HR has named every unit head, the direct manager from the employment record keeps requests routable.
    const rows = await this.database.query<{ personId: string; organizationId: string }>('SELECT manager_person_id AS personId, organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND organization_id = ? AND effective_until IS NULL AND manager_person_id IS NOT NULL LIMIT 1', [input.requestorPersonId, input.organizationId]);
    return rows;
  }
}
