// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(), enabled: vi.fn(), upload: vi.fn(), open: vi.fn(),
  notify: vi.fn(), liveState: vi.fn(),
  sendAsPerson: vi.fn(), sendAsAdmin: vi.fn(), myMessages: vi.fn(), adminMessages: vi.fn(), adminInbox: vi.fn(), markReadByPerson: vi.fn(), markReadByAdmin: vi.fn(), unreadCount: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../lib/attachments', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../lib/attachments')>(), attachmentsEnabled: mocks.enabled, attachmentService: () => ({ uploadAttachment: mocks.upload, openAttachment: mocks.open }) }));
vi.mock('../../../lib/chat-stream', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../lib/chat-stream')>(), notifyChatChanged: mocks.notify }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  SupportChatService: class { sendAsPerson = mocks.sendAsPerson; sendAsAdmin = mocks.sendAsAdmin; myMessages = mocks.myMessages; adminMessages = mocks.adminMessages; adminInbox = mocks.adminInbox; markReadByPerson = mocks.markReadByPerson; markReadByAdmin = mocks.markReadByAdmin; unreadCount = mocks.unreadCount; liveState = mocks.liveState; }
}));

import { GET as SUMMARY } from './summary/route';
import { GET as MINE } from './mine/route';
import { POST as SEND_MINE } from './mine/messages/route';
import { POST as READ_MINE } from './mine/read/route';
import { GET as INBOX } from './conversations/route';
import { GET as CONVERSATION } from './conversations/[conversationId]/route';
import { POST as SEND_ADMIN } from './conversations/[conversationId]/messages/route';
import { POST as UPLOAD } from './images/route';
import { GET as IMAGE } from './images/[attachmentId]/route';
import { GET as STREAM } from './stream/route';

const staff = { authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] };
const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const conversationId = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
const json = (value: unknown) => new Request('http://localhost/api/support-chat/x', { method: 'POST', body: JSON.stringify(value) });
const get = () => new Request('http://localhost/api/support-chat/x');
const ready = (session: object = staff) => { mocks.readSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({}); mocks.enabled.mockReturnValue(true); };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const upload = (file: File) => { const body = new FormData(); body.append('file', file); return new Request('http://localhost/api/support-chat/images', { method: 'POST', body }); };

afterEach(() => vi.resetAllMocks());

