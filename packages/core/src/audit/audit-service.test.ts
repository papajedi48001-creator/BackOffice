import { describe, expect, it } from 'vitest';
import { AuditService } from './audit-service';

describe('AuditService', () => {
  it('redacts protected identifiers before append-only persistence', async () => {
    const recorded: string[] = [];
    const service = new AuditService({ append: async (event) => { recorded.push(event.metadata); } }, () => 'audit-1');

    await service.recordAudit({ actorPersonId: 'person-a', action: 'hr.person.read', targetType: 'person', targetId: 'person-b', result: 'ALLOWED', metadata: { nationalId: '1234567890123', requestReference: 'REQ-1' } });

    expect(recorded).toEqual(['{"requestReference":"REQ-1"}']);
    expect(JSON.stringify(recorded)).not.toContain('1234567890123');
  });

  it('records workflow decision outcomes while dropping credentials and identifiers', async () => {
    const recorded: string[] = [];
    const service = new AuditService({ append: async (event) => { recorded.push(event.metadata); } }, () => 'audit-1');

    await service.recordAudit({ actorPersonId: 'person-a', action: 'workflow.request.decided', targetType: 'request', targetId: 'request-1', result: 'APPROVE', metadata: { requestReference: 'REQ-request-1', password: 'not-a-secret-to-store', token: 'not-a-token-to-store', nationalId: '1234567890123' } });

    expect(recorded).toEqual(['{"requestReference":"REQ-request-1"}']);
    expect(JSON.stringify(recorded)).not.toContain('not-a-secret-to-store');
    expect(JSON.stringify(recorded)).not.toContain('not-a-token-to-store');
    expect(JSON.stringify(recorded)).not.toContain('1234567890123');
  });
});
