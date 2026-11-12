import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id.ts';
import { ThaidLoginService } from './thaid-login-service.ts';

const protector = new NationalIdProtector('11'.repeat(32), '22'.repeat(32));
const pid = '1101700207584';

function setup(rows: Array<{ id: string; employmentStatus: string }>) {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const database = { query: async (sql: string, parameters: unknown[] = []) => { queries.push({ sql, parameters }); return rows; } } as unknown as Database;
  const audit = { recordAudit: vi.fn(async () => undefined) };
  return { service: new ThaidLoginService(database, protector, audit), queries, audit };
}

describe('ThaidLoginService', () => {
  it('finds the ACTIVE บุคลากร by the national-ID lookup HMAC, never by the number itself, and audits the sign-in', async () => {
    const { service, queries, audit } = setup([{ id: 'person-1', employmentStatus: 'ACTIVE' }]);
    expect(await service.resolve(pid)).toEqual({ kind: 'active', personId: 'person-1' });
    expect(queries[0]!.parameters).toEqual([protector.lookup(pid)]);
    expect(queries[0]!.sql).toContain('deleted_at IS NULL');
    expect(audit.recordAudit).toHaveBeenCalledWith({ actorPersonId: 'person-1', action: 'identity.thaid_login', targetType: 'person', targetId: 'person-1', result: 'SUCCESS', metadata: {} });
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toContain(pid);
  });

  it('a person who is not ACTIVE is refused and audited with stage inactive', async () => {
    const { service, audit } = setup([{ id: 'person-2', employmentStatus: 'RESIGNED' }]);
    expect(await service.resolve(pid)).toEqual({ kind: 'inactive' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actorPersonId: 'person-2', result: 'FAILURE', metadata: { stage: 'inactive' } }));
  });

  it('no บุคลากร with that number is not_found, audited without the number', async () => {
    const { service, audit } = setup([]);
    expect(await service.resolve(pid)).toEqual({ kind: 'not_found' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actorPersonId: null, result: 'FAILURE', metadata: { stage: 'not_found' } }));
    expect(JSON.stringify(audit.recordAudit.mock.calls)).not.toContain(pid);
  });

  it('findActivePerson matches without auditing, for confirming a pending Provider ID login', async () => {
    const { service, audit } = setup([{ id: 'person-1', employmentStatus: 'ACTIVE' }]);
    expect(await service.findActivePerson(pid)).toBe('person-1');
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});