describe('support chat API', () => {
  it('refuses anyone signed out', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await SUMMARY(get())).status).toBe(401);
    expect((await SEND_MINE(json({ body: 'hi' }))).status).toBe(401);
    expect((await INBOX(get())).status).toBe(401);
    expect(mocks.sendAsPerson).not.toHaveBeenCalled();
  });

  it('gives the chat button its count and the person their messages', async () => {
    ready();
    mocks.unreadCount.mockResolvedValue(2);
    mocks.myMessages.mockResolvedValue([{ id: 'm1' }]);
    await expect((await SUMMARY(get())).json()).resolves.toEqual({ unread: 2 });
    await expect((await MINE(get())).json()).resolves.toEqual({ messages: [{ id: 'm1' }] });
    expect(mocks.myMessages).toHaveBeenCalledWith(staff);
  });

  it('sends the person\'s message as theirs, never to a recipient they choose', async () => {
    ready();
    mocks.sendAsPerson.mockResolvedValue({ ok: true, id: 'm1', conversationId });
    const response = await SEND_MINE(json({ body: ' ขอเมนูใหม่ ' }));
    expect(response.status).toBe(201);
    expect(mocks.sendAsPerson).toHaveBeenCalledWith(staff, { body: 'ขอเมนูใหม่' });
    expect((await SEND_MINE(json({ body: 'hi', recipientPersonId: 'person-b' }))).status).toBe(400);
    expect((await SEND_MINE(json({ body: '  ' }))).status).toBe(400);
    expect(mocks.sendAsPerson).toHaveBeenCalledTimes(1);
  });

  it('marks the person\'s chat read', async () => {
    ready();
    expect((await READ_MINE(json({}))).status).toBe(200);
    expect(mocks.markReadByPerson).toHaveBeenCalledWith(staff);
  });

  it('answers 403 when the service refuses someone who is not ผู้ดูแลระบบ, and 404 for an unknown conversation', async () => {
    ready();
    mocks.adminInbox.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    mocks.adminMessages.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    expect((await INBOX(get())).status).toBe(403);
    expect((await CONVERSATION(get(), params({ conversationId }))).status).toBe(404);
  });

  it('lets ผู้ดูแลระบบ reply into a conversation', async () => {
    ready(admin);
    mocks.sendAsAdmin.mockResolvedValue({ ok: true, id: 'm2', conversationId });
    expect((await SEND_ADMIN(json({ attachmentId: conversationId }), params({ conversationId }))).status).toBe(201);
    expect(mocks.sendAsAdmin).toHaveBeenCalledWith(admin, conversationId, { attachmentId: conversationId });
    mocks.sendAsAdmin.mockResolvedValue({ ok: false, code: 'INVALID_ATTACHMENT' });
    expect((await SEND_ADMIN(json({ attachmentId: conversationId }), params({ conversationId }))).status).toBe(400);
  });

  it('uploads pictures only, and answers 503 while storage is not configured', async () => {
    ready();
    expect((await UPLOAD(upload(new File([new TextEncoder().encode('%PDF-1.7')], 'a.pdf', { type: 'application/pdf' })))).status).toBe(415);
    mocks.upload.mockResolvedValue({ id: 'att-1', filename: 'clip.png', contentType: 'image/png', sizeBytes: 9 });
    const response = await UPLOAD(upload(new File([png], 'clip.png', { type: 'image/png' })));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ attachmentId: 'att-1' });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ actorPersonId: 'person-a', contentType: 'image/png', filename: 'clip.png' }));
    mocks.enabled.mockReturnValue(false);
    expect((await UPLOAD(upload(new File([png], 'clip.png', { type: 'image/png' })))).status).toBe(503);
  });

  it('shows a chat picture inline without recording a download each time', async () => {
    ready();
    mocks.open.mockResolvedValue({ attachment: { contentType: 'image/png', filename: 'clip.png' }, bytes: png });
    const response = await IMAGE(get(), params({ attachmentId: conversationId }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toMatch(/^inline/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.open).toHaveBeenCalledWith({ attachmentId: conversationId, actorPersonId: 'person-a' }, expect.anything(), { recordDownload: false });
    mocks.open.mockRejectedValue(new Error('NOT_FOUND'));
    expect((await IMAGE(get(), params({ attachmentId: conversationId }))).status).toBe(404);
  });

  it('wakes open live streams after a message is sent, and not after a refused one', async () => {
    ready();
    mocks.sendAsPerson.mockResolvedValueOnce({ ok: true, id: 'm1', conversationId }).mockResolvedValueOnce({ ok: false, code: 'INVALID_ATTACHMENT' });
    await SEND_MINE(json({ body: 'hi' }));
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    await SEND_MINE(json({ attachmentId: conversationId }));
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    ready(admin);
    mocks.sendAsAdmin.mockResolvedValue({ ok: true, id: 'm2', conversationId });
    await SEND_ADMIN(json({ body: 'ok' }), params({ conversationId }));
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it('streams the live chat state as Server-Sent Events that proxies do not buffer', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await STREAM(get())).status).toBe(401);
    ready();
    mocks.liveState.mockResolvedValue({ unread: 1, lastMessageAt: '2026-11-12T14:00:00.000000Z', conversationId });
    const controller = new AbortController();
    const response = await STREAM(new Request('http://localhost/api/support-chat/stream', { signal: controller.signal }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain('"unread":1');
    expect(mocks.liveState).toHaveBeenCalledWith(staff);
    await reader.cancel();
  });
});
