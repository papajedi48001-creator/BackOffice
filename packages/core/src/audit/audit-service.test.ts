import { describe, expect, it } from 'vitest';
import { AuditService } from './audit-service';

describe('AuditService', () => {
  it('keeps organization head identifiers and the unit type but drops a national ID', async () => {
    const recorded: string[] = [];
    const service = new AuditService({ append: async (event) => { recorded.push(event.metadata); } }, () => 'audit-1');

    await service.recordAudit({ actorPersonId: 'person-a', action: 'hr.organization.head.assign', targetType: 'organization', targetId: 'org-1', result: 'SUCCESS', metadata: { organizationId: 'org-1', personId: 'person-b', unitType: 'DIVISION', nationalId: '1234567890123' } });

    expect(recorded).toEqual(['{"organizationId":"org-1","personId":"person-b","unitType":"DIVISION"}']);
  });

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

  it('keeps profile work changes but drops personal values', async () => {
    const recorded: string[] = [];
    const service = new AuditService({ append: async (event) => { recorded.push(event.metadata); } }, () => 'audit-1');

    await service.recordAudit({ actorPersonId: 'person-a', action: 'hr.person.profile.update', targetType: 'person', targetId: 'person-b', result: 'SUCCESS', metadata: { changedFields: ['phone', 'positionLevel'], workChanges: { positionLevel: { from: null, to: 'ชำนาญการ' } }, phone: '0812345678' } });

    expect(recorded).toEqual(['{"changedFields":["phone","positionLevel"],"workChanges":{"positionLevel":{"from":null,"to":"ชำนาญการ"}}}']);
  });

  it('keeps leave ids, codes, dates and day counts in metadata', async () => {
    const recorded: string[] = [];
    const service = new AuditService({ append: async (event) => { recorded.push(event.metadata); } }, () => 'audit-leave');
    await service.recordAudit({ actorPersonId: 'person-a', action: 'leave.request.submitted', targetType: 'request', targetId: 'request-1', result: 'SUCCESS', metadata: { leaveTypeCode: 'VACATION', days: 2.5, fiscalYear: 2570, startDate: '2026-11-02', endDate: '2026-11-04', rowsChanged: 3, contactDuringLeave: '0812345678' } });
    expect(recorded).toEqual(['{"leaveTypeCode":"VACATION","days":2.5,"fiscalYear":2570,"startDate":"2026-11-02","endDate":"2026-11-04","rowsChanged":3}']);
  });
});
