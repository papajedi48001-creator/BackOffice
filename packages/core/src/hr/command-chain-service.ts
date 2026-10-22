import type { CommandChainTarget, OrganizationUnitType } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { resolveCommandChain, type ChainUnit, type CommandChain } from './command-chain';
import { toMariaDbDatetime } from './master-data-import';

interface UnitRow { id: string; parentId: string | null; unitType: OrganizationUnitType | null; headPersonId: string | null; headStatus: string | null; }

export class CommandChainService {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async resolve(input: { requestorPersonId: string; organizationId: string; target: CommandChainTarget; at?: Date }): Promise<CommandChain> {
    const at = toMariaDbDatetime(input.at ?? new Date());
    const rows = await this.database.query<UnitRow>(
      `SELECT o.id, o.parent_id AS parentId, o.unit_type AS unitType, h.person_id AS headPersonId, p.employment_status AS headStatus
       FROM organization o
       LEFT JOIN hr_organization_head h ON h.organization_id = o.id AND h.effective_from <= ? AND (h.effective_until IS NULL OR h.effective_until > ?)
       LEFT JOIN person p ON p.id = h.person_id`,
      [at, at]
    );
    const units = new Map<string, ChainUnit>(rows.map((row) => [row.id, { id: row.id, parentId: row.parentId, unitType: row.unitType, head: row.headPersonId ? { personId: row.headPersonId, active: row.headStatus === 'ACTIVE' } : null }]));
    return resolveCommandChain({ units, organizationId: input.organizationId, requestorPersonId: input.requestorPersonId, target: input.target });
  }
}
