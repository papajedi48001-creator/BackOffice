import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SupportChat } from './support-chat';

type Handler = (url: string, init?: RequestInit) => unknown;
let routes: Record<string, Handler>;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  const handler = routes[key];
  if (!handler) return new Response(JSON.stringify({}), { status: 200 });
  const body = handler(url, init);
  return new Response(JSON.stringify(body ?? {}), { status: init?.method === 'POST' && url.endsWith('/messages') ? 201 : 200 });
});

beforeEach(() => {
  routes = {
    'GET /api/support-chat/summary': () => ({ unread: 0 }),
    'GET /api/support-chat/mine': () => ({ messages: [{ id: 'm1', fromAdmin: true, senderName: 'ผู้ดูแล ระบบ', body: 'สวัสดีครับ', attachmentId: null, createdAt: '2026-11-02T03:00:00.000Z', mine: false }] })
  };
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

const calls = (key: string) => fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key);

it('shows the unread count on the chat button', () => {
  render(<SupportChat admin={false} images unread={3} />);
  const button = screen.getByRole('button', { name: 'แชตกับผู้ดูแลระบบ 3 ข้อความที่ยังไม่อ่าน' });
  expect(within(button).getByText('3')).toBeInTheDocument();
});

it('opens the person\'s one chat with ผู้ดูแลระบบ, marks it read, and sends with Enter but not Shift+Enter', async () => {
  routes['POST /api/support-chat/mine/messages'] = () => ({ ok: true });
  render(<SupportChat admin={false} images unread={1} />);
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  const chat = await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' });
  expect(await within(chat).findByText('สวัสดีครับ')).toBeInTheDocument();
  await waitFor(() => expect(calls('POST /api/support-chat/mine/read')).toHaveLength(1));
  const box = within(chat).getByRole('textbox', { name: 'ข้อความ' });
  fireEvent.change(box, { target: { value: 'ขอเพิ่มรายงาน' } });
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
  expect(calls('POST /api/support-chat/mine/messages')).toHaveLength(0);
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(calls('POST /api/support-chat/mine/messages')).toHaveLength(1));
  expect(JSON.parse(String(calls('POST /api/support-chat/mine/messages')[0]![1]!.body))).toEqual({ body: 'ขอเพิ่มรายงาน' });
  await waitFor(() => expect(box).toHaveValue(''));
});

it('stays open on Escape and closes only from its own button', async () => {
  render(<SupportChat admin={false} images unread={0} />);
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  const chat = await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' });
  fireEvent.keyDown(within(chat).getByRole('textbox', { name: 'ข้อความ' }), { key: 'Escape' });
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.mouseDown(document.body);
  expect(screen.getByRole('region', { name: 'ผู้ดูแลระบบ' })).toBeInTheDocument();
  fireEvent.click(within(chat).getByRole('button', { name: 'ปิดแชต' }));
  expect(screen.queryByRole('region', { name: 'ผู้ดูแลระบบ' })).not.toBeInTheDocument();
});

it('previews a picture pasted from the clipboard, uploads it, then sends it with the message', async () => {
  routes['POST /api/support-chat/images'] = () => ({ attachmentId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10' });
  routes['POST /api/support-chat/mine/messages'] = () => ({ ok: true });
  render(<SupportChat admin={false} images unread={0} />);
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  const chat = await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' });
  const box = within(chat).getByRole('textbox', { name: 'ข้อความ' });
  const image = new File([new Uint8Array([0x89, 0x50])], 'clip.png', { type: 'image/png' });
  fireEvent.paste(box, { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }], files: [image] } });
  expect(within(chat).getByRole('img', { name: 'รูปที่จะส่ง' })).toHaveAttribute('src', 'blob:preview');
  fireEvent.click(within(chat).getByRole('button', { name: 'ส่ง' }));
  await waitFor(() => expect(calls('POST /api/support-chat/mine/messages')).toHaveLength(1));
  expect(calls('POST /api/support-chat/images')).toHaveLength(1);
  expect(JSON.parse(String(calls('POST /api/support-chat/mine/messages')[0]![1]!.body))).toEqual({ attachmentId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10' });
  await waitFor(() => expect(within(chat).queryByRole('img', { name: 'รูปที่จะส่ง' })).not.toBeInTheDocument());
});

it('hides the attach button and says so on paste when the server keeps no files', async () => {
  render(<SupportChat admin={false} images={false} unread={0} />);
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  const chat = await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' });
  expect(within(chat).queryByRole('button', { name: 'แนบรูป' })).not.toBeInTheDocument();
  const image = new File([new Uint8Array([1])], 'clip.png', { type: 'image/png' });
  fireEvent.paste(within(chat).getByRole('textbox', { name: 'ข้อความ' }), { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }], files: [image] } });
  expect(within(chat).getByRole('alert')).toHaveTextContent('ระบบยังไม่เปิดให้แนบไฟล์');
});

it('lets ผู้ดูแลระบบ keep three chats open at once; a fourth closes the oldest', async () => {
  const people = ['ก', 'ข', 'ค', 'ง'].map((name, index) => ({ id: `c${index}`, personId: `p${index}`, displayName: `คุณ${name}`, positionTitle: null, lastMessage: `เรื่อง${name}`, lastHasImage: false, lastMessageAt: '2026-11-02T03:00:00.000Z', unread: index === 0 ? 2 : 0 }));
  routes['GET /api/support-chat/conversations'] = () => ({ ok: true, conversations: people });
  for (const person of people) routes[`GET /api/support-chat/conversations/${person.id}`] = () => ({ ok: true, person: { id: person.personId, displayName: person.displayName, positionTitle: null }, messages: [] });
  render(<SupportChat admin images unread={1} />);
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  const inbox = await screen.findByRole('region', { name: 'กล่องข้อความถึงผู้ดูแลระบบ' });
  expect(await within(inbox).findByRole('button', { name: /คุณก.*เรื่องก.*2/ })).toBeInTheDocument();
  for (const person of people) fireEvent.click(within(inbox).getByRole('button', { name: new RegExp(person.displayName) }));
  await act(async () => {});
  expect(screen.queryByRole('region', { name: 'คุณก' })).not.toBeInTheDocument();
  for (const name of ['คุณข', 'คุณค', 'คุณง']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
  await waitFor(() => expect(calls('POST /api/support-chat/conversations/c3/read')).toHaveLength(1));
});
