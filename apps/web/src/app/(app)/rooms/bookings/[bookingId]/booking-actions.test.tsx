import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookingActions } from './booking-actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });

it('shows only the cancel action to a booker', () => {
  render(<BookingActions bookingId="b1" canDecide={false} cancelAction="cancel" />);
  expect(screen.getByRole('button', { name: 'ยกเลิกการจอง' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'อนุมัติ' })).not.toBeInTheDocument();
});

it('offers to release the remaining days once the booking is under way', () => {
  render(<BookingActions bookingId="b1" canDecide={false} cancelAction="release" />);
  expect(screen.getByRole('button', { name: 'คืนวันที่เหลือ' })).toBeInTheDocument();
});

it('approves after confirming in the popup', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  render(<BookingActions bookingId="b1" canDecide cancelAction={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }));
  expect(screen.getByRole('dialog', { name: 'อนุมัติ' })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/rooms/bookings/b1/decision', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) }));
});

it('asks for a reason in the popup before rejecting', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  render(<BookingActions bookingId="b1" canDecide cancelAction="cancel" />);

  fireEvent.click(screen.getByRole('button', { name: 'ไม่อนุมัติ' }));
  expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('เหตุผล'), { target: { value: 'ห้องปิดปรับปรุง' } });
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/rooms/bookings/b1/decision', expect.objectContaining({ body: JSON.stringify({ decision: 'REJECT', reason: 'ห้องปิดปรับปรุง' }) })));
});

it('shows the Thai error in the popup when the server refuses', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'CANCEL_NOT_ALLOWED' }), { status: 409 }));
  render(<BookingActions bookingId="b1" canDecide={false} cancelAction="cancel" />);
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการจอง' }));
  fireEvent.change(screen.getByLabelText('เหตุผล'), { target: { value: 'เลื่อน' } });
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถยกเลิกการจองนี้ได้แล้ว');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
