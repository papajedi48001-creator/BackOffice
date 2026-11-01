import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { DriverRow } from './driver-form';
import { VehicleForm } from './vehicle-form';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });
const ok = () => vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

it('adds a vehicle from a popup and closes it once saved', async () => {
  const fetchMock = ok();
  vi.stubGlobal('fetch', fetchMock);
  render(<VehicleForm />);
  expect(screen.queryByRole('form')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรถราชการ' }));
  const form = screen.getByRole('form', { name: 'เพิ่มรถราชการ' });
  fireEvent.change(within(form).getByLabelText('ทะเบียน'), { target: { value: 'กข 1234' } });
  fireEvent.change(within(form).getByLabelText('ยี่ห้อ/รุ่น'), { target: { value: 'รถตู้ทดสอบ' } });
  fireEvent.submit(form);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith('/api/fleet/vehicles', expect.objectContaining({ method: 'POST' }));
});

it('edits a vehicle in a popup', async () => {
  const fetchMock = ok();
  vi.stubGlobal('fetch', fetchMock);
  render(<VehicleForm vehicle={{ id: 'v1', registration: 'กข 1234', makeModel: 'รถตู้ทดสอบ', kind: 'VAN', seats: 12, status: 'ACTIVE', note: '' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข กข 1234' }));
  fireEvent.submit(screen.getByRole('form', { name: 'แก้ไข กข 1234' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fleet/vehicles/v1', expect.objectContaining({ method: 'PUT' })));
});

it('changes a driver\'s work phone in a popup', async () => {
  const fetchMock = ok();
  vi.stubGlobal('fetch', fetchMock);
  render(<table><tbody><DriverRow driver={{ personId: 'p1', displayName: 'สมชาย ขับดี', phone: '0800000000', isActive: true }} /></tbody></table>);
  expect(screen.getByText('0800000000')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข สมชาย ขับดี' }));
  fireEvent.change(screen.getByLabelText('โทรศัพท์ที่ทำงาน'), { target: { value: '0811111111' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'บันทึก' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith('/api/fleet/drivers/p1', expect.objectContaining({ body: JSON.stringify({ phone: '0811111111', isActive: true }) }));
});
