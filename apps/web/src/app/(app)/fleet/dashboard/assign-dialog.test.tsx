import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignDialog } from './assign-dialog';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const request = { id: 'f1', reference: 'VR-2570-0001', departAt: '2026-11-10T01:00:00.000Z', returnAt: '2026-11-10T09:00:00.000Z' };
const options = {
  vehicles: [{ id: 'v1', registration: 'กข 1234', makeModel: 'Toyota Commuter', kind: 'VAN', seats: 12 }],
  drivers: [{ personId: 'd1', displayName: 'นายขับ ดี', phone: '0811111111' }],
  trips: [{ id: 't1', registration: 'นข 5678', driverName: 'นายสอง ขับ', startsAt: '2026-11-10T00:00:00.000Z', endsAt: '2026-11-10T10:00:00.000Z' }]
};

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('AssignDialog', () => {
  it('asks availability for the ใบ\'s times and offers only those options on two tabs', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/fleet/availability') ? json(options) : json({ ok: true, tripId: 't1' }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<AssignDialog request={request} onClose={vi.fn()} onDone={onDone} />);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/fleet/availability?from=2026-11-10T01%3A00%3A00.000Z&to=2026-11-10T09%3A00%3A00.000Z');
    const existing = await screen.findByRole('tab', { name: 'เข้าเที่ยวที่มีอยู่' });
    expect(existing).toHaveAttribute('aria-selected', 'true');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(1);
    expect(radios[0]!.closest('label')).toHaveTextContent('นข 5678');
    fireEvent.click(radios[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'จัดรถ' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[1]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/requests/f1/assignment');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ tripId: 't1' });
  });

  it('opens a new เที่ยวรถ with a free car and driver, times defaulting to the ใบ\'s', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/fleet/availability') ? json(options) : json({ ok: true, tripId: 't9' }, 200));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<AssignDialog request={request} onClose={vi.fn()} onDone={onDone} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'สร้างเที่ยวใหม่' }));
    const vehicle = screen.getByLabelText('รถราชการ');
    expect(within(vehicle).getAllByRole('option').map((option) => option.textContent)).toEqual(['เลือก', 'กข 1234 · Toyota Commuter · ตู้ 12 ที่นั่ง']);
    expect(within(screen.getByLabelText('พนักงานขับรถ')).getAllByRole('option').map((option) => option.textContent)).toEqual(['เลือก', 'นายขับ ดี']);
    expect(screen.getByLabelText('เริ่มเที่ยวรถ')).toHaveValue('2026-11-10T08:00');
    expect(screen.getByLabelText('สิ้นสุดเที่ยวรถ')).toHaveValue('2026-11-10T16:00');
    fireEvent.change(vehicle, { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('พนักงานขับรถ'), { target: { value: 'd1' } });
    fireEvent.change(screen.getByLabelText('สิ้นสุดเที่ยวรถ'), { target: { value: '2026-11-10T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'จัดรถ' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(JSON.parse(((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1]).body as string)).toEqual({ vehicleId: 'v1', driverPersonId: 'd1', startsAt: '2026-11-10T01:00:00.000Z', endsAt: '2026-11-10T10:00:00.000Z' });
  });

  it('shows the Thai text for a conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/fleet/availability') ? json(options) : json({ error: 'VEHICLE_BUSY' }, 409)));
    render(<AssignDialog request={request} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'สร้างเที่ยวใหม่' }));
    fireEvent.change(screen.getByLabelText('รถราชการ'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('พนักงานขับรถ'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('button', { name: 'จัดรถ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('รถราชการคันนี้มีเที่ยวรถอื่นในช่วงเวลานี้');
  });
});
