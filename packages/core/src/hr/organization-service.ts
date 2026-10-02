import { randomUUID } from 'node:crypto';
import { assignEmploymentInputSchema, type AssignEmploymentInput, type EmploymentAssignment } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export class OrganizationService {
  constructor(private readonly db: Pick<Database, 'execute'>, private readonly createId = randomUUID) {}

  async assignEmployment(input: AssignEmploymentInput): Promise<EmploymentAssignment> {
    const validInput = assignEmploymentInputSchema.parse(input);
    const assignment: EmploymentAssignment = {
      id: this.createId(), personId: validInput.personId, organizationId: validInput.organizationId,
      managerPersonId: validInput.managerPersonId ?? null, effectiveFrom: validInput.effectiveFrom.toISOString(),
      effectiveUntil: validInput.effectiveUntil?.toISOString() ?? null
    };
    await this.db.execute(
      'INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [assignment.id, assignment.personId, assignment.organizationId, assignment.managerPersonId, assignment.effectiveFrom, assignment.effectiveUntil]
    );
    return assignment;
  }
}
