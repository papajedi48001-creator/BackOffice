import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ContactForm, PersonalForm, PhotoForm, ProfileForm, type ProfileFormValues } from './hr-profile-forms';

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

const openProfile = () => fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูลส่วนตัวและข้อมูลงาน' }));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('ProfileForm กลุ่มงาน and งาน', () => {
  it('shows the person\'s กลุ่มงาน and งาน and suggests only the งาน of the chosen กลุ่มงาน', () => {
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} />);
    openProfile();
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
    openProfile();
    const division = () => screen.getByRole('combobox', { name: 'กลุ่มงาน' });
    const section = () => screen.getByRole('combobox', { name: 'งาน' });
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    const reopen = async () => { await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); openProfile(); };

    fireEvent.change(section(), { target: { value: 'งานอุบัติเหตุฉุกเฉิน' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).organizationId).toBe('er');
    expect(await screen.findByRole('status')).toHaveTextContent('บันทึกแล้ว');

    await reopen();
    fireEvent.change(section(), { target: { value: '' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(fetchMock).organizationId).toBe('nur');

    await reopen();
    fireEvent.change(division(), { target: { value: '' } });
    save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(sent(fetchMock).organizationId).toBeNull();
  });

  it('refuses a name that matches no unit without saving', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} />);
    openProfile();
    fireEvent.change(screen.getByRole('combobox', { name: 'กลุ่มงาน' }), { target: { value: 'กลุ่มที่ไม่มี' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByText('ไม่พบกลุ่มงานนี้ กรุณาเลือกจากรายการ')).toHaveAttribute('role', 'alert');
    fireEvent.change(screen.getByRole('combobox', { name: 'กลุ่มงาน' }), { target: { value: 'กลุ่มงานการแพทย์' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'งาน' }), { target: { value: 'งานผู้ป่วยใน' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByText('ไม่พบงานนี้ในกลุ่มงานที่เลือก')).toHaveAttribute('role', 'alert');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a person in an older unit that is neither กลุ่มงาน nor งาน when the field is untouched', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={{ ...values, organizationId: 'old' }} employmentTypes={[]} units={[...units, { id: 'old', name: 'หน่วยเดิม', unitType: null, parentId: null }]} />);
    openProfile();
    expect(screen.getByRole('combobox', { name: 'กลุ่มงาน' })).toHaveValue('หน่วยเดิม');
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).not.toHaveProperty('organizationId');
  });

  it('offers a unit with no type yet among the กลุ่มงาน and saves it when chosen', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={[...units, { id: 'old', name: 'หน่วยเดิม', unitType: null, parentId: null }, { id: 'hosp', name: 'โรงพยาบาลวาริชภูมิ', unitType: 'HOSPITAL', parentId: null }]} />);
    openProfile();
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
    openProfile();
    const position = screen.getByRole('combobox', { name: 'ตำแหน่งงาน' });
    const level = screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' });
    expect(options(position.getAttribute('list')!)).toEqual(['เจ้าพนักงานธุรการ', 'พยาบาลวิชาชีพ', 'พนักงานขับรถยนต์']);
    expect(options(level.getAttribute('list')!)).toEqual(['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ']);
    fireEvent.change(position, { target: { value: 'เจ้าพนักงานธุรการ' } });
    expect(level).toHaveValue('');
    expect(options(level.getAttribute('list')!)).toEqual(['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส']);
  });

  it('refuses an unknown position or a level the position does not allow, without saving', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    openProfile();
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'ตำแหน่งที่ไม่มี' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByText('ไม่พบตำแหน่งนี้ กรุณาเลือกจากรายการ')).toHaveAttribute('role', 'alert');
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'เจ้าพนักงานธุรการ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' }), { target: { value: 'ปฏิบัติการ' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByText('ระดับนี้ใช้กับตำแหน่งนี้ไม่ได้ตามโครงสร้าง ก.พ.')).toHaveAttribute('role', 'alert');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves a chosen position and level, and shows the server refusal in Thai', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INACTIVE_POSITION' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    openProfile();
    fireEvent.change(screen.getByRole('combobox', { name: 'ตำแหน่งงาน' }), { target: { value: 'เจ้าพนักงานธุรการ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' }), { target: { value: 'ชำนาญงาน' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock)).toMatchObject({ positionTitle: 'เจ้าพนักงานธุรการ', positionLevel: 'ชำนาญงาน' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ตำแหน่งนี้ปิดใช้งานแล้ว');
  });

  it('keeps an older position that is not in the list while it is untouched', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={{ ...held, positionTitle: 'ตำแหน่งเดิม', positionLevel: 'ระดับเดิม' }} employmentTypes={[]} units={units} positions={positions} />);
    openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toMatchObject({ positionTitle: 'ตำแหน่งเดิม', positionLevel: 'ระดับเดิม' });
  });

  it('brings the level back when the position is changed and then changed back', () => {
    render(<ProfileForm personId="p1" values={held} employmentTypes={[]} units={units} positions={positions} />);
    openProfile();
    const position = screen.getByRole('combobox', { name: 'ตำแหน่งงาน' });
    fireEvent.change(position, { target: { value: 'พนักงานขับรถยนต์' } });
    expect(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' })).toHaveValue('');
    fireEvent.change(position, { target: { value: 'พยาบาลวิชาชีพ' } });
    expect(screen.getByRole('combobox', { name: 'ระดับตำแหน่ง' })).toHaveValue('ชำนาญการ');
  });
});

