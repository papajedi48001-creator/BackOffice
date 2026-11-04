import { describe, expect, it, vi } from 'vitest';
import { insertAuditEvent } from './audit-sql';

describe('insertAuditEvent', () => {
  it('records the actor\'s active role from their live session', async () => {
    const execute = vi.fn(async () => undefined);
    await insertAuditEvent({ execute } as never, { id: 'a1', actorPersonId: 'p1', action: 'x', targetType: 't', targetId: 'i', result: 'SUCCESS', metadata: '{}', createdAt: '' });
    const [sql, parameters] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('actor_role');
    expect(sql).toMatch(/SELECT s\.active_role FROM user_session s WHERE s\.person_id = \? AND s\.revoked_at IS NULL/);
    expect(parameters).toEqual(['a1', 'p1', 'x', 't', 'i', 'SUCCESS', '{}', 'p1']);
  });
});
