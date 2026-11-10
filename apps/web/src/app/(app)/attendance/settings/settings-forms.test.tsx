import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { ShiftTypeForm } from './settings-forms';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('keeps the shift popup open on Esc and refuses equal start and end times', () => {
  render(<ShiftTypeForm />);
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มประเภทเวร' }));
  const form = screen.getByRole('form', { name: 'เพิ่มประเภทเวร' });
  fireEvent.change(within(form).getByLabelText('ชื่อเวร'), { target: { value: 'เวรพิเศษ' } });
  fireEvent.change(within(form).getByLabelText('เวลาเริ่ม'), { target: { value: '08:00' } });
  fireEvent.change(within(form).getByLabelText('เวลาเลิก'), { target: { value: '08:00' } });
  expect(within(form).getByText('เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน')).toBeInTheDocument();
  screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('marks an overnight shift and sends it', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'x' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ShiftTypeForm />);
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มประเภทเวร' }));
  const form = screen.getByRole('form', { name: 'เพิ่มประเภทเวร' });
  fireEvent.change(within(form).getByLabelText('ชื่อเวร'), { target: { value: 'เวรข้ามวันพิเศษ' } });
  fireEvent.change(within(form).getByLabelText('เวลาเริ่ม'), { target: { value: '19:00' } });
  fireEvent.change(within(form).getByLabelText('เวลาเลิก'), { target: { value: '07:00' } });
  expect(within(form).getByText('เลิกวันถัดไป (12 ชั่วโมง)')).toBeInTheDocument();
  fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/attendance/shift-types', expect.objectContaining({ method: 'POST' })));
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ name: 'เวรข้ามวันพิเศษ', startTime: '19:00', endTime: '07:00', earlyWindowMinutes: 60, checkoutWindowMinutes: 240 });
});
