import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { LineService } from './line-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const lineUser = () => `U${randomBytes(16).toString('hex')}`;
const lineGroup = () => `C${randomBytes(16).toString('hex')}`;

describeWithDatabase('LineService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new LineService(database);
  const [admin, nurse, clerk] = [randomUUID(), randomUUID(), randomUUID()];
  const people = [admin, nurse, clerk];
  const moduleCode = `line-test-${randomUUID().slice(0, 8)}`;
  const audits = (action: string, targetId: string) => database.query<{ metadata: string; actor: string | null }>('SELECT metadata, actor_person_id AS actor FROM audit_event WHERE action = ? AND target_id = ?', [action, targetId]);

  beforeAll(async () => {
    await runMigrations(database);
    for (const person of people) await insertPerson(database, person);
  });
  afterAll(async () => {
    await database.execute(`DELETE FROM line_link_code WHERE person_id IN (?, ?, ?)`, people);
    await database.execute(`DELETE FROM line_account_link WHERE person_id IN (?, ?, ?)`, people);
    await database.execute('DELETE FROM line_module_route WHERE module_code = ?', [moduleCode]);
    await database.close();
  });

  it('links the LINE user who sends a fresh code, once, and audits it without the code or the LINE id', async () => {
    const { code, expiresAt } = await service.createLinkCode(nurse);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    const user = lineUser();
    await expect(service.linkByCode(code, user)).resolves.toEqual({ ok: true, personId: nurse });
    await expect(service.linkByCode(code, user)).resolves.toEqual({ ok: false });
    expect(await service.linkStatus(nurse)).toMatchObject({ linkedAt: expect.any(String) });
    expect(await service.lineUserIdOf(nurse)).toBe(user);
    const [audit] = await audits('line.account.linked', nurse);
    expect(audit!.actor).toBe(nurse);
    expect(audit!.metadata).not.toContain(code);
    expect(audit!.metadata).not.toContain(user);
  });

  it('refuses an expired code and keeps one live code per person', async () => {
    const first = await service.createLinkCode(clerk);
    const second = await service.createLinkCode(clerk);
    await expect(service.linkByCode(first.code, lineUser())).resolves.toEqual({ ok: false });
    await database.execute('UPDATE line_link_code SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE person_id = ?', [clerk]);
    await expect(service.linkByCode(second.code, lineUser())).resolves.toEqual({ ok: false });
    expect(await service.linkStatus(clerk)).toBeNull();
  });

  it('moves a LINE account to the latest person who links it, and replaces a person\'s old account', async () => {
    const shared = lineUser();
    await service.linkByCode((await service.createLinkCode(admin)).code, shared);
    await service.linkByCode((await service.createLinkCode(clerk)).code, shared);
    expect(await service.lineUserIdOf(admin)).toBeNull();
    expect(await service.lineUserIdOf(clerk)).toBe(shared);
    const next = lineUser();
    await service.linkByCode((await service.createLinkCode(clerk)).code, next);
    expect(await service.lineUserIdOf(clerk)).toBe(next);
    await expect(service.unlink(clerk)).resolves.toBe(true);
    await expect(service.unlink(clerk)).resolves.toBe(false);
    expect(await audits('line.account.unlinked', clerk)).toHaveLength(1);
  });

  it('records groups the bot joins and leaves, and routes a module only to a known group', async () => {
    const group = lineGroup();
    await expect(service.setRoute(admin, moduleCode, group)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await service.groupJoined(group, 'หัวหน้างาน');
    await service.groupJoined(group, 'หัวหน้างาน');
    await expect(service.setRoute(admin, moduleCode, group)).resolves.toEqual({ ok: true });
    expect(await service.routeFor(moduleCode)).toEqual({ groupId: group });
    await service.groupLeft(group);
    expect(await service.routeFor(moduleCode)).toBeNull();
    await service.groupJoined(group, null);
    expect(await service.routeFor(moduleCode)).toEqual({ groupId: group });
    const overview = await service.overview();
    expect(overview.groups.find((row) => row.groupId === group)).toMatchObject({ displayName: 'หัวหน้างาน', source: 'WEBHOOK', active: true });
    expect(overview.routes[moduleCode]).toBe(group);
    await expect(service.setRoute(admin, moduleCode, null)).resolves.toEqual({ ok: true });
    expect(await service.routeFor(moduleCode)).toBeNull();
    expect(await audits('line.route.changed', moduleCode)).toHaveLength(2);
    expect(await audits('line.group.joined', group)).toHaveLength(3);
  });

  it('lets ผู้ดูแลระบบ add a group by hand', async () => {
    const group = lineGroup();
    await expect(service.addGroup(admin, { groupId: group, displayName: 'กลุ่มพัสดุ' })).resolves.toEqual({ ok: true });
    expect((await service.overview()).groups.find((row) => row.groupId === group)).toMatchObject({ source: 'MANUAL', active: true, displayName: 'กลุ่มพัสดุ' });
    expect(await audits('line.group.added', group)).toHaveLength(1);
  });
});
