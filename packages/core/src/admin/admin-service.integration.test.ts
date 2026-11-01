import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { AdminQueries } from './admin-queries';
import { AdminService } from './admin-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AdminService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new AdminService(database);
  const queries = new AdminQueries(database);
  const actor = randomUUID();
  const person = randomUUID();
  const retired = randomUUID();
  const auditsFor = (action: string, targetId: string) => database.query<{ metadata: string; actor_person_id: string }>('SELECT metadata, actor_person_id FROM audit_event WHERE action = ? AND target_id = ? ORDER BY created_at', [action, targetId]);
  const rolesOf = async (personId: string) => (await database.query<{ name: string }>('SELECT role.name AS name FROM role_assignment JOIN role ON role.id = role_assignment.role_id WHERE role_assignment.person_id = ? AND role_assignment.organization_id IS NULL ORDER BY role.name', [personId])).map((row) => row.name);

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(database, actor, 'ผู้ดูแล ทดสอบ');
    await insertPerson(database, person, 'บุคลากร ทดสอบสิทธิ');
    await insertPerson(database, retired);
    await database.execute("UPDATE person SET employment_status = 'INACTIVE' WHERE id = ?", [retired]);
  });
  afterAll(async () => {
    await database.execute('DELETE FROM role_assignment WHERE person_id IN (?, ?, ?)', [actor, person, retired]);
    await database.execute("DELETE FROM admin_module_setting WHERE module_code = 'fleet'");
    await database.close();
  });

  it('grants a manager role once, audits it in the same change, and lists it', async () => {
    await expect(service.grantRole(actor, person, 'fleet-manager')).resolves.toEqual({ ok: true, changed: true });
    await expect(service.grantRole(actor, person, 'fleet-manager')).resolves.toEqual({ ok: true, changed: false });
    expect(await rolesOf(person)).toEqual(['fleet-manager']);
    const audits = await auditsFor('admin.role.granted', person);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor_person_id).toBe(actor);
    expect(JSON.parse(audits[0]!.metadata)).toEqual({ personId: person, roleName: 'fleet-manager' });
    const grant = (await queries.grants()).find((row) => row.personId === person);
    expect(grant).toMatchObject({ displayName: 'บุคลากร ทดสอบสิทธิ', roleNames: ['fleet-manager'] });
  });

  it('refuses a grant to someone who no longer works here', async () => {
    await expect(service.grantRole(actor, retired, 'admin')).resolves.toEqual({ ok: false, code: 'PERSON_NOT_ACTIVE' });
    await expect(service.grantRole(actor, randomUUID(), 'admin')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('sets a person\'s whole role set in one change: one user can hold several roles', async () => {
    await expect(service.setPersonRoles(actor, person, ['admin', 'leave-manager', 'room-manager'])).resolves.toEqual({ ok: true, granted: ['admin', 'leave-manager', 'room-manager'], revoked: ['fleet-manager'] });
    expect(await rolesOf(person)).toEqual(['admin', 'leave-manager', 'room-manager']);
    expect(await auditsFor('admin.role.revoked', person)).toHaveLength(1);
  });

  it('never removes the last ผู้ดูแลระบบ', async () => {
    // Park every other admin so `person` is the only one, then put them back.
    const others = await database.query<{ id: string; person_id: string; role_id: string; created_at: Date }>("SELECT a.id, a.person_id, a.role_id, a.created_at FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE r.name = 'admin' AND a.organization_id IS NULL AND a.person_id <> ?", [person]);
    await database.execute(`DELETE FROM role_assignment WHERE id IN (${others.map(() => '?').join(', ') || "''"})`, others.map((row) => row.id));
    try {
      await expect(service.revokeRole(actor, person, 'admin')).resolves.toEqual({ ok: false, code: 'LAST_ADMIN' });
      await expect(service.setPersonRoles(actor, person, ['room-manager'])).resolves.toEqual({ ok: false, code: 'LAST_ADMIN' });
      expect(await rolesOf(person)).toEqual(['admin', 'leave-manager', 'room-manager']);
      await service.grantRole(person, actor, 'admin');
      await expect(service.revokeRole(actor, person, 'admin')).resolves.toEqual({ ok: true });
      expect(await rolesOf(person)).toEqual(['leave-manager', 'room-manager']);
    } finally {
      for (const row of others) await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) VALUES (?, ?, ?, NULL, ?)', [row.id, row.person_id, row.role_id, row.created_at]);
    }
  });

  it('switches a module off and on with an audit each time, and never the admin module', async () => {
    await expect(service.setModuleEnabled(actor, 'fleet', false)).resolves.toEqual({ ok: true });
    expect(await queries.disabledModules()).toContain('fleet');
    await expect(service.setModuleEnabled(actor, 'fleet', true)).resolves.toEqual({ ok: true });
    expect(await queries.disabledModules()).not.toContain('fleet');
    expect(await auditsFor('admin.module.disabled', 'fleet')).not.toHaveLength(0);
    expect(JSON.parse((await auditsFor('admin.module.enabled', 'fleet')).at(-1)!.metadata)).toEqual({ moduleCode: 'fleet' });
    await expect(service.setModuleEnabled(actor, 'admin', false)).resolves.toEqual({ ok: false, code: 'MODULE_LOCKED' });
  });

  it('finds active people by name or employee code for the picker', async () => {
    const found = await queries.people('ทดสอบสิทธิ');
    expect(found.map((row) => row.personId)).toContain(person);
    expect((await queries.people('ทดสอบสิทธิ')).every((row) => row.personId !== retired)).toBe(true);
  });
});
