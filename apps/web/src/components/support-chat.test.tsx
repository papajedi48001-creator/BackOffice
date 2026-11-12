import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SupportChat } from './support-chat';

type Handler = (url: string, init?: RequestInit) => unknown;
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  closed = false;
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent) => void) { (this.listeners[type] ??= []).push(listener); }
  close() { this.closed = true; }
  emit(state: { unread: number; lastMessageAt: string | null; conversationId: string | null }) {
    act(() => { for (const listener of this.listeners.chat ?? []) listener(new MessageEvent('chat', { data: JSON.stringify(state) })); });
  }
}
const stream = () => FakeEventSource.instances.at(-1)!;
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
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); document.title = ''; });

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

it('listens live and raises the count the moment a reply arrives, without polling', () => {
  render(<SupportChat admin={false} images unread={0} />);
  expect(stream().url).toBe('/api/support-chat/stream');
  stream().emit({ unread: 0, lastMessageAt: '2026-11-12T14:00:00.000000Z', conversationId: 'c1' });
  expect(screen.getByRole('button', { name: 'แชตกับผู้ดูแลระบบ' })).toBeInTheDocument();
  stream().emit({ unread: 2, lastMessageAt: '2026-11-12T14:01:00.000000Z', conversationId: 'c1' });
  expect(screen.getByRole('button', { name: 'แชตกับผู้ดูแลระบบ 2 ข้อความที่ยังไม่อ่าน' })).toBeInTheDocument();
  expect(calls('GET /api/support-chat/summary')).toHaveLength(0);
});

it('opens the person\'s chat by itself when ผู้ดูแลระบบ replies, and flags the tab while it is hidden', async () => {
  document.title = 'Back Office';
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  render(<SupportChat admin={false} images unread={0} />);
  stream().emit({ unread: 0, lastMessageAt: 'a', conversationId: 'c1' });
  expect(screen.queryByRole('region', { name: 'ผู้ดูแลระบบ' })).not.toBeInTheDocument();
  stream().emit({ unread: 1, lastMessageAt: 'b', conversationId: 'c1' });
  expect(await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' })).toBeInTheDocument();
  expect(document.title).toBe('(1) ข้อความใหม่ · Back Office');
  hidden.mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(document.title).toBe('Back Office');
});

it('reloads an open chat the moment the stream says something changed', async () => {
  render(<SupportChat admin={false} images unread={0} />);
  stream().emit({ unread: 0, lastMessageAt: 'a', conversationId: 'c1' });
  fireEvent.click(screen.getByRole('button', { name: /แชตกับผู้ดูแลระบบ/ }));
  await screen.findByRole('region', { name: 'ผู้ดูแลระบบ' });
  await waitFor(() => expect(calls('GET /api/support-chat/mine')).toHaveLength(1));
  stream().emit({ unread: 0, lastMessageAt: 'b', conversationId: 'c1' });
  await waitFor(() => expect(calls('GET /api/support-chat/mine')).toHaveLength(2));
});

it('opens the waiting conversation for ผู้ดูแลระบบ by itself when a person writes', async () => {
  routes['GET /api/support-chat/conversations'] = () => ({ ok: true, conversations: [{ id: 'c9', personId: 'p9', displayName: 'คุณใหม่', positionTitle: null, lastMessage: 'สวัสดี', lastHasImage: false, lastMessageAt: 'b', unread: 1 }] });
  routes['GET /api/support-chat/conversations/c9'] = () => ({ ok: true, person: { id: 'p9', displayName: 'คุณใหม่', positionTitle: null }, messages: [] });
  render(<SupportChat admin images unread={0} />);
  stream().emit({ unread: 0, lastMessageAt: 'a', conversationId: null });
  stream().emit({ unread: 1, lastMessageAt: 'b', conversationId: 'c9' });
  expect(await screen.findByRole('region', { name: 'คุณใหม่' })).toBeInTheDocument();
});

it('closes the live connection when the page goes away', () => {
  const { unmount } = render(<SupportChat admin={false} images unread={0} />);
  unmount();
  expect(stream().closed).toBe(true);
});
