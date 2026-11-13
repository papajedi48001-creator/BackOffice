import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { loadMoneyMember } from './money-access';
import { MoneyMemberService } from './money-member-service';
import { MoneyQueries } from './money-queries';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });

describeWithDatabase('MoneyMemberService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new MoneyMemberService(database);
  let manager: string; let staff: string; let other: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };
  const audits = (action: string, target: string) => database.query<{ metadata: string; actor_person_id: string }>('SELECT metadata, actor_person_id FROM audit_event WHERE action = ? AND target_id = ?', [action, target]);

  beforeAll(async () => {
    await runMigrations(database);
    [manager, staff, other] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('การเงิน'), insertPerson('อื่น')]);
  });
  afterAll(async () => { await database.close(); });

  it('adds a member with pages, lists them and audits without names', async () => {
    expect(await service.saveMember(subject(manager, 'money-manager'), { personId: staff, pages: ['dental'] })).toEqual({ ok: true });
    expect(await loadMoneyMember(database, staff)).toEqual({ pages: ['dental'] });
    const listed = (await new MoneyQueries(database).members()).find((row) => row.personId === staff);
    expect(listed).toMatchObject({ personId: staff, pages: ['dental'] });
    expect(listed?.displayName).toContain('การเงิน');
    const rows = await audits('money.member.save', staff);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_person_id).toBe(manager);
    expect(rows[0]!.metadata).not.toContain('การเงิน');
    expect(JSON.parse(rows[0]!.metadata)).toEqual({ pages: 1 });
  });

  it('replaces pages when saved again', async () => {
    await service.saveMember(subject(manager, 'money-manager'), { personId: staff, pages: ['dental', 'dental'] });
    expect(await loadMoneyMember(database, staff)).toEqual({ pages: ['dental'] });
  });

  it('refuses a non-manager and writes nothing', async () => {
    expect(await service.saveMember(subject(staff, null), { personId: other, pages: ['dental'] })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await loadMoneyMember(database, other)).toBeNull();
    expect(await service.removeMember(subject(staff, null), staff)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('answers NOT_FOUND for an unknown person', async () => {
    expect(await service.saveMember(subject(manager, 'admin'), { personId: randomUUID(), pages: ['dental'] })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.removeMember(subject(manager, 'admin'), randomUUID())).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('removes a member with their pages and audits it', async () => {
    expect(await service.removeMember(subject(manager, 'money-manager'), staff)).toEqual({ ok: true });
    expect(await loadMoneyMember(database, staff)).toBeNull();
    expect(Number((await database.query<{ total: number }>('SELECT COUNT(*) AS total FROM money_member_page WHERE person_id = ?', [staff]))[0]!.total)).toBe(0);
    expect(await audits('money.member.remove', staff)).toHaveLength(1);
  });
});
