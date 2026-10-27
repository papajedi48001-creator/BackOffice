import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ProfileForm, type ProfileFormValues } from './hr-profile-forms';

const units = [
  { id: 'nur', name: 'กลุ่มการพยาบาล', unitType: 'DIVISION', parentId: 'hosp' },
  { id: 'med', name: 'กลุ่มงานการแพทย์', unitType: 'DIVISION', parentId: 'hosp' },
  { id: 'ipd', name: 'งานผู้ป่วยใน', unitType: 'SECTION', parentId: 'nur' },
  { id: 'er', name: 'งานอุบัติเหตุฉุกเฉิน', unitType: 'SECTION', parentId: 'nur' },
  { id: 'opd-med', name: 'งานผู้ป่วยนอก', unitType: 'SECTION', parentId: 'med' }
];
const values: ProfileFormValues = { namePrefix: 'นาง', firstName: 'สมใจ', lastName: 'ใจเพชร', gender: 'FEMALE', birthDate: null, employmentTypeId: null, appointedOn: null, positionTitle: null, positionLevel: null, organizationId: 'ipd' };
const options = (listId: string) => Array.from(document.querySelectorAll(`datalist#${listId} option`)).map((option) => option.getAttribute('value'));
const sent = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('ProfileForm กลุ่มงาน and งาน', () => {
  it('shows the person\'s กลุ่มงาน and งาน and suggests only the งาน of the chosen กลุ่มงาน', () => {
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} />);
    const division = screen.getByRole('combobox', { name: 'กลุ่มงาน' });
    const section = screen.getByRole('combobox', { name: 'งาน' });
    expect(division).toHaveValue('กลุ่มการพยาบาล');
    expect(section).toHaveValue('งานผู้ป่วยใน');
    expect(options(division.getAttribute('list')!)).toEqual(['กลุ่มการพยาบาล', 'กลุ่มงานการแพทย์']);
    expect(options(section.getAttribute('list')!)).toEqual(['งานผู้ป่วยใน', 'งานอุบัติเหตุฉุกเฉิน']);
    fireEvent.change(division, { target: { value: 'กลุ่มงานการแพทย์' } });
    expect(section).toHaveValue('');
    expect(options(section.getAttribute('list')!)).toEqual(['งานผู้ป่วยนอก']);
  });

  it('saves the งาน when chosen, the กลุ่มงาน otherwise, and null when both are empty', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} />);
    const division = screen.getByRole('combobox', { name: 'กลุ่มงาน' });
    const section = screen.getByRole('combobox', { name: 'งาน' });
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));

    fireEvent.change(section, { target: { value: 'งานอุบัติเหตุฉุกเฉิน' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).organizationId).toBe('er');

    fireEvent.change(section, { target: { value: '' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(fetchMock).organizationId).toBe('nur');

    fireEvent.change(division, { target: { value: '' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(sent(fetchMock).organizationId).toBeNull();
  });

  it('refuses a name that matches no unit without saving', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'กลุ่มงาน' }), { target: { value: 'กลุ่มที่ไม่มี' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่พบกลุ่มงานนี้ กรุณาเลือกจากรายการ');
    fireEvent.change(screen.getByRole('combobox', { name: 'กลุ่มงาน' }), { target: { value: 'กลุ่มงานการแพทย์' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'งาน' }), { target: { value: 'งานผู้ป่วยใน' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่พบงานนี้ในกลุ่มงานที่เลือก');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a person in an older unit that is neither กลุ่มงาน nor งาน when the field is untouched', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={{ ...values, organizationId: 'old' }} employmentTypes={[]} units={[...units, { id: 'old', name: 'หน่วยเดิม', unitType: null, parentId: null }]} />);
    expect(screen.getByRole('combobox', { name: 'กลุ่มงาน' })).toHaveValue('หน่วยเดิม');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).not.toHaveProperty('organizationId');
  });

  it('offers a unit with no type yet among the กลุ่มงาน and saves it when chosen', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={[...units, { id: 'old', name: 'หน่วยเดิม', unitType: null, parentId: null }, { id: 'hosp', name: 'โรงพยาบาลวาริชภูมิ', unitType: 'HOSPITAL', parentId: null }]} />);
    const division = screen.getByRole('combobox', { name: 'กลุ่มงาน' });
    expect(options(division.getAttribute('list')!)).toEqual(['กลุ่มการพยาบาล', 'กลุ่มงานการแพทย์', 'หน่วยเดิม']);
    fireEvent.change(division, { target: { value: 'หน่วยเดิม' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock).organizationId).toBe('old');
  });

});

describe('ProfileForm ตำแหน่งงาน and ระดับตำแหน่ง', () => {
  const positions = [
    { name: 'เจ้าพนักงานธุรการ', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'] },
    { name: 'พยาบาลวิชาชีพ', allowedLevels: ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ'] },
    { name: 'พนักงานขับรถยนต์', allowedLevels: [] }
  ];
  const held = { ...values, positionTitle: 'พยาบาลวิชาชีพ', positionLevel: 'ชำนาญการ' };

  it('suggests positions, and only the levels the chosen position allows', () => {
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    const position = screen.getByRole('combobox', { name: 'ตำแหน่งงาน' });
    const level = screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' });
    expect(options(position.getAttribute('list')!)).toEqual(['เจ้าพนักงานธุรการ', 'พยาบาลวิชาชีพ', 'พนักงานขับรถยนต์']);
    expect(options(level.getAttribute('list')!)).toEqual(['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ']);
    fireEvent.change(position, { target: { value: 'เจ้าพนักงานธุรการ' } });
    expect(level).toHaveValue('');
    expect(options(level.getAttribute('list')!)).toEqual(['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส']);
  });

  it('refuses an unknown position or a level the position does not allow, without saving', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'ตำแหน่งที่ไม่มี' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่พบตำแหน่งนี้ กรุณาเลือกจากรายการ');
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'เจ้าพนักงานธุรการ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' }), { target: { value: 'ปฏิบัติการ' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ระดับนี้ใช้กับตำแหน่งนี้ไม่ได้ตามโครงสร้าง ก.พ.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves a chosen position and level, and shows the server refusal in Thai', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INACTIVE_POSITION' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'เจ้าพนักงานธุรการ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' }), { target: { value: 'ชำนาญงาน' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock)).toMatchObject({ positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ชำนาญงาน' });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ตำแหน่งนี้ปิดใช้งานแล้ว');
  });

  it('keeps an older position that is not in the list while it is untouched', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={{ ...held, positionTitle: 'ตำแหน่งเดิม', positionLevel: 'ระดับเดิม' }} employmentTypes={[]} units={units} positions={positions} />);
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toMatchObject({ positionTitle: 'ตำแหน่งเดิม', positionLevel: 'ระดับเดิม' });
  });
});
