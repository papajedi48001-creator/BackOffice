import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MasterDataImportForm } from './master-data-import-form';

afterEach(() => vi.unstubAllGlobals());

function choosePeopleFile() {
  fireEvent.change(screen.getByLabelText('ไฟล์บุคลากร (CSV)'), { target: { files: [new File(['employee_code\n'], 'people.csv', { type: 'text/csv' })] } });
}

describe('MasterDataImportForm', () => {
  it('shows each row problem in Thai and keeps import disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ mode: 'validate', errors: [{ file: 'people', row: 4, column: 'national_id', code: 'INVALID_NATIONAL_ID' }] }), { status: 422 })));
    render(<MasterDataImportForm />);

    choosePeopleFile();
    fireEvent.click(screen.getByRole('button', { name: 'ตรวจสอบไฟล์' }));

    expect(await screen.findByRole('cell', { name: 'เลขประจำตัวประชาชนไม่ถูกต้อง' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'นำเข้าข้อมูล' })).toBeDisabled();
  });

  it('enables import after a clean check and reports what was saved', async () => {
    const summary = { organizationsCreated: 1, organizationsUpdated: 0, peopleCreated: 2, peopleUpdated: 0, assignmentsChanged: 2, headsChanged: 1 };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify({ mode: (init.body as FormData).get('mode'), summary }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MasterDataImportForm />);

    choosePeopleFile();
    fireEvent.click(screen.getByRole('button', { name: 'ตรวจสอบไฟล์' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'นำเข้าข้อมูล' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'นำเข้าข้อมูล' }));

    expect(await screen.findByText(/^นำเข้าเรียบร้อย/)).toHaveAttribute('role', 'status');
    expect(screen.getByText(/หัวหน้าหน่วยงานที่เปลี่ยน 1/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/hr/imports', expect.objectContaining({ method: 'POST' }));
    expect((fetchMock.mock.calls[1]![1].body as FormData).get('mode')).toBe('apply');
  });
  it('explains unit type and head problems in Thai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ mode: 'validate', errors: [
      { file: 'organizations', row: 2, column: 'unit_type', code: 'UNKNOWN_UNIT_TYPE' },
      { file: 'organizations', row: 3, column: 'head_employee_code', code: 'UNKNOWN_HEAD' },
      { file: 'organizations', row: 4, column: 'head_employee_code', code: 'INACTIVE_HEAD' },
      { file: 'organizations', row: 5, column: 'head_employee_code', code: 'HEAD_ALREADY_SCHEDULED' }
    ] }), { status: 422 })));
    render(<MasterDataImportForm />);

    choosePeopleFile();
    fireEvent.click(screen.getByRole('button', { name: 'ตรวจสอบไฟล์' }));

    expect(await screen.findByRole('cell', { name: 'ชนิดหน่วยงานต้องเป็น งาน, กลุ่มงาน หรือ โรงพยาบาล' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ไม่พบรหัสหัวหน้าหน่วยงาน' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'หัวหน้าหน่วยงานต้องมีสถานะ ACTIVE' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'หน่วยงานนี้มีหัวหน้าที่ตั้งล่วงหน้าไว้แล้ว จึงนำเข้าหัวหน้าคนอื่นก่อนวันเริ่มนั้นไม่ได้' })).toBeInTheDocument();
  });
});
