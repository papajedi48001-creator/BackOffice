import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeopleTable } from './people-table';

const base = { employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', organizationCode: null };
const people = [
  { ...base, id: 'p1', employeeCode: 'NUR001', displayName: 'นางมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentTypeName: 'ข้าราชการ', organizationName: 'กลุ่มงานการพยาบาล' },
  { ...base, id: 'p2', employeeCode: 'PT001', displayName: 'นายสมชาย ใจดี', positionTitle: 'นักกายภาพบำบัด', employmentTypeName: 'พนักงานราชการ', organizationName: 'งานกายภาพบำบัด' },
  { ...base, id: 'p3', employeeCode: 'NUR002', displayName: 'นางสาวสมศรี ทดสอบ', positionTitle: 'พยาบาลวิชาชีพ', employmentTypeName: 'พนักงานราชการ', organizationName: null }
];
const names = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('link').map((link) => link.textContent);

describe('PeopleTable', () => {
  it('searches by name or code', () => {
    render(<PeopleTable people={people} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'สมชาย' } });
    expect(names()).toEqual(['นายสมชาย ใจดี']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'nur00' } });
    expect(names()).toEqual(['นางมาลี ดีงาม', 'นางสาวสมศรี ทดสอบ']);
  });

  it('filters by position, employment type and unit together, including ยังไม่ระบุ', () => {
    render(<PeopleTable people={people} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'พยาบาลวิชาชีพ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ประเภทการจ้าง' }), { target: { value: 'พนักงานราชการ' } });
    expect(names()).toEqual(['นางสาวสมศรี ทดสอบ']);
    fireEvent.change(screen.getByRole('combobox', { name: 'ประเภทการจ้าง' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'หน่วยงาน' }), { target: { value: '__none__' } });
    expect(names()).toEqual(['นางสาวสมศรี ทดสอบ']);
    expect(screen.getByText('แสดง 1 จาก 3 คน')).toBeInTheDocument();
  });

  it('says when nothing matches', () => {
    render(<PeopleTable people={people} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'ไม่มีคนนี้' } });
    expect(screen.getByText('ไม่พบบุคลากรที่ตรงกับเงื่อนไข')).toBeInTheDocument();
  });

  it('keeps the search, filters, count and ล้างตัวกรอง together in one card', () => {
    render(<PeopleTable people={people} />);
    const card = screen.getByRole('search');
    expect(card).toHaveClass('search-card');
    expect(within(card).getByRole('searchbox', { name: 'ค้นหารายชื่อ' })).toBeInTheDocument();
    expect(within(card).getAllByRole('combobox')).toHaveLength(3);
    expect(within(card).getByText('แสดง 3 จาก 3 คน')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'ล้างตัวกรอง' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'สมชาย' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'นักกายภาพบำบัด' } });
    fireEvent.click(within(card).getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' })).toHaveValue('');
    expect(names()).toHaveLength(3);
  });

  it('shows the page heading with its actions', () => {
    render(<PeopleTable people={people} actions={<a href="/hr/people/new">เพิ่มบุคลากร</a>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'ทะเบียนบุคลากร' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มบุคลากร' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งออกข้อมูล' })).toBeNull();
  });

  it('ส่งออกข้อมูล downloads the people on screen, sending the search in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('\uFEFFcsv', { status: 200, headers: { 'content-disposition': 'attachment; filename="people-2026-11-17.csv"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:people');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PeopleTable people={people} canExport />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายชื่อ' }), { target: { value: 'สมชาย' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'หน่วยงาน' }), { target: { value: '__none__' } });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งออกข้อมูล' }));
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/hr/people/export');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ query: 'สมชาย', positionTitle: '', employmentTypeName: '', organizationName: '__none__' });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('says when the export fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    render(<PeopleTable people={people} canExport />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งออกข้อมูล' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ส่งออกข้อมูลไม่สำเร็จ ลองอีกครั้ง');
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
