import { randomUUID } from 'node:crypto';
import { grantDelegationInputSchema, type Delegation, type GrantDelegationInput } from '@backoffice/contracts';

export class DelegationService {
  constructor(private readonly createId: () => string = randomUUID) {}

  async grantDelegation(input: GrantDelegationInput): Promise<Delegation> {
    const delegation = grantDelegationInputSchema.parse(input);
    if (delegation.delegatorPersonId === delegation.delegatePersonId) throw new Error('SELF_DELEGATION');
    if (delegation.effectiveUntil <= delegation.effectiveFrom) throw new Error('INVALID_DELEGATION_PERIOD');
    return { ...delegation, id: this.createId() };
  }
}
