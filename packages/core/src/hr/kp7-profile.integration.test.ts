import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, Attachment } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { AttachmentAccess } from '../files/attachment-access';
import { HrProfileService } from './profile-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
// Invented people only: a real ก.พ.7 holds salary and family details that never belong in a test.
const family = { maritalStatus: 'MARRIED' as const, religion: 'พุทธ', birthplace: 'สกลนคร', fatherName: 'นายทดสอบ ตัวอย่าง', motherName: 'นางทดลอง ตัวอย่าง', motherMaidenName: 'สมมุติ', spouseName: 'นางสาวสมมุติ ชื่อ', spouseMaidenName: 'ชื่อ', childrenCount: 2 };

describeWithDatabase('ก.พ.7 family details and file against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new HrProfileService(database);
  const ids = { manager: randomUUID(), reader: randomUUID(), other: randomUUID() };
  const manager: AccessSubject = { authenticated: true, personId: ids.manager, roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
  const reader: AccessSubject = { authenticated: true, personId: ids.reader, roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] };
  const other: AccessSubject = { authenticated: true, personId: ids.other, roles: [], dataOwnerModules: [] };
  const self = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [], dataOwnerModules: [] });

  async function person() {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, 'c', ?, 'ผู้ทดสอบ', UTC_TIMESTAMP())", [id, randomUUID()]);
    return id;
  }
  async function attachment(createdBy: string, contentType = 'application/pdf') {
    const id = randomUUID();
    await database.execute('INSERT INTO attachment (id, object_key, content_type, size_bytes, created_by_person_id, created_at) VALUES (?, ?, ?, 2048, ?, UTC_TIMESTAMP())', [id, `attachments/${randomUUID()}`, contentType, createdBy]);
    return id;
  }
  const audits = (personId: string, action: string) => database.query<{ actor: string; metadata: string }>('SELECT actor_person_id AS actor, metadata FROM audit_event WHERE target_id = ? AND action = ?', [personId, action]);
  const privateOf = async (personId: string, viewer: AccessSubject) => { const view = await service.get(personId, viewer); if (typeof view === 'string') throw new Error(view); return view.private; };

  beforeAll(async () => {
    await runMigrations(database);
    for (const id of Object.values(ids)) await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, 'c', ?, UTC_TIMESTAMP())", [id, randomUUID()]);
  });
  afterAll(async () => database.close());

  it('lets the person fill in their family details and records only which fields changed', async () => {
    const id = await person();
    await expect(service.updateFamily(id, family, self(id))).resolves.toEqual({ ok: true });
    expect(await privateOf(id, self(id))).toMatchObject(family);
    const [audit] = await audits(id, 'hr.person.family.update');
    expect(audit!.actor).toBe(id);
    expect(JSON.parse(audit!.metadata)).toEqual({ changedFields: Object.keys(family) });
    expect(audit!.metadata).not.toContain('ทดสอบ');
    await expect(service.updateFamily(id, family, self(id))).resolves.toEqual({ ok: true });
    expect(await audits(id, 'hr.person.family.update')).toHaveLength(1);
  });

  it('lets HR correct them and clear a field, and refuses a reader or another staff member', async () => {
    const id = await person();
    await expect(service.updateFamily(id, { ...family, spouseName: null, childrenCount: 0 }, manager)).resolves.toEqual({ ok: true });
    expect(await privateOf(id, manager)).toMatchObject({ spouseName: null, childrenCount: 0, religion: 'พุทธ' });
    await expect(service.updateFamily(id, { religion: 'คริสต์' }, reader)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.updateFamily(id, { religion: 'คริสต์' }, other)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.updateFamily(randomUUID(), { religion: 'คริสต์' }, manager)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    const view = await service.get(id, reader);
    expect(JSON.stringify(view)).not.toContain('พุทธ');
  });

  it('keeps one ก.พ.7 PDF per person, uploaded by the person or HR, and removes it on request', async () => {
    const id = await person();
    const own = await attachment(id);
    await expect(service.setKp7File(id, own, self(id))).resolves.toEqual({ ok: true });
    expect((await privateOf(id, self(id)))!.kp7File).toMatchObject({ attachmentId: own });
    expect((await privateOf(id, self(id)))!.kp7File!.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const byHr = await attachment(ids.manager);
    await expect(service.setKp7File(id, byHr, manager)).resolves.toEqual({ ok: true });
    expect((await privateOf(id, manager))!.kp7File).toMatchObject({ attachmentId: byHr });
    await expect(service.setKp7File(id, null, self(id))).resolves.toEqual({ ok: true });
    expect((await privateOf(id, self(id)))!.kp7File).toBeNull();
    const logged = await audits(id, 'hr.person.kp7.update');
    expect(logged).toHaveLength(3);
    expect(JSON.parse(logged[0]!.metadata)).toEqual({ changedFields: ['kp7File'] });
  });

  it('refuses a file that is not a PDF, one someone else uploaded, or an actor who may not edit', async () => {
    const id = await person();
    await expect(service.setKp7File(id, await attachment(id, 'image/png'), self(id))).resolves.toEqual({ ok: false, code: 'INVALID_FILE' });
    await expect(service.setKp7File(id, await attachment(id), manager)).resolves.toEqual({ ok: false, code: 'INVALID_FILE' });
    await expect(service.setKp7File(id, randomUUID(), self(id))).resolves.toEqual({ ok: false, code: 'INVALID_FILE' });
    await expect(service.setKp7File(id, await attachment(ids.reader), reader)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('lets HR managers download a person\'s ก.พ.7 but not a reader or another staff member', async () => {
    const id = await person();
    const file = await attachment(id);
    await service.setKp7File(id, file, self(id));
    const stored = { id: file, createdByPersonId: id } as Attachment;
    const may = (viewer: AccessSubject) => new AttachmentAccess(database, viewer).canDownload({ attachmentId: file, actorPersonId: viewer.personId! }, stored);
    expect(await may(manager)).toBe(true);
    expect(await may(reader)).toBe(false);
    expect(await may(other)).toBe(false);
  });
});