describe('own profile popups', () => {
  it('edits contact details in a popup and closes once saved', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactForm endpoint="/api/hr/me/contact" values={{ phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null }} />);
    expect(screen.queryByRole('form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูลติดต่อ' }));
    fireEvent.change(screen.getByLabelText('เบอร์โทร'), { target: { value: '0800000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลติดต่อ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent(fetchMock).phone).toBe('0800000000');
  });

  it('keeps the personal popup open with the error when the save is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'GENDER_REQUIRED' }), { status: 400 })));
    render(<PersonalForm endpoint="/api/hr/me/personal" values={{ namePrefix: null, firstName: 'สมใจ', lastName: 'ใจดี', gender: null, birthDate: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขข้อมูลส่วนตัว' }));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อมูลส่วนตัว' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'แก้ไขข้อมูลส่วนตัว' })).toBeInTheDocument();
  });

  it('confirms before removing the photo', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotoForm photoUrl="/api/hr/people/p1/photo/a1" initials="สจ" uploadsEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบรูป' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'ลบรูป' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'ลบรูป' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/hr/me/photo', expect.objectContaining({ method: 'DELETE' })));
  });

  it('uploads a new photo from the popup', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PhotoForm photoUrl={null} initials="สจ" uploadsEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยนรูป' }));
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('เลือกรูป'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'อัปโหลดรูป' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/hr/me/photo', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('ProfileForm รูปประจำตัว', () => {
  const ok = (status = 200) => new Response(JSON.stringify({ ok: true }), { status });
  const dialog = () => screen.getByRole('dialog');

  it('shows the photo picker above คำนำหน้า, then uploads the chosen photo before saving the profile', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('/photo') ? ok(201) : ok()));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} photo={{ url: null, uploadsEnabled: true }} />);
    openProfile();
    const picker = within(dialog()).getByLabelText('เลือกรูป');
    const prefix = within(dialog()).getByLabelText('คำนำหน้า');
    expect(picker.compareDocumentPosition(prefix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(picker, { target: { files: [new File([new Uint8Array([1])], 'face.png', { type: 'image/png' })] } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [photoCall, profileCall] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(photoCall[0]).toBe('/api/hr/people/p1/photo');
    expect(photoCall[1].method).toBe('POST');
    expect(photoCall[1].body).toBeInstanceOf(FormData);
    expect(profileCall[0]).toBe('/api/hr/people/p1/profile');
  });

  it('refuses a file that is not an image without sending anything, and keeps the popup open on a photo error', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'FILE_INFECTED' }), { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} photo={{ url: null, uploadsEnabled: true }} />);
    openProfile();
    fireEvent.change(within(dialog()).getByLabelText('เลือกรูป'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(within(dialog()).getByText('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP')).toBeInTheDocument();
    fireEvent.change(within(dialog()).getByLabelText('เลือกรูป'), { target: { files: [new File([new Uint8Array([1])], 'face.png', { type: 'image/png' })] } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึกข้อมูล' }));
    expect(await within(dialog()).findByText('ไฟล์นี้ไม่ใช่รูปที่ถูกต้อง หรือไม่ผ่านการตรวจไวรัส')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes the current photo when ลบรูป is ticked', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} photo={{ url: '/api/hr/people/p1/photo?v=a', uploadsEnabled: true }} />);
    openProfile();
    expect(within(dialog()).getByRole('img', { name: 'รูปประจำตัว' })).toHaveAttribute('src', '/api/hr/people/p1/photo?v=a');
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'ลบรูป' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึกข้อมูล' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])).toEqual(['/api/hr/people/p1/photo', { method: 'DELETE' }]);
  });

  it('says photos cannot be uploaded yet when object storage is not set up', () => {
    render(<ProfileForm personId="p1" values={values} employmentTypes={[]} units={units} photo={{ url: null, uploadsEnabled: false }} />);
    openProfile();
    expect(within(dialog()).getByText('ยังอัปโหลดรูปไม่ได้ เพราะระบบยังไม่ได้ตั้งค่าที่เก็บไฟล์')).toBeInTheDocument();
    expect(within(dialog()).queryByLabelText('เลือกรูป')).toBeNull();
  });
});
