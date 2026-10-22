import { randomUUID } from 'node:crypto';
import { assignOrganizationHeadInputSchema, setOrganizationUnitTypeInputSchema, type AssignOrganizationHeadInput, type SetOrganizationUnitTypeInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { toMariaDbDatetime } from './master-data-import';

type QueryDatabase = Pick<Database, 'execute' | 'query'>;

export type HeadAssignmentDecision = { kind: 'unchanged' } | { kind: 'assign'; closeCurrentId: string | null } | { kind: 'error'; code: 'EFFECTIVE_FROM_BEFORE_CURRENT' | 'PERSON_NOT_ACTIVE' | 'ORGANIZATION_NOT_FOUND' };

export function decideHeadAssignment(input: { organizationExists: boolean; personStatus: 'ACTIVE' | 'INACTIVE' | null; current: { id: string; personId: string; effectiveFrom: Date } | null; personId: string; effectiveFrom: Date }): HeadAssignmentDecision {
  if (!input.organizationExists) return { kind: 'error', code: 'ORGANIZATION_NOT_FOUND' };
  if (input.personStatus !== 'ACTIVE') return { kind: 'error', code: 'PERSON_NOT_ACTIVE' };
  if (input.current?.personId === input.personId) return { kind: 'unchanged' };
  if (input.current && input.effectiveFrom < input.current.effectiveFrom) return { kind: 'error', code: 'EFFECTIVE_FROM_BEFORE_CURRENT' };
  return { kind: 'assign', closeCurrentId: input.current?.id ?? null };
}

export class OrganizationHeadService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly createId: () => string = randomUUID) {}

  /** Pass an open transaction to assign as part of a larger write, such as a master data import. */
  async assign(input: AssignOrganizationHeadInput, actorPersonId: string, database?: QueryDatabase): Promise<HeadAssignmentDecision> {
    const validInput = assignOrganizationHeadInputSchema.parse(input);
    if (database) return this.assignWithin(database, validInput, actorPersonId);
    return this.database.transaction((transaction) => this.assignWithin(transaction, validInput, actorPersonId), { isolationLevel: 'READ COMMITTED' });
  }

  async setUnitType(input: SetOrganizationUnitTypeInput, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'ORGANIZATION_NOT_FOUND' }> {
    const validInput = setOrganizationUnitTypeInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const found = await database.query('SELECT id FROM organization WHERE id = ? FOR UPDATE', [validInput.organizationId]);
      if (found.length === 0) return { ok: false as const, code: 'ORGANIZATION_NOT_FOUND' as const };
      await database.execute('UPDATE organization SET unit_type = ? WHERE id = ?', [validInput.unitType, validInput.organizationId]);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'hr.organization.type.update', targetType: 'organization', targetId: validInput.organizationId, result: 'SUCCESS', metadata: { organizationId: validInput.organizationId, unitType: validInput.unitType } });
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  private async assignWithin(database: QueryDatabase, input: AssignOrganizationHeadInput, actorPersonId: string): Promise<HeadAssignmentDecision> {
    // Locking the unit serialises head changes, so two assignments cannot both leave a term open.
    const organization = await database.query('SELECT id FROM organization WHERE id = ? FOR UPDATE', [input.organizationId]);
    const [person] = await database.query<{ status: 'ACTIVE' | 'INACTIVE' }>('SELECT employment_status AS status FROM person WHERE id = ?', [input.personId]);
    const [current] = await database.query<{ id: string; personId: string; effectiveFrom: Date }>('SELECT id, person_id AS personId, effective_from AS effectiveFrom FROM hr_organization_head WHERE organization_id = ? AND effective_until IS NULL ORDER BY effective_from DESC LIMIT 1', [input.organizationId]);
    const decision = decideHeadAssignment({ organizationExists: organization.length > 0, personStatus: person?.status ?? null, current: current ? { ...current, effectiveFrom: new Date(current.effectiveFrom) } : null, personId: input.personId, effectiveFrom: input.effectiveFrom });
    if (decision.kind !== 'assign') return decision;
    const effectiveFrom = toMariaDbDatetime(input.effectiveFrom);
    if (decision.closeCurrentId) await database.execute('UPDATE hr_organization_head SET effective_until = ? WHERE id = ?', [effectiveFrom, decision.closeCurrentId]);
    await database.execute('INSERT INTO hr_organization_head (id, organization_id, person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, NULL, UTC_TIMESTAMP())', [this.createId(), input.organizationId, input.personId, effectiveFrom]);
    await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'hr.organization.head.assign', targetType: 'organization', targetId: input.organizationId, result: 'SUCCESS', metadata: { organizationId: input.organizationId, personId: input.personId } });
    return decision;
  }
}
