import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), list: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), PositionCatalogService: class { list = mocks.list; } }));

import PositionsPage from './page';

const manager = { authenticated: true, personId: 'manager', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const positions = [
  { id: 'p1', name: 'เจ้าพนักงานธุรการ', category: 'GENERAL', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], isActive: true, sortOrder: 10, holders: 3 },
  { id: 'p2', name: 'นักวิชาการพัสดุ', category: 'ACADEMIC', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ'], isActive: false, sortOrder: 20, holders: 0 },
  { id: 'p3', name: 'พนักงานขับรถยนต์', category: 'NONE', allowedLevels: [], isActive: true, sortOrder: 30, holders: 0 }
];
const ok = (body: unknown = { ok: true }, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];

function ready(session: unknown) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
  mocks.list.mockResolvedValue(positions);
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.open = false; };
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('PositionsPage', () => {
  it('refuses anyone who cannot manage positions', async () => {
    ready({ authenticated: true, personId: 'reader', roles: [{ name: 'hr-reader', organizationId: null }], dataOwnerModules: [] });
    render(await PositionsPage());
    expect(screen.getByRole('alert')).toHaveTextContent('คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('lists each position with its category, level range, holders and status, and says the list needs checking', async () => {
    ready(manager);
    render(await PositionsPage());
    expect(screen.getByRole('heading', { name: 'ตำแหน่งงาน' })).toBeInTheDocument();
    expect(screen.getByText(/ตรวจกับรายการของกระทรวงสาธารณสุข/)).toBeInTheDocument();
    const clerk = screen.getByRole('row', { name: /เจ้าพนักงานธุรการ/ });
    expect(within(clerk).getByText('ทั่วไป', { selector: 'td' })).toBeInTheDocument();
    expect(within(clerk).getByText('ปฏิบัติงาน – อาวุโส')).toBeInTheDocument();
    expect(within(clerk).getByText('3 คน')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /นักวิชาการพัสดุ/ })).getByText('ปิดใช้งาน')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /พนักงานขับรถยนต์/ })).getByText('ไม่มีระดับ', { selector: 'td:nth-child(3)' })).toBeInTheDocument();
  });

  it('adds a position with the levels ticked for its category', async () => {
    ready(manager);
    const fetchMock = ok({ ok: true, id: 'p9' });
    vi.stubGlobal('fetch', fetchMock);
    render(await PositionsPage());
    const form = screen.getByRole('form', { name: 'เพิ่มตำแหน่ง' });
    fireEvent.change(within(form).getByLabelText('ชื่อตำแหน่ง'), { target: { value: 'นักกายภาพบำบัด' } });
    fireEvent.change(within(form).getByLabelText('ประเภทตำแหน่ง'), { target: { value: 'ACADEMIC' } });
    expect(within(form).getAllByRole('checkbox', { name: /^(ปฏิบัติการ|ชำนาญการ|ชำนาญการพิเศษ|เชี่ยวชาญ|ทรงคุณวุฒิ)$/ })).toHaveLength(5);
    fireEvent.click(within(form).getByRole('checkbox', { name: 'ทรงคุณวุฒิ' }));
    fireEvent.click(within(form).getByRole('button', { name: 'เพิ่มตำแหน่ง' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/positions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'นักกายภาพบำบัด', category: 'ACADEMIC', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ'], isActive: true, sortOrder: 40 });
  });

  it('edits and closes a position, and shows a Thai message for levels with a gap', async () => {
    ready(manager);
    const fetchMock = ok({ error: 'invalid_input', fields: ['allowedLevels'] }, 400);
    vi.stubGlobal('fetch', fetchMock);
    render(await PositionsPage());
    const form = screen.getByRole('form', { name: 'แก้ไขตำแหน่ง เจ้าพนักงานธุรการ' });
    fireEvent.click(within(form).getByRole('checkbox', { name: 'ชำนาญงาน' }));
    fireEvent.click(within(form).getByRole('checkbox', { name: 'ใช้งาน' }));
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกตำแหน่ง' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('ระดับต้องเรียงต่อกัน');
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/hr/positions/p1');
    expect(JSON.parse(init.body as string)).toMatchObject({ allowedLevels: ['ปฏิบัติงาน', 'อาวุโส'], isActive: false });
  });

  it('deletes a position nobody holds after a confirmation, and offers closing instead for a held one', async () => {
    ready(manager);
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    render(await PositionsPage());
    expect(within(screen.getByRole('form', { name: 'แก้ไขตำแหน่ง เจ้าพนักงานธุรการ' })).getByRole('button', { name: 'ลบตำแหน่งนี้' })).toBeDisabled();
    expect(within(screen.getByRole('form', { name: 'แก้ไขตำแหน่ง เจ้าพนักงานธุรการ' })).getByText(/ปิดใช้งานแทนการลบ/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('form', { name: 'แก้ไขตำแหน่ง นักวิชาการพัสดุ' })).getByRole('button', { name: 'ลบตำแหน่งนี้' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันการลบ' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(lastCall(fetchMock)[0]).toBe('/api/hr/positions/p2');
    expect(lastCall(fetchMock)[1].method).toBe('DELETE');
  });

  it('imports a CSV file and reports the counts or each bad line', async () => {
    ready(manager);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, created: 1, updated: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ line: 3, code: 'LEVELS_NOT_IN_CATEGORY' }] }), { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await PositionsPage());
    const form = screen.getByRole('form', { name: 'นำเข้าตำแหน่งจากไฟล์ CSV' });
    const file = new File(['name,category,levels,active\nก,GENERAL,ปฏิบัติงาน,1\n'], 'positions.csv', { type: 'text/csv' });
    fireEvent.change(within(form).getByLabelText('ไฟล์ CSV'), { target: { files: [file] } });
    fireEvent.click(within(form).getByRole('button', { name: 'นำเข้า' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('เพิ่ม 1 ตำแหน่ง ปรับปรุง 2 ตำแหน่ง');
    expect(JSON.parse(lastCall(fetchMock)[1].body as string)).toEqual({ csv: 'name,category,levels,active\nก,GENERAL,ปฏิบัติงาน,1\n' });
    fireEvent.click(within(form).getByRole('button', { name: 'นำเข้า' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('บรรทัด 3: ระดับไม่ตรงกับประเภทตำแหน่ง');
  });
});
