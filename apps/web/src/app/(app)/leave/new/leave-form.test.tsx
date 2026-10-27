import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { LeaveForm } from './leave-form';

const types = [
  { id: 'lt-1', code: 'SICK', name: 'ลาป่วย', counting: 'WORKING_DAYS' as const },
  { id: 'lt-3', code: 'VACATION', name: 'ลาพักผ่อน', counting: 'WORKING_DAYS' as const }
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('LeaveForm', () => {
  it('previews days, balance and the monthly warning as dates change, then files', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/leave/preview'
      ? json({ days: 5, balance: { entitled: 10, carried: 0, used: 0, pending: 5, remaining: 5 }, warnings: [{ month: '2026-11', workingDays: 14, minimum: 15 }], medicalCertificateRequired: false, error: null })
      : json({ ok: true, requestId: 'r1', reference: 'REQ-r1', warnings: [], medicalCertificateRequired: false }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<LeaveForm types={types} />);
    fireEvent.change(screen.getByLabelText('ประเภทการลา'), { target: { value: 'lt-3' } });
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-11-06' } });
    expect(await screen.findByText('5 วันทำการ')).toBeInTheDocument();
    expect(screen.getByText(/คงเหลือหลังยื่น/)).toHaveTextContent('5');
    expect(screen.getByText('เดือน พฤศจิกายน 2569 จะเหลือวันทำการ 14 วัน ต่ำกว่าขั้นต่ำ 15 วัน')).toBeInTheDocument();
    const [, previewInit] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(JSON.parse(previewInit.body as string)).toMatchObject({ leaveTypeId: 'lt-3', startDate: '2026-11-02', endDate: '2026-11-06', startHalf: 'FULL', endHalf: 'FULL' });
    fireEvent.change(screen.getByLabelText('เหตุผลการลา'), { target: { value: 'พักผ่อน' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยื่นใบลา' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/leave/requests/r1'));
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('/api/leave');
    expect(init.method).toBe('POST');
  });

  it('shows the medical certificate notice and a Thai check error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ days: 30, balance: { entitled: 60, carried: 0, used: 0, pending: 30, remaining: 30 }, warnings: [], medicalCertificateRequired: true, error: null })));
    render(<LeaveForm types={types} />);
    fireEvent.change(screen.getByLabelText('ประเภทการลา'), { target: { value: 'lt-1' } });
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-12-11' } });
    expect(await screen.findByText('ใบลานี้ต้องมีใบรับรองแพทย์ กรุณาส่งใบรับรองแพทย์ให้งาน HR')).toBeInTheDocument();
    vi.stubGlobal('fetch', vi.fn(async () => json({ days: 2, balance: null, warnings: [], medicalCertificateRequired: false, error: 'INSUFFICIENT_BALANCE' })));
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-11-03' } });
    expect(await screen.findByText('วันลาคงเหลือไม่พอ')).toBeInTheDocument();
  });

  it('resubmits a returned ใบลา with PUT', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/leave/preview' ? json({ days: 1, balance: null, warnings: [], medicalCertificateRequired: false, error: null }) : json({ ok: true, warnings: [], medicalCertificateRequired: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LeaveForm types={types} requestId="r9" initial={{ leaveTypeId: 'lt-3', startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'FULL', endHalf: 'FULL', reason: 'เดิม', contactDuringLeave: null }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'แก้ไขและส่งใหม่' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('/api/leave/r9');
    expect(init.method).toBe('PUT');
  });

  it('keeps the file on a resubmit unless the person removes it', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/leave/preview' ? json({ days: 1, balance: null, warnings: [], medicalCertificateRequired: false, error: null }) : json({ ok: true, warnings: [], medicalCertificateRequired: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LeaveForm types={types} requestId="r9" attachments initialAttachment={{ attachmentId: 'att-1', filename: 'ใบรับรองแพทย์.pdf' }} initial={{ leaveTypeId: 'lt-1', startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'FULL', endHalf: 'FULL', reason: 'ป่วย', contactDuringLeave: null }} />);
    expect(screen.getByRole('link', { name: 'ใบรับรองแพทย์.pdf' })).toHaveAttribute('href', '/api/attachments/att-1/download');
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขและส่งใหม่' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    let [, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).attachmentId).toBe('att-1');
    fireEvent.click(screen.getByRole('button', { name: 'นำไฟล์ออก' }));
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขและส่งใหม่' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    [, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).attachmentId).toBeNull();
  });

  it('sends no attachment field while attachments are off', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/leave/preview' ? json({ days: 1, balance: null, warnings: [], medicalCertificateRequired: false, error: null }) : json({ ok: true, warnings: [], medicalCertificateRequired: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LeaveForm types={types} requestId="r9" initial={{ leaveTypeId: 'lt-1', startDate: '2026-11-02', endDate: '2026-11-02', startHalf: 'FULL', endHalf: 'FULL', reason: 'ป่วย', contactDuringLeave: null }} />);
    expect(screen.queryByLabelText('ไฟล์แนบ เช่น ใบรับรองแพทย์')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขและส่งใหม่' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('attachmentId');
  });
});
