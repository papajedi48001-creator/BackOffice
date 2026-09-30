import { describe, expect, it } from 'vitest';
import { DelegationService } from './delegation-service';

describe('DelegationService', () => {
  it('rejects a self delegation before it can affect approval authority', async () => {
    const service = new DelegationService();

    await expect(service.grantDelegation({
      delegatorPersonId: 'person-a', delegatePersonId: 'person-a', moduleCode: 'maintenance', reason: 'leave',
      effectiveFrom: new Date('2026-10-01T00:00:00Z'), effectiveUntil: new Date('2026-10-02T00:00:00Z')
    })).rejects.toThrow('SELF_DELEGATION');
  });
});
