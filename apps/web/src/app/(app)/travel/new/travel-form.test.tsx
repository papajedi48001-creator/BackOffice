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
    expect(JSON.parse(init.body as string)).toMatchObject({ subject: 'ประชุมวิชาการ', travelType: 'IN_PROVINCE', vehicle: 'GOVERNMENT_CAR', fundingSource: 'HOSPITAL_FUND', costLodging: 1500.5, costRegistration: 2000, costAllowance: 0, memberPersonIds: ['person-b'], startDate: '2026-11-10', endDate: '2026-11-11' });
  });

  it('names the person a rule failed for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'OVERLAPS_LEAVE', personId: 'person-a' }, 400)));
    render(<TravelForm leader={leader} />);
    fillTrip();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งขออนุมัติ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('นางพรทิพย์ ใจดี: มีใบลาในช่วงวันที่นี้');
  });
});
