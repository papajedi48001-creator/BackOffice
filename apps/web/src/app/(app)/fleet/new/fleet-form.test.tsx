import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { FleetForm } from './fleet-form';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const initial = { purpose: 'ประชุมวิชาการ', destination: 'โรงแรมตักสิลา', province: 'มหาสารคาม', departAt: '2026-11-10T13:00', returnAt: '2026-11-11T12:00', passengerCount: '2', passengerNames: 'นางพรทิพย์ ใจดี, นายสมชาย ดีมาก' };

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('FleetForm', () => {
  it('sends Bangkok times as UTC and the trip it was filed from, then opens the ใบ', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, fleetRequestId: 'f1' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<FleetForm initial={initial} officialTravelId="travel-1" />);
    expect(screen.getByLabelText('ปลายทาง')).toHaveValue('โรงแรมตักสิลา');
    expect(screen.getByLabelText('เวลาออก')).toHaveAttribute('step', '900');
    fireEvent.change(screen.getByLabelText('จำนวนผู้โดยสาร'), { target: { value: '3' } });
    const contact = screen.getByLabelText(/เบอร์ติดต่อระหว่างเดินทาง/);
    expect(contact).not.toBeRequired();
    expect(contact).toHaveAttribute('type', 'tel');
    fireEvent.change(contact, { target: { value: ' 081-234-5678 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งใบขอใช้รถ' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/fleet/requests/f1'));
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/requests');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ purpose: 'ประชุมวิชาการ', destination: 'โรงแรมตักสิลา', province: 'มหาสารคาม', departAt: '2026-11-10T06:00:00.000Z', returnAt: '2026-11-11T05:00:00.000Z', passengerCount: 3, passengerNames: 'นางพรทิพย์ ใจดี, นายสมชาย ดีมาก', contactPhone: '081-234-5678', officialTravelId: 'travel-1' });
  });

  it('shows the Thai text for a rule the server refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'TOO_FAR_AHEAD' }, 400)));
    render(<FleetForm initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งใบขอใช้รถ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ยื่นล่วงหน้าได้ไม่เกิน 90 วัน');
  });

  it('resubmits a returned ใบ with PUT', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<FleetForm initial={initial} fleetRequestId="f1" />);
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขและส่งใหม่' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/requests/f1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).not.toHaveProperty('officialTravelId');
  });
});
