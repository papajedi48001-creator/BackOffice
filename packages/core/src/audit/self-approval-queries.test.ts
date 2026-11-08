import { describe, expect, it } from 'vitest';
import { listSelfApprovals } from './self-approval-queries';

describe('listSelfApprovals', () => {
  it('reads only audit events tagged selfApproval and maps each to who, which request and when', async () => {
    const calls: string[] = [];
    const database = { query: async (sql: string) => { calls.push(sql); return [
      { createdAt: new Date('2026-11-08T03:00:00Z'), actorDisplayName: 'สมชาย', actorRole: 'manager', action: 'workflow.request.decided', result: 'APPROVE', metadata: '{"requestReference":"LV-1","selfApproval":true}' },
      { createdAt: '2026-11-07 01:00:00', actorDisplayName: null, actorRole: 'admin', action: 'room_booking.approved', result: 'SUCCESS', metadata: '{"bookingReference":"RB-1","selfApproval":true}' }
    ]; } };
    expect(await listSelfApprovals(database as never)).toEqual([
      { createdAt: '2026-11-08T03:00:00.000Z', actorDisplayName: 'สมชาย', actorRole: 'manager', action: 'workflow.request.decided', result: 'APPROVE', reference: 'LV-1' },
      { createdAt: '2026-11-07T01:00:00.000Z', actorDisplayName: null, actorRole: 'admin', action: 'room_booking.approved', result: 'SUCCESS', reference: 'RB-1' }
    ]);
    expect(calls[0]).toContain("'$.selfApproval'");
  });
});
