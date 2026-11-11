import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Database } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { NationalIdHashMatcher } from './national-id-hash-matcher';

const protector = new NationalIdProtector('11'.repeat(32), '22'.repeat(32));
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function database(rows: Array<{ id: string; nationalId: string }>, sqls: string[] = []): Database {
  return {
    query: async (sql: string) => { sqls.push(sql); return rows.map((row) => ({ id: row.id, ciphertext: protector.encrypt(row.nationalId) })) as never; },
    execute: async () => undefined, transaction: async () => { throw new Error('unused'); }, close: async () => undefined
  } as Database;
}

describe('NationalIdHashMatcher', () => {
  it('finds the one active person whose national ID hashes to hash_cid', async () => {
    const sqls: string[] = [];
    const matcher = new NationalIdHashMatcher(database([{ id: 'p1', nationalId: '1100100000001' }, { id: 'p2', nationalId: '1100100000002' }], sqls), protector);
    await expect(matcher.findActivePerson(sha('1100100000002'))).resolves.toBe('p2');
    expect(sqls[0]).toContain("employment_status = 'ACTIVE'");
  });

  it('finds nobody for an unknown hash, a duplicate match or a row that does not decrypt', async () => {
    await expect(new NationalIdHashMatcher(database([{ id: 'p1', nationalId: '1100100000001' }]), protector).findActivePerson(sha('9999999999999'))).resolves.toBeNull();
    await expect(new NationalIdHashMatcher(database([{ id: 'p1', nationalId: '1100100000001' }, { id: 'p2', nationalId: '1100100000001' }]), protector).findActivePerson(sha('1100100000001'))).resolves.toBeNull();
    const broken = { ...database([]), query: async () => [{ id: 'p1', ciphertext: 'garbage' }, { id: 'p2', ciphertext: protector.encrypt('1100100000002') }] as never } as Database;
    await expect(new NationalIdHashMatcher(broken, protector).findActivePerson(sha('1100100000002'))).resolves.toBe('p2');
  });

  it('ignores a value that is not a SHA-256 hex digest', async () => {
    await expect(new NationalIdHashMatcher(database([{ id: 'p1', nationalId: '1100100000001' }]), protector).findActivePerson('1100100000001')).resolves.toBeNull();
  });
});
