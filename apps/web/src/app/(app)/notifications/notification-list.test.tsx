import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationList } from './notification-list';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

it('marks an unread Thai notification read before opening its request', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ href: '/requests/request-1' }), { status: 200 }));
  render(<NotificationList notifications={[{ id: 'notice-1', requestId: 'request-1', moduleLabel: 'คำขอ', subject: 'มีคำขอรอพิจารณา', readAt: null, createdAt: '2026-10-02T00:00:00.000Z' }]} />);

  expect(screen.getByText('ยังไม่อ่าน')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '[คำขอ] มีคำขอรอพิจารณา' }));

  await waitFor(() => expect(push).toHaveBeenCalledWith('/requests/request-1'));
  expect(fetch).toHaveBeenCalledWith('/api/notifications/notice-1/read', { method: 'PATCH' });
});

it('renders the Thai empty state', () => {
  render(<NotificationList notifications={[]} />);
  expect(screen.getByText('ยังไม่มีการแจ้งเตือนใหม่')).toBeInTheDocument();
});

it('opens a room booking notification at its target page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ href: '/rooms/bookings/booking-1' }), { status: 200 }));
  render(<NotificationList notifications={[{ id: 'notice-2', requestId: null, moduleLabel: 'จองห้องประชุม', subject: 'การจองห้องได้รับอนุมัติ', readAt: null, createdAt: '2026-10-21T00:00:00.000Z' }]} />);

  fireEvent.click(screen.getByRole('button', { name: '[จองห้องประชุม] การจองห้องได้รับอนุมัติ' }));

  await waitFor(() => expect(push).toHaveBeenCalledWith('/rooms/bookings/booking-1'));
});
