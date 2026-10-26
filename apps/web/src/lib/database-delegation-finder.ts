import type { Database } from '@backoffice/db';
import type { ActiveDelegationFinder } from '@backoffice/core';

export class DatabaseActiveDelegationFinder implements ActiveDelegationFinder {
  constructor(private readonly database: Pick<Database, 'query'>) {}
  async findActiveFor(delegatorPersonId: string, delegatePersonId: string, moduleCode: string) {
    const rows = await this.database.query<{ delegatorPersonId: string; delegatePersonId: string; moduleCode: string }>('SELECT delegator_person_id AS delegatorPersonId, delegate_person_id AS delegatePersonId, module_code AS moduleCode FROM delegation WHERE delegator_person_id = ? AND delegate_person_id = ? AND module_code = ? AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP() LIMIT 1', [delegatorPersonId, delegatePersonId, moduleCode]);
    return rows[0] ?? null;
  }
}
