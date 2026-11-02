import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
