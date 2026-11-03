// @vitest-environment node
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), getSharedDatabase: vi.fn(), readRuntimeValue: vi.fn(), fetch: vi.fn(),
  createLinkCode: vi.fn(), linkByCode: vi.fn(), unlink: vi.fn(), linkStatus: vi.fn(), groupJoined: vi.fn(), groupLeft: vi.fn()
}));
vi.mock('../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../lib/runtime-env', () => ({ readRuntimeValue: mocks.readRuntimeValue }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  LineService: class { createLinkCode = mocks.createLinkCode; linkByCode = mocks.linkByCode; unlink = mocks.unlink; linkStatus = mocks.linkStatus; groupJoined = mocks.groupJoined; groupLeft = mocks.groupLeft; }
}));

import { POST as WEBHOOK } from './webhook/route';
import { POST as CREATE_CODE } from './link-code/route';
import { DELETE as UNLINK, GET as STATUS } from './link/route';

const env: Record<string, string> = { LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token', LINE_BOT_BASIC_ID: '@123abcd' };
const user = `U${'ab'.repeat(16)}`;
const group = `C${'cd'.repeat(16)}`;
const signed = (body: object, secret = 'secret') => {
  const raw = JSON.stringify(body);
  return new Request('http://localhost/api/line/webhook', { method: 'POST', body: raw, headers: { 'x-line-signature': createHmac('sha256', secret).update(raw).digest('base64') } });
};
const nurse = { authenticated: true, personId: 'person-1', roles: [], dataOwnerModules: [] };

beforeEach(() => {
  mocks.readRuntimeValue.mockImplementation((name: string) => env[name]);
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('LINE webhook', () => {
  it('refuses a body that LINE did not sign, and answers 503 without a channel secret', async () => {
    expect((await WEBHOOK(signed({ events: [] }, 'other'))).status).toBe(401);
    mocks.readRuntimeValue.mockReturnValue(undefined);
    expect((await WEBHOOK(signed({ events: [] }))).status).toBe(503);
    expect(mocks.linkByCode).not.toHaveBeenCalled();
  });

  it('records a group the bot joins with its name, and one it leaves', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ groupName: 'หัวหน้างาน' }), { status: 200 }));
    expect((await WEBHOOK(signed({ events: [{ type: 'join', source: { type: 'group', groupId: group } }, { type: 'leave', source: { type: 'group', groupId: group } }] }))).status).toBe(200);
    expect(mocks.groupJoined).toHaveBeenCalledWith(group, 'หัวหน้างาน');
    expect(mocks.groupLeft).toHaveBeenCalledWith(group);
    expect(String(mocks.fetch.mock.calls[0]![0])).toBe(`https://api.line.me/v2/bot/group/${group}/summary`);
  });

  it('links the sender of a code typed loosely and replies, and replies a refusal to an unknown code', async () => {
    mocks.linkByCode.mockResolvedValueOnce({ ok: true, personId: 'person-1' }).mockResolvedValueOnce({ ok: false });
    const message = (text: string) => ({ type: 'message', replyToken: 'reply-1', source: { type: 'user', userId: user }, message: { type: 'text', text } });
    expect((await WEBHOOK(signed({ events: [message('abcd-2345'), message('ABCD2346')] }))).status).toBe(200);
    expect(mocks.linkByCode).toHaveBeenNthCalledWith(1, 'ABCD2345', user);
    const replies = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { messages: Array<{ text: string }> });
    expect(replies[0]!.messages[0]!.text).toBe('เชื่อมต่อบัญชี LINE กับ Back Office แล้ว');
    expect(replies[1]!.messages[0]!.text).toBe('รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่ในระบบ');
  });

  it('ignores chat that is not a code and still answers 200 when a reply fails', async () => {
    mocks.linkByCode.mockResolvedValue({ ok: true, personId: 'person-1' });
    mocks.fetch.mockRejectedValue(new Error('offline'));
    const response = await WEBHOOK(signed({ events: [
      { type: 'message', replyToken: 'r', source: { type: 'group', groupId: group, userId: user }, message: { type: 'text', text: 'สวัสดีครับ' } },
      { type: 'message', replyToken: 'r', source: { type: 'user', userId: user }, message: { type: 'text', text: 'ABCD2345' } }
    ] }));
    expect(response.status).toBe(200);
    expect(mocks.linkByCode).toHaveBeenCalledTimes(1);
  });
});

describe('เชื่อมต่อ LINE', () => {
  it('needs a signed-in person', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await CREATE_CODE(new Request('http://localhost/api/line/link-code', { method: 'POST' }))).status).toBe(401);
    expect((await UNLINK(new Request('http://localhost/api/line/link', { method: 'DELETE' }))).status).toBe(401);
  });

  it('creates a code for the signed-in person with the add-friend link', async () => {
    mocks.readSession.mockResolvedValue(nurse);
    mocks.createLinkCode.mockResolvedValue({ code: 'ABCD2345', expiresAt: '2026-11-03T04:00:00.000Z' });
    const response = await CREATE_CODE(new Request('http://localhost/api/line/link-code', { method: 'POST' }));
    expect(mocks.createLinkCode).toHaveBeenCalledWith('person-1');
    await expect(response.json()).resolves.toEqual({ code: 'ABCD2345', expiresAt: '2026-11-03T04:00:00.000Z', addFriendUrl: 'https://line.me/R/ti/p/%40123abcd' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses to make a code while LINE is not set up', async () => {
    mocks.readSession.mockResolvedValue(nurse);
    mocks.readRuntimeValue.mockReturnValue(undefined);
    expect((await CREATE_CODE(new Request('http://localhost/api/line/link-code', { method: 'POST' }))).status).toBe(503);
  });

  it('shows and removes the person\'s own link', async () => {
    mocks.readSession.mockResolvedValue(nurse);
    mocks.linkStatus.mockResolvedValue({ linkedAt: '2026-11-03T03:00:00.000Z' });
    await expect((await STATUS(new Request('http://localhost/api/line/link'))).json()).resolves.toEqual({ linked: true, linkedAt: '2026-11-03T03:00:00.000Z', configured: true });
    mocks.unlink.mockResolvedValue(true);
    expect((await UNLINK(new Request('http://localhost/api/line/link', { method: 'DELETE' }))).status).toBe(200);
    expect(mocks.unlink).toHaveBeenCalledWith('person-1');
  });
});
