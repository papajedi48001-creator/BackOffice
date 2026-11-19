import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nhsoStored } from '../../../../lib/money/fixtures/nhso-stored';

const { downloadNhsoReport } = vi.hoisted(() => ({ downloadNhsoReport: vi.fn() }));
vi.mock('../../../../lib/money/nhso-export', () => ({ downloadNhsoReport }));
import { NhsoDashboard } from './nhso-dashboard';

const datasets = nhsoStored.map((report, index) => ({ hcode: report.hcode, name: '', region: '', fy: report.fy, dateFrom: null, dateTo: null, fileName: report.fileName!, rowCount: 1, transferTotal: 0, uploadedAt: `2026-11-1${index}T07:05:00.000Z`, rows: report.rows }));
const serve = (list: unknown[]) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ datasets: list }), { status: 200 })));

beforeEach(() => window.localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); downloadNhsoReport.mockReset(); });

describe('NhsoDashboard', () => {
  it('shows the status line, the วาริชภูมิ hero for the latest two ปีงบ and the fund cards', async () => {
    serve(datasets);
    render(<NhsoDashboard canManage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ข้อมูลล่าสุด 14 พ.ย. 2569 14:05 · 5 ไฟล์ (ปีงบ 2568, 2569, 2570)'));
    const overview = screen.getByRole('region', { name: 'ภาพรวม' });
    const chips = within(overview).getByRole('group', { name: 'ปีงบประมาณ' });
    expect(within(chips).getAllByRole('checkbox').map((box) => (box as HTMLInputElement).checked)).toEqual([false, true, true]);
    const hero = within(overview).getByRole('group', { name: 'โอนสะสม' });
    expect(hero).toHaveTextContent('โรงพยาบาลวาริชภูมิ (ปีงบ 2569 + ปีงบ 2570)');
    expect(hero).toHaveTextContent('180.00บาท');
    expect(hero).toHaveTextContent('ปีงบ 2569: 150.00');
    expect(hero).toHaveTextContent('เปลี่ยนแปลง 2569→2570: -80.0%');
    const cards = within(overview).getAllByRole('heading', { level: 4 });
    expect(cards.map((card) => card.textContent)).toEqual(['กองทุนผู้ป่วยใน', 'งบแพทย์แผนไทย', 'กองทุนผู้ป่วยนอก']);
    fireEvent.click(within(chips).getByRole('checkbox', { name: '2569' }));
    expect(hero).toHaveTextContent('30.00บาท');
  });

  it('shows stats, the fund × hospital table, the report tabs with search, and downloads the report', async () => {
    serve(datasets);
    render(<NhsoDashboard canManage={false} />);
    const details = await screen.findByRole('region', { name: 'รายละเอียดและรายงาน' });
    expect(within(details).getByText('โรงพยาบาล', { selector: 'dt' }).nextSibling).toHaveTextContent('3');
    const fundTable = within(details).getByRole('table', { name: 'ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล' });
    expect(within(fundTable).getByText('รวม 3 โรงพยาบาล').parentElement).toHaveTextContent('345.00');
    for (const name of ['ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล', 'รายรับแยกรายกองทุน', 'เทียบรายกองทุน ตามปีงบประมาณ']) {
      expect(within(details).getByRole('table', { name }).parentElement, name).toHaveClass('money-table-wrap', 'is-matrix');
    }
    const tabs = within(details).getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['สรุป (3)', 'เทียบยอด คงเหลือ (4)', 'แถวที่ขาด (2)', 'ตารางมี-ไม่มี (3)', 'ค่าไม่ตรงกัน (2)', 'ยอดตามกองทุน-รพ (5)', 'เทียบปีงบ (3)']);
    fireEvent.click(within(details).getByRole('tab', { name: 'แถวที่ขาด (2)' }));
    fireEvent.change(within(details).getByRole('searchbox', { name: 'ค้นหาในรายงาน' }), { target: { value: 'นอก' } });
    expect(within(within(details).getByRole('table', { name: 'แถวที่ขาด' })).getAllByRole('row')).toHaveLength(2);
    fireEvent.click(within(details).getByRole('button', { name: 'ดาวน์โหลดรายงาน Excel' }));
    await waitFor(() => expect(downloadNhsoReport).toHaveBeenCalled());
    expect(Object.keys(downloadNhsoReport.mock.calls[0]![0])).toContain('เทียบปีงบ');
    expect(screen.queryByRole('link', { name: 'จัดการไฟล์ (ผู้ดูแล)' })).toBeNull();
  });

  it('remembers the compare settings in this browser and resets them', async () => {
    serve(datasets);
    render(<NhsoDashboard canManage />);
    await screen.findByRole('region', { name: 'รายละเอียดและรายงาน' });
    expect(JSON.parse(window.localStorage.getItem('nhso.settings')!)).toMatchObject({ keys: ['กองทุน'], pivotCol: 'คงเหลือ', ignoreCase: true, aggregate: true, headerRow: 0 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'key ซ้ำในไฟล์เดียวกันให้รวมยอด' }));
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเทียบข้อมูล' }));
    expect(JSON.parse(window.localStorage.getItem('nhso.settings')!).aggregate).toBe(false);
    expect(screen.getByRole('tab', { name: /^key ซ้ำ/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'คืนค่าเริ่มต้น' }));
    expect(JSON.parse(window.localStorage.getItem('nhso.settings')!).aggregate).toBe(true);
    const keys = screen.getByRole('group', { name: /คอลัมน์ key/ });
    for (const box of within(keys).getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเทียบข้อมูล' }));
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณาเลือกคอลัมน์ key อย่างน้อย 1 คอลัมน์');
  });

  it('explains no data and a single hospital, with the files link for managers only', async () => {
    serve([]);
    const { unmount } = render(<NhsoDashboard canManage />);
    expect(await screen.findByText(/ยังไม่มีข้อมูล/)).toHaveTextContent('ผู้ดูแลอัปโหลดไฟล์รายงานโอนเงินได้ที่หน้า จัดการไฟล์');
    unmount();
    serve(datasets.filter((dataset) => dataset.hcode === '11093'));
    render(<NhsoDashboard canManage={false} />);
    expect(await screen.findByText(/มีข้อมูลโรงพยาบาลเดียว/)).toHaveTextContent('ต้องมีอย่างน้อย 2 โรงพยาบาลจึงจะเทียบได้ ติดต่อผู้ดูแล Smart Money');
  });

  it('says when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })));
    render(<NhsoDashboard canManage />);
    expect(await screen.findByText('โหลดข้อมูลไม่สำเร็จ กดปุ่ม "โหลดข้อมูลล่าสุด" เพื่อลองใหม่')).toBeInTheDocument();
  });
});
