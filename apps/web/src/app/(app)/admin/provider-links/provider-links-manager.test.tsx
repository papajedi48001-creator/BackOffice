import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderLinksManager } from './provider-links-manager';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const pending = [{ id: '1c7a4d2f-6e2b-4d9f-8b62-3a8d2eaf9c21', displayName: 'สมชาย ใจดี', lastSeenAt: '2026-11-09T06:30:00.000Z' }];
const links = [{ personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', personName: 'นางมาลัย ข้อมูลจำลอง', displayName: 'มาลัย ข.', linkedAt: '2026-11-08T02:00:00.000Z', linkedByAdmin: true }];

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('ProviderLinksManager', () => {
  it('lists pending logins and linked people with Bangkok time', () => {
    render(<ProviderLinksManager pending={pending} links={links} />);
    const tables = screen.getAllByRole('table');
    expect(within(tables[0]!).getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(tables[0]).toHaveTextContent('13:30');
    expect(within(tables[1]!).getByText('นางมาลัย ข้อมูลจำลอง')).toBeInTheDocument();
    expect(tables[1]).toHaveTextContent('ผู้ดูแลระบบผูกให้');
  });

  it('shows empty states', () => {
    render(<ProviderLinksManager pending={[]} links={[]} />);
    expect(screen.getByText('ไม่มีบัญชีที่รอผูก')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่มีบุคลากรที่ผูกบัญชี Provider ID')).toBeInTheDocument();
  });

  it('links a pending login in a FormDialog that Escape does not close', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/admin/people?') ? json({ people: [{ personId: links[0]!.personId, displayName: 'นางมาลัย ข้อมูลจำลอง', employeeCode: 'ADM003', organizationName: null }] }) : json({ ok: true }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProviderLinksManager pending={pending} links={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ผูกกับบุคลากร สมชาย ใจดี' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/ค้นหาบุคลากร/), { target: { value: 'มาลัย' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'เลือก นางมาลัย ข้อมูลจำลอง' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'ผูกบัญชี' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/provider-links', expect.objectContaining({ method: 'POST', body: JSON.stringify({ pendingId: pending[0]!.id, personId: links[0]!.personId }) })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows the conflict when the person is linked elsewhere', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/admin/people?') ? json({ people: [{ personId: links[0]!.personId, displayName: 'นางมาลัย ข้อมูลจำลอง', employeeCode: null, organizationName: null }] }) : json({ error: 'ALREADY_LINKED' }, 409)));
    render(<ProviderLinksManager pending={pending} links={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ผูกกับบุคลากร สมชาย ใจดี' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/ค้นหาบุคลากร/), { target: { value: 'มาลัย' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'เลือก นางมาลัย ข้อมูลจำลอง' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'ผูกบัญชี' }));
    expect(await within(dialog).findByText('บุคลากรนี้ผูกกับบัญชี Provider ID อื่นแล้ว ยกเลิกการผูกเดิมก่อน')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('unlinks in an ActionDialog that requires a reason', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProviderLinksManager pending={[]} links={links} />);
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการผูก นางมาลัย ข้อมูลจำลอง' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'ยกเลิกการผูก' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'ผูกผิดคน' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/admin/provider-links/${links[0]!.personId}`, expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ reason: 'ผูกผิดคน' }) })));
  });
});

describe('ProviderLinksManager search', () => {
  const many = [...links, { personId: 'p2', personName: 'นายวสันต์ มีคุณ', displayName: 'วสันต์ มีคุณ', linkedAt: '2026-11-12T07:57:00.000Z', linkedByAdmin: false }];
  it('filters both lists by name in a search card, with a count and ล้างตัวกรอง', () => {
    render(<ProviderLinksManager pending={pending} links={many} />);
    const card = screen.getByRole('search');
    expect(card).toHaveClass('search-card');
    expect(within(card).getByText('แสดง 3 จาก 3 รายการ')).toBeInTheDocument();
    fireEvent.change(within(card).getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'วสันต์' } });
    expect(screen.queryByText('สมชาย ใจดี')).toBeNull();
    expect(screen.queryByText('นางมาลัย ข้อมูลจำลอง')).toBeNull();
    expect(screen.getByText('นายวสันต์ มีคุณ')).toBeInTheDocument();
    expect(within(card).getByText('แสดง 1 จาก 3 รายการ')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(screen.getByText('นางมาลัย ข้อมูลจำลอง')).toBeInTheDocument();
  });

  it('matches the name from Provider ID too, and says when nothing matches', () => {
    render(<ProviderLinksManager pending={[]} links={many} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'มาลัย ข.' } });
    expect(screen.getByText('นางมาลัย ข้อมูลจำลอง')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'ไม่มีใคร' } });
    expect(screen.getByText('ไม่พบรายชื่อที่ตรงกับคำค้น')).toBeInTheDocument();
  });
});
