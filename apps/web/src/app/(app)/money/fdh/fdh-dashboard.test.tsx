import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fdhStored } from '../../../../lib/money/fixtures/fdh-stored';

const { downloadFdhExport } = vi.hoisted(() => ({ downloadFdhExport: vi.fn() }));
vi.mock('../../../../lib/money/fdh-export', () => ({ downloadFdhExport }));
import { FdhDashboard } from './fdh-dashboard';

const serve = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
const shown = async () => { render(<FdhDashboard canManage />); return screen.findByRole('region', { name: 'รายละเอียด' }); };
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[];
const caseRows = (detail: HTMLElement) => bodyRows(within(detail).getByRole('table', { name: 'รายเคส' }));

afterEach(() => { vi.unstubAllGlobals(); downloadFdhExport.mockReset(); });

describe('FdhDashboard', () => {
  it('shows the status line, KPI cards, status strip, sub-fund and STM money tables', async () => {
    serve({ ok: true, ...fdhStored });
    await shown();
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูล REP 2 ไฟล์ · STM 1 ไฟล์ (งวด 6910_OP_02) · อัปโหลดล่าสุด 18 พ.ย. 2569 11:30');
    const kpis = screen.getByRole('region', { name: 'สรุป' });
    expect(within(kpis).getByText('เคสทั้งหมด').parentElement).toHaveTextContent('4');
    expect(within(kpis).getByText('ชดเชยตาม REP').parentElement).toHaveTextContent('290.00');
    expect(within(kpis).getByText('ได้รับตาม STM').parentElement).toHaveTextContent('140.00');
    expect(within(kpis).getByText('รอ STM').parentElement).toHaveTextContent('150.00');
    expect(within(kpis).getByText('ติด C / DENY').parentElement).toHaveTextContent('1 เคสแก้แล้วผ่าน 1 เคส');
    const strip = screen.getByRole('group', { name: 'สถานะ' });
    expect(within(strip).getAllByRole('button').map((button) => button.textContent)).toEqual(['✅ ได้รับเงินแล้ว 2', '⏳ รอ STM 1', '❌ ติด C / DENY 1', '⚠️ ยอดไม่ตรง 0', '❓ ไม่พบ REP 0', '🔧 แก้ไขแล้ว ผ่านแล้ว 1']);
    const subs = screen.getByRole('table', { name: 'รายกองทุนย่อย' });
    expect(bodyRows(subs).map((row) => row.cells[0]!.textContent)).toEqual(['TELEMED', 'HERB_FS', 'ไม่ระบุ']);
    const moneyTable = screen.getByRole('table', { name: 'ยอดตามคอลัมน์เงิน STM' });
    expect(within(moneyTable).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['งวด', 'แถว', 'OP', 'FS', 'ยอดชดเชยทั้งสิ้น']);
  });

  it('filters by status chip, สิทธิ, Error Code row and clears the filters', async () => {
    serve({ ok: true, ...fdhStored });
    const detail = await shown();
    expect(caseRows(detail)).toHaveLength(4);
    fireEvent.click(within(screen.getByRole('group', { name: 'สถานะ' })).getByRole('button', { name: /ติด C/ }));
    expect(caseRows(detail).map((row) => row.cells[1]!.textContent)).toEqual(['C']);
    expect(screen.getByText('กำลังกรอง:').parentElement).toHaveTextContent('ติด C / DENY');
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(caseRows(detail)).toHaveLength(4);
    fireEvent.change(screen.getByRole('combobox', { name: 'สิทธิหลัก' }), { target: { value: 'OFC' } });
    expect(caseRows(detail)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    fireEvent.click(within(detail).getByRole('tab', { name: 'Error Code' }));
    fireEvent.click(within(detail).getByRole('button', { name: '237' }));
    expect(within(detail).getByRole('tab', { name: 'รายเคส' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('กำลังกรอง:').parentElement).toHaveTextContent('Error 237');
    expect(caseRows(detail).map((row) => row.cells[1]!.textContent)).toEqual(['C']);
    fireEvent.change(within(detail).getByRole('searchbox', { name: 'ค้นหา' }), { target: { value: 'ไม่มีใคร' } });
    expect(within(within(detail).getByRole('table', { name: 'รายเคส' })).getByText('ไม่พบเคสตามตัวกรอง')).toBeInTheDocument();
  });

  it('opens the case popup with REP history and DENY; it closes only from its button', async () => {
    serve({ ok: true, ...fdhStored });
    const detail = await shown();
    fireEvent.click(within(detail).getByRole('button', { name: 'C' }));
    const dialog = screen.getByRole('dialog', { name: /สมหญิง ดีใจ/ });
    expect(dialog).toHaveTextContent('3100000000002');
    expect(within(dialog).getByRole('heading', { name: 'รายการที่ถูกปฏิเสธ (Data DENY)' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('D01');
    expect(dialog).toHaveTextContent('ยังไม่พบเคสนี้ใน STM ที่อัปโหลด');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'D' }));
    const fixed = screen.getByRole('dialog');
    expect(within(fixed).getByRole('heading', { name: 'ประวัติการส่ง REP (2 ครั้ง)' })).toBeInTheDocument();
    expect(within(fixed).getByRole('heading', { name: 'ยอดพึงรับใน STM' })).toBeInTheDocument();
  });

  it('lists people by sub-fund and opens a person, then one of their visits', async () => {
    serve({ ok: true, ...fdhStored });
    const detail = await shown();
    fireEvent.click(within(detail).getByRole('tab', { name: 'รายบุคคล' }));
    const people = within(detail).getByRole('table', { name: 'รายบุคคล' });
    expect(within(people).getAllByRole('row')).toHaveLength(5);
    fireEvent.change(within(detail).getByRole('combobox', { name: 'กองทุนย่อย (REP)' }), { target: { value: 'TELEMED' } });
    expect(within(people).getAllByRole('row')).toHaveLength(3);
    fireEvent.click(within(people).getAllByRole('button', { name: 'TELEMED' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'ทุก visit ที่เบิก TELEMED' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole('button', { name: /^[BD]$/ })[0]!);
    expect(screen.getByRole('dialog')).toHaveTextContent('VN (SEQ)');
  });

  it('shows the sub-fund chips and the VNs of the chosen fund', async () => {
    serve({ ok: true, ...fdhStored });
    const detail = await shown();
    fireEvent.click(within(detail).getByRole('tab', { name: 'รายกองทุนย่อย' }));
    const chips = within(detail).getByRole('list', { name: 'กองทุนย่อย' });
    fireEvent.click(within(chips).getByRole('button', { name: /^TELEMED/ }));
    const vns = within(detail).getByRole('table', { name: 'HN / VN ของกองทุนนี้' });
    expect(bodyRows(vns).map((row) => row.cells[2]!.textContent).sort()).toEqual(['B', 'D']);
  });

  it('downloads the Excel sheets of what is filtered', async () => {
    serve({ ok: true, ...fdhStored });
    const detail = await shown();
    fireEvent.click(within(detail).getByRole('button', { name: 'ดาวน์โหลด Excel' }));
    await waitFor(() => expect(downloadFdhExport).toHaveBeenCalled());
    expect(downloadFdhExport.mock.calls[0]![0]['รายเคส']).toHaveLength(4);
  });

  it('says when there is no data (files link for managers) and when loading fails', async () => {
    serve({ ok: true, reps: [], stms: [] });
    const { unmount } = render(<FdhDashboard canManage />);
    expect(await screen.findByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /จัดการไฟล์/ }).length).toBeGreaterThan(0);
    unmount();
    serve({ ok: true, reps: [], stms: [] });
    const second = render(<FdhDashboard canManage={false} />);
    expect(await screen.findByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /จัดการไฟล์/ })).toBeNull();
    second.unmount();
    serve({ error: 'forbidden' }, 403);
    render(<FdhDashboard canManage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดข้อมูลไม่ได้');
  });
});
