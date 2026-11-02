import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { AttachmentAccess } from '../files/attachment-access';
import { insertPerson } from '../leave/leave-fixtures';
import { SupportChatService } from './support-chat-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const person = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [], dataOwnerModules: [] });
const admin = (personId: string): AccessSubject => ({ authenticated: true, personId, roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] });

describeWithDatabase('SupportChatService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new SupportChatService(database);
  const alice = randomUUID();
  const bob = randomUUID();
  const adminId = randomUUID();
  const attachments: Record<string, string> = {};
  const addAttachment = async (createdBy: string, contentType: string) => {
    const id = randomUUID();
    await database.execute('INSERT INTO attachment (id, object_key, content_type, size_bytes, created_by_person_id, created_at) VALUES (?, ?, ?, 2048, ?, UTC_TIMESTAMP())', [id, `attachments/${randomUUID()}`, contentType, createdBy]);
    return id;
  };

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(database, alice, 'อลิส ทดสอบแชต');
    await insertPerson(database, bob, 'บ็อบ ทดสอบแชต');
    await insertPerson(database, adminId, 'ผู้ดูแล ทดสอบแชต');
    attachments.alicePng = await addAttachment(alice, 'image/png');
    attachments.alicePdf = await addAttachment(alice, 'application/pdf');
    attachments.bobPng = await addAttachment(bob, 'image/png');
    attachments.adminPng = await addAttachment(adminId, 'image/webp');
  });
  afterAll(async () => {
    const people = [alice, bob, adminId];
    await database.execute('DELETE m FROM support_message m JOIN support_conversation c ON c.id = m.conversation_id WHERE c.person_id IN (?, ?, ?)', people);
    await database.execute('DELETE FROM support_conversation WHERE person_id IN (?, ?, ?)', people);
    await database.close();
  });

  it('starts the person\'s one conversation on the first message and reuses it after', async () => {
    const first = await service.sendAsPerson(person(alice), { body: 'ขอเพิ่มรายงานการลา' });
    const second = await service.sendAsPerson(person(alice), { attachmentId: attachments.alicePng });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.conversationId).toBe(first.conversationId);
    const messages = await service.myMessages(person(alice));
    expect(messages.map((message) => [message.body, message.attachmentId, message.mine, message.fromAdmin])).toEqual([['ขอเพิ่มรายงานการลา', null, true, false], [null, attachments.alicePng, true, false]]);
  });

  it('audits each message in the same change without its text', async () => {
    const [conversation] = await database.query<{ id: string }>('SELECT id FROM support_conversation WHERE person_id = ?', [alice]);
    const audits = await database.query<{ metadata: string; actor_person_id: string }>("SELECT metadata, actor_person_id FROM audit_event WHERE action = 'support.message.sent' AND target_id = ? ORDER BY created_at", [conversation!.id]);
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => JSON.parse(audit.metadata))).toEqual(expect.arrayContaining([{ conversationId: conversation!.id, hasAttachment: false }, { conversationId: conversation!.id, hasAttachment: true }]));
    expect(audits.every((audit) => audit.actor_person_id === alice)).toBe(true);
    expect(audits.map((audit) => audit.metadata).join('')).not.toContain('ขอเพิ่มรายงาน');
  });

  it('refuses an empty message, someone else\'s file and a file that is not a picture', async () => {
    await expect(service.sendAsPerson(person(bob), { body: '   ' })).resolves.toEqual({ ok: false, code: 'EMPTY_MESSAGE' });
    await expect(service.sendAsPerson(person(bob), { attachmentId: attachments.alicePng })).resolves.toEqual({ ok: false, code: 'INVALID_ATTACHMENT' });
    await expect(service.sendAsPerson(person(alice), { attachmentId: attachments.alicePdf })).resolves.toEqual({ ok: false, code: 'INVALID_ATTACHMENT' });
    expect(await database.query('SELECT id FROM support_conversation WHERE person_id = ?', [bob])).toHaveLength(0);
  });

  it('keeps the admin inbox to ผู้ดูแลระบบ', async () => {
    await expect(service.adminInbox(person(bob))).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    const [conversation] = await database.query<{ id: string }>('SELECT id FROM support_conversation WHERE person_id = ?', [alice]);
    await expect(service.sendAsAdmin(person(bob), conversation!.id, { body: 'แอบตอบ' })).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.adminMessages(person(bob), conversation!.id)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(service.sendAsAdmin(admin(adminId), randomUUID(), { body: 'x' })).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('shows ผู้ดูแลระบบ who is waiting, and clears it once read', async () => {
    const inbox = await service.adminInbox(admin(adminId));
    if (!inbox.ok) throw new Error('inbox refused');
    const row = inbox.conversations.find((item) => item.personId === alice);
    expect(row).toMatchObject({ displayName: 'อลิส ทดสอบแชต', unread: 2, lastMessage: null, lastHasImage: true });
    expect(await service.unreadCount(admin(adminId))).toBeGreaterThanOrEqual(1);
    await service.markReadByAdmin(admin(adminId), row!.id);
    const after = await service.adminInbox(admin(adminId));
    expect(after.ok && after.conversations.find((item) => item.personId === alice)?.unread).toBe(0);
  });

  it('lets ผู้ดูแลระบบ reply with text and a picture, and the person sees it as unread until they read it', async () => {
    const [conversation] = await database.query<{ id: string }>('SELECT id FROM support_conversation WHERE person_id = ?', [alice]);
    await expect(service.sendAsAdmin(admin(adminId), conversation!.id, { body: 'รับเรื่องแล้วครับ', attachmentId: attachments.adminPng })).resolves.toMatchObject({ ok: true });
    expect(await service.unreadCount(person(alice))).toBe(1);
    const detail = await service.adminMessages(admin(adminId), conversation!.id);
    expect(detail.ok && detail.person.displayName).toBe('อลิส ทดสอบแชต');
    expect(detail.ok && detail.messages.at(-1)).toMatchObject({ fromAdmin: true, mine: true, senderName: 'ผู้ดูแล ทดสอบแชต', body: 'รับเรื่องแล้วครับ' });
    const mine = await service.myMessages(person(alice));
    expect(mine.at(-1)).toMatchObject({ fromAdmin: true, mine: false, senderName: 'ผู้ดูแล ทดสอบแชต' });
    await service.markReadByPerson(person(alice));
    expect(await service.unreadCount(person(alice))).toBe(0);
  });

  it('lets only the conversation\'s person and ผู้ดูแลระบบ open its pictures', async () => {
    const attachment = { id: attachments.adminPng!, objectKey: 'x', contentType: 'image/webp' as const, sizeBytes: 1, createdByPersonId: adminId, filename: null };
    const opener = (subject: AccessSubject) => new AttachmentAccess(database, subject).canDownload({ attachmentId: attachment.id, actorPersonId: subject.personId! }, attachment);
    await expect(opener(person(alice))).resolves.toBe(true);
    await expect(opener(admin(randomUUID()))).resolves.toBe(true);
    await expect(opener(person(bob))).resolves.toBe(false);
  });

  it('gives a person with no conversation an empty chat', async () => {
    await expect(service.myMessages(person(bob))).resolves.toEqual([]);
    await expect(service.unreadCount(person(bob))).resolves.toBe(0);
  });
});
