import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { PositionCatalogService } from './position-catalog-service';
import { HrProfileService } from './profile-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PositionCatalogService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new PositionCatalogService(database);
  const actor = randomUUID();
  const hrManager = { authenticated: true, personId: actor, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;
  const general = (name: string) => ({ name, category: 'GENERAL' as const, allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], isActive: true, sortOrder: 900 });
  const created = (result: Awaited<ReturnType<PositionCatalogService['create']>>) => { if (!result.ok) throw new Error(result.code); return result.id; };

  async function person(positionTitle: string | null = null) {
    const id = randomUUID();
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, position_title, employment_status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), positionTitle, 'ACTIVE']);
    return id;
  }
  const profileOf = async (personId: string) => (await database.query<{ positionId: string | null; positionLevel: string | null; positionTitle: string | null }>(
    'SELECT pr.position_id AS positionId, pr.position_level AS positionLevel, p.position_title AS positionTitle FROM person p LEFT JOIN hr_person_profile pr ON pr.person_id = p.id WHERE p.id = ?', [personId]))[0];

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [actor, 'ciphertext', randomUUID()]);
  });
  afterAll(async () => database.close());

  it('ships the ก.พ. seed, with the level range of each position', async () => {
    const positions = await service.list();
    expect(positions.find((position) => position.name === 'เจ้าพนักงานธุรการ')).toMatchObject({ category: 'GENERAL', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], isActive: true });
    expect(positions.find((position) => position.name === 'พยาบาลวิชาชีพ')).toMatchObject({ category: 'ACADEMIC', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ'] });
    expect(positions.find((position) => position.name === 'พนักงานขับรถยนต์')).toMatchObject({ category: 'NONE', allowedLevels: [] });
    expect(positions.length).toBeGreaterThanOrEqual(45);
  });

  it('adds, edits, closes and opens a position, and renames it on the people who hold it', async () => {
    const name = unique('เจ้าพนักงานทดสอบ');
    const id = created(await service.create(general(name), actor));
    await expect(service.create(general(name), actor)).resolves.toEqual({ ok: false, code: 'DUPLICATE_NAME' });
    const holder = await person();
    await expect(new HrProfileService(database).updateProfile(holder, { positionTitle: name, positionLevel: 'ชำนาญงาน' }, hrManager)).resolves.toEqual({ ok: true });
    const renamed = unique('เจ้าพนักงานเปลี่ยนชื่อ');
    await expect(service.update(id, { ...general(renamed), isActive: false }, actor)).resolves.toEqual({ ok: true });
    expect(await profileOf(holder)).toEqual({ positionId: id, positionLevel: 'ชำนาญงาน', positionTitle: renamed });
    expect((await service.list()).find((position) => position.id === id)).toMatchObject({ name: renamed, isActive: false, holders: 1 });
    await expect(service.update(id, { ...general(renamed), isActive: true }, actor)).resolves.toEqual({ ok: true });
    await expect(service.update(randomUUID(), general(unique('x')), actor)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await database.query('SELECT id FROM audit_event WHERE target_id = ? AND action = ?', [id, 'hr.position.update'])).toHaveLength(2);
  });

  it('deletes a position nobody holds and refuses one that is held', async () => {
    const free = created(await service.create(general(unique('ตำแหน่งว่าง')), actor));
    await expect(service.delete(free, actor)).resolves.toEqual({ ok: true });
    expect((await service.list()).some((position) => position.id === free)).toBe(false);
    const name = unique('ตำแหน่งมีคน');
    const held = created(await service.create(general(name), actor));
    await new HrProfileService(database).updateProfile(await person(), { positionTitle: name }, hrManager);
    await expect(service.delete(held, actor)).resolves.toEqual({ ok: false, code: 'POSITION_IN_USE' });
    await expect(service.delete(randomUUID(), actor)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('imports a CSV that adds or updates by name, and refuses the whole file on any bad row', async () => {
    const added = unique('นักทดสอบนำเข้า');
    const kept = unique('เจ้าพนักงานนำเข้าซ้ำ');
    created(await service.create(general(kept), actor));
    const csv = `name,category,levels,active\n${added},วิชาการ,ปฏิบัติการ|ชำนาญการ,1\n${kept},GENERAL,ปฏิบัติงาน|ชำนาญงาน|อาวุโส|ทักษะพิเศษ,ใช้งาน\n`;
    await expect(service.importCsv(csv, actor)).resolves.toEqual({ ok: true, created: 1, updated: 1 });
    const positions = await service.list();
    expect(positions.find((position) => position.name === added)).toMatchObject({ category: 'ACADEMIC', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ'], isActive: true });
    expect(positions.find((position) => position.name === kept)!.allowedLevels).toEqual(['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส', 'ทักษะพิเศษ']);
    const bad = `name,category,levels,active\n${unique('ตำแหน่งดี')},GENERAL,ปฏิบัติงาน,1\n${unique('ตำแหน่งผิด')},GENERAL,ปฏิบัติการ,1\n,NONE,,1\nx,ไม่รู้จัก,,1\n`;
    await expect(service.importCsv(bad, actor)).resolves.toEqual({ ok: false, errors: [{ line: 3, code: 'LEVELS_NOT_IN_CATEGORY' }, { line: 4, code: 'NAME_REQUIRED' }, { line: 5, code: 'UNKNOWN_CATEGORY' }] });
    await expect(service.importCsv('ชื่อ,หมวด\nก,ข\n', actor)).resolves.toEqual({ ok: false, errors: [{ line: 1, code: 'INVALID_HEADER' }] });
  });

  it('checks the position and its level when HR saves a person', async () => {
    const profiles = new HrProfileService(database);
    const someone = await person();
    await expect(profiles.updateProfile(someone, { positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ปฏิบัติการ' }, hrManager)).resolves.toEqual({ ok: false, code: 'LEVEL_NOT_ALLOWED' });
    await expect(profiles.updateProfile(someone, { positionTitle: 'พนักงานขับรถยนต์', positionLevel: 'ปฏิบัติงาน' }, hrManager)).resolves.toEqual({ ok: false, code: 'LEVEL_NOT_ALLOWED' });
    await expect(profiles.updateProfile(someone, { positionTitle: 'ตำแหน่งที่ไม่มี' }, hrManager)).resolves.toEqual({ ok: false, code: 'UNKNOWN_POSITION' });
    const closed = unique('ตำแหน่งปิด');
    created(await service.create({ ...general(closed), isActive: false }, actor));
    await expect(profiles.updateProfile(someone, { positionTitle: closed }, hrManager)).resolves.toEqual({ ok: false, code: 'INACTIVE_POSITION' });
    await expect(profiles.updateProfile(someone, { positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ชำนาญงาน' }, hrManager)).resolves.toEqual({ ok: true });
    const [seed] = await database.query<{ id: string }>("SELECT id FROM hr_position WHERE name = 'เจ้าพนักงานธุรการ'");
    expect(await profileOf(someone)).toEqual({ positionId: seed!.id, positionLevel: 'ชำนาญงาน', positionTitle: 'เจ้าพนักงานธุรการ' });
    // A level change alone is checked against the position already held.
    await expect(profiles.updateProfile(someone, { positionLevel: 'เชี่ยวชาญ' }, hrManager)).resolves.toEqual({ ok: false, code: 'LEVEL_NOT_ALLOWED' });
    // Leaving the level empty is allowed.
    await expect(profiles.updateProfile(someone, { positionLevel: null }, hrManager)).resolves.toEqual({ ok: true });
  });

  it('keeps an older free-text position until HR changes it', async () => {
    const someone = await person('ตำแหน่งเก่าที่ไม่อยู่ในทะเบียน');
    await expect(new HrProfileService(database).updateProfile(someone, { firstName: 'ทดสอบ', positionTitle: 'ตำแหน่งเก่าที่ไม่อยู่ในทะเบียน', positionLevel: null }, hrManager)).resolves.toEqual({ ok: true });
    expect(await profileOf(someone)).toMatchObject({ positionId: null, positionTitle: 'ตำแหน่งเก่าที่ไม่อยู่ในทะเบียน' });
  });

  it('treats a person whose title matches but who is not linked yet as a holder', async () => {
    const profiles = new HrProfileService(database);
    const name = unique('ตำแหน่งยังไม่ผูก');
    const id = created(await service.create(general(name), actor));
    const unlinked = await person(name);
    // A level-only change is still checked against the position the title names.
    await expect(profiles.updateProfile(unlinked, { positionLevel: 'ปฏิบัติการ' }, hrManager)).resolves.toEqual({ ok: false, code: 'LEVEL_NOT_ALLOWED' });
    const other = await person(name);
    expect((await service.list()).find((position) => position.id === id)!.holders).toBe(2);
    await expect(service.delete(id, actor)).resolves.toEqual({ ok: false, code: 'POSITION_IN_USE' });
    const renamed = unique('ตำแหน่งผูกแล้ว');
    await expect(service.update(id, general(renamed), actor)).resolves.toEqual({ ok: true });
    expect(await profileOf(other)).toEqual({ positionId: id, positionLevel: null, positionTitle: renamed });
  });

  it('refuses a CSV with two names that differ only in letter case instead of failing', async () => {
    const name = `Case ${randomUUID().slice(0, 8)}`;
    await expect(service.importCsv(`name,category,levels,active\n${name},NONE,,1\n${name.toLowerCase()},NONE,,1\n`, actor)).resolves.toEqual({ ok: false, errors: [{ line: 3, code: 'DUPLICATE_ROW' }] });
  });
});
