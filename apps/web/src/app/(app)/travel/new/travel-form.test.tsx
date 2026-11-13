import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { TravelForm } from './travel-form';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const leader = { personId: 'person-a', displayName: 'นางพรทิพย์ ใจดี', organizationName: 'งานผู้ป่วยใน' };

function fillTrip() {
  fireEvent.change(screen.getByLabelText('เรื่อง'), { target: { value: 'ประชุมวิชาการ' } });
  fireEvent.change(screen.getByLabelText('หน่วยงานผู้จัด'), { target: { value: 'สสจ.มหาสารคาม' } });
  fireEvent.change(screen.getByLabelText('สถานที่'), { target: { value: 'ศาลากลาง' } });
  fireEvent.change(screen.getByLabelText('จังหวัด / ประเทศ'), { target: { value: 'มหาสารคาม' } });
  fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2026-11-10' } });
  fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-11-11' } });
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('TravelForm', () => {
  it('keeps the หัวหน้าคณะ first, adds people from a search and totals the costs', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/travel/people') ? json({ people: [{ personId: 'person-b', displayName: 'นายสมชาย ดีมาก', organizationName: 'งานเภสัชกรรม' }] }) : json({ ok: true, travelId: 'travel-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<TravelForm leader={leader} />);
    const people = screen.getByRole('list', { name: 'ผู้ร่วมเดินทาง' });
    expect(within(people).getAllByRole('listitem')[0]).toHaveTextContent('นางพรทิพย์ ใจดี');
    expect(within(people).getAllByRole('listitem')[0]).toHaveTextContent('หัวหน้าคณะ');
    fireEvent.change(screen.getByLabelText('ค้นหาชื่อบุคลากร'), { target: { value: 'สมชาย' } });
    fireEvent.click(await screen.findByRole('button', { name: 'เพิ่ม นายสมชาย ดีมาก' }));
    expect(within(people).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('ค่าที่พัก (บาท)'), { target: { value: '1500.5' } });
    fireEvent.change(screen.getByLabelText('ค่าลงทะเบียน (บาท)'), { target: { value: '2000' } });
    expect(screen.getByText('รวม 3,500.50 บาท')).toBeInTheDocument();
    fillTrip();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งขออนุมัติ' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/travel/travel-1'));
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('/api/travel');
    expect(JSON.parse(init.body as string)).toMatchObject({ subject: 'ประชุมวิชาการ', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', costLodging: 1500.5, costRegistration: 2000, costAllowance: 0, memberPersonIds: ['person-b'], startDate: '2026-11-10', endDate: '2026-11-11' });
  });

  it('sends the หนังสือเชิญ, a combined vehicle and a source for each cost item', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, travelId: 'travel-2' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<TravelForm leader={leader} />);
    fillTrip();
    expect(screen.queryByLabelText('แหล่งงบประมาณ')).toBeNull();
    fireEvent.change(screen.getByLabelText('เลขที่หนังสือเชิญ'), { target: { value: 'มค 0033/ว 123' } });
    fireEvent.change(screen.getByLabelText('ลงวันที่'), { target: { value: '2026-10-30' } });
    fireEvent.change(screen.getByLabelText('หน่วยงานที่ออกหนังสือ'), { target: { value: 'สสจ.มหาสารคาม' } });
    fireEvent.change(screen.getByLabelText('พาหนะ'), { target: { value: 'GOVERNMENT_CAR_AIRPLANE' } });
    expect(screen.getByRole('option', { name: 'รถส่วนตัว + เครื่องบิน' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ค่าที่พัก (บาท)'), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText('แหล่งงบ ค่าที่พัก'), { target: { value: 'ORGANISER' } });
    fireEvent.change(screen.getByLabelText('ค่าลงทะเบียน (บาท)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งขออนุมัติ' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/travel/travel-2'));
    const [, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ vehicle: 'GOVERNMENT_CAR_AIRPLANE', invitationNumber: 'มค 0033/ว 123', invitationDate: '2026-10-30', invitationIssuer: 'สสจ.มหาสารคาม', costFunding: { allowance: 'HOSPITAL_FUND', lodging: 'ORGANISER', transport: 'HOSPITAL_FUND', registration: 'HOSPITAL_FUND' } });
    expect(body).not.toHaveProperty('fundingSource');
  });

  it('names the person a rule failed for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'OVERLAPS_LEAVE', personId: 'person-a' }, 400)));
    render(<TravelForm leader={leader} />);
    fillTrip();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งขออนุมัติ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('นางพรทิพย์ ใจดี: มีใบลาในช่วงวันที่นี้');
  });

  it('sends the attached หนังสือเชิญ, or explains the old way while attachments are off', async () => {
    const fetchMock = vi.fn(async (url: string) => url === '/api/attachments' ? json({ attachmentId: 'att-1', filename: 'เชิญ.pdf', contentType: 'application/pdf', sizeBytes: 8 }, 201) : json({ ok: true, travelId: 'travel-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<TravelForm leader={leader} />);
    expect(screen.getByText('หนังสือเชิญ: ระบบยังแนบไฟล์ไม่ได้ ให้ส่งสำเนาตามช่องทางเดิม')).toBeInTheDocument();
    expect(screen.queryByLabelText('หนังสือเชิญหรือเอกสารประกอบ')).not.toBeInTheDocument();
    unmount();
    render(<TravelForm leader={leader} attachments />);
    fillTrip();
    fireEvent.change(screen.getByLabelText('หนังสือเชิญหรือเอกสารประกอบ'), { target: { files: [new File(['%PDF-1.7'], 'เชิญ.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('link', { name: 'เชิญ.pdf' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งขออนุมัติ' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('/api/travel');
    expect(JSON.parse(init.body as string).attachmentId).toBe('att-1');
  });
});
