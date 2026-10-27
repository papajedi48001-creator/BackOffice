import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

const items = [
  { id: 'n-1', moduleLabel: 'การลา', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' },
  { id: 'n-2', moduleLabel: 'จองห้องประชุม', subject: 'ไม่อนุมัติ > ผู้รับผิดชอบ (RB-2569-0001)', readAt: '2026-10-26T04:00:00.000Z', createdAt: '2026-10-25T03:00:00.000Z' }
];

it('shows the unread count and lists only notices not yet read', () => {
  render(<NotificationBell unread={1} items={items} />);
  const bell = screen.getByRole('button', { name: 'การแจ้งเตือนล่าสุด 1 การแจ้งเตือนที่ยังไม่อ่าน' });
  expect(bell).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(bell);
  expect(bell).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /การลา.*อนุมัติ > หัวหน้ากลุ่มการพยาบาล/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /จองห้องประชุม/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ดูการแจ้งเตือนทั้งหมด' })).toHaveAttribute('href', '/notifications');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(bell).toHaveAttribute('aria-expanded', 'false');
});

it('marks a notice read and opens its page', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ href: '/leave/requests/r-1' }), { status: 200 }));
  render(<NotificationBell unread={1} items={items} />);
  fireEvent.click(screen.getByRole('button', { name: /การแจ้งเตือนล่าสุด/ }));
  fireEvent.click(screen.getByRole('button', { name: /การลา/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/leave/requests/r-1'));
  expect(fetchMock).toHaveBeenCalledWith('/api/notifications/n-1/read', { method: 'PATCH' });
});

it('is not shown at all when nothing is left unread', () => {
  const { container } = render(<NotificationBell unread={0} items={[]} />);
  expect(container).toBeEmptyDOMElement();
});
