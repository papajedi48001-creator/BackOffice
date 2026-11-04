import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookingForm } from './booking-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

const rooms = [{ id: 'room-1', name: 'ห้องประชุม 1', capacity: 20, place: 'อาคารอำนวยการ' }];
const addons = [{ id: 'projector', name: 'โปรเจกเตอร์', unit: 'เครื่อง' }];

function fill() {
  render(<BookingForm rooms={rooms} addons={addons} today="2026-11-01" />);
  fireEvent.change(screen.getByLabelText('วันที่เริ่ม'), { target: { value: '2026-11-05' } });
  fireEvent.change(screen.getByLabelText('วันที่สิ้นสุด'), { target: { value: '2026-11-07' } });
  fireEvent.change(screen.getByLabelText('เวลาเริ่ม'), { target: { value: '540' } });
  fireEvent.change(screen.getByLabelText('เวลาสิ้นสุด'), { target: { value: '720' } });
  fireEvent.change(screen.getByLabelText('หัวข้อการประชุม'), { target: { value: 'อบรมพยาบาลใหม่' } });
  fireEvent.change(screen.getByLabelText('จำนวนผู้เข้าประชุม'), { target: { value: '15' } });
}

it('submits the chosen range minus the days the booker leaves out', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'booking-1', reference: 'RB-2569-0001', status: 'PENDING' }), { status: 201 }));
  fill();
  fireEvent.click(screen.getByRole('checkbox', { name: /ศุกร์ 6 พ.ย. 2569/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'โปรเจกเตอร์' }));
  fireEvent.click(screen.getByRole('button', { name: 'ยื่นจองห้อง' }));

  await waitFor(() => expect(push).toHaveBeenCalledWith('/rooms/bookings/booking-1'));
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ roomId: 'room-1', dates: ['2026-11-05', '2026-11-07'], startMinute: 540, endMinute: 720, title: 'อบรมพยาบาลใหม่', attendeeCount: 15, addons: [{ addonId: 'projector', quantity: 1, note: '' }] });
});

it('lists the days that clash when the room is taken', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'BOOKING_CONFLICT', conflicts: [{ startsAt: '2026-11-06T03:00:00.000Z', endsAt: '2026-11-06T05:00:00.000Z' }] }), { status: 409 }));
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'ยื่นจองห้อง' }));

  expect(await screen.findByText('ช่วงเวลานี้มีการจองแล้วในวันต่อไปนี้')).toBeInTheDocument();
  expect(screen.getByText('ศุกร์ 6 พ.ย. 2569 10:00–12:00')).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

it('shows the Thai message for a rule the server rejects', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'OVER_CAPACITY' }), { status: 400 }));
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'ยื่นจองห้อง' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('จำนวนผู้เข้าประชุมเกินความจุห้อง');
});

it('moves the end date to the start date when the start is picked after it', () => {
  render(<BookingForm rooms={rooms} addons={addons} today="2026-11-01" />);
  fireEvent.change(screen.getByLabelText('วันที่เริ่ม'), { target: { value: '2026-12-03' } });
  expect(screen.getByLabelText('วันที่สิ้นสุด')).toHaveValue('03/12/2569');
  expect(screen.getAllByRole('checkbox', { name: /ธ\.ค\. 2569/ })).toHaveLength(1);
});

it('limits the end date to 14 days and 90 days ahead, and refuses a longer range instead of cutting it short', () => {
  render(<BookingForm rooms={rooms} addons={addons} today="2026-11-01" />);
  fireEvent.change(screen.getByLabelText('วันที่เริ่ม'), { target: { value: '2026-11-05' } });
  expect(screen.getByLabelText('วันที่สิ้นสุด')).toHaveAttribute('data-max', '2026-11-18');
  expect(screen.getByLabelText('วันที่เริ่ม')).toHaveAttribute('data-max', '2027-01-30');

  fireEvent.change(screen.getByLabelText('วันที่สิ้นสุด'), { target: { value: '2026-11-25' } });
  // The Thai date field refuses a day past the 14-day limit itself, so the range is never silently cut short.
  expect(screen.getByRole('alert')).toHaveTextContent('เลือกได้ถึง พุธ 18 พ.ย. 2569');
  expect(screen.getByLabelText('วันที่สิ้นสุด')).toBeInvalid();
});

it('leaves a วันหยุด out of the days, names it, and shows the server refusal naming the holiday', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'BOOKING_ON_HOLIDAY', holidays: [{ date: '2026-11-07', name: 'วันหยุดพิเศษ' }] }), { status: 409 }));
  render(<BookingForm rooms={rooms} addons={addons} today="2026-11-01" holidays={[{ date: '2026-11-06', name: 'วันหยุดชดเชย' }]} />);
  fireEvent.change(screen.getByLabelText('วันที่เริ่ม'), { target: { value: '2026-11-05' } });
  fireEvent.change(screen.getByLabelText('วันที่สิ้นสุด'), { target: { value: '2026-11-07' } });
  fireEvent.change(screen.getByLabelText('หัวข้อการประชุม'), { target: { value: 'ประชุม' } });
  const holiday = screen.getByRole('checkbox', { name: /ศุกร์ 6 พ.ย. 2569\s*· วันหยุด วันหยุดชดเชย/ }) as HTMLInputElement;
  expect(holiday.disabled).toBe(true);
  expect(holiday.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'ยื่นจองห้อง' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('จองไม่ได้ เพราะ เสาร์ 7 พ.ย. 2569 เป็นวันหยุด (วันหยุดพิเศษ)'));
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).dates).toEqual(['2026-11-05', '2026-11-07']);
});
