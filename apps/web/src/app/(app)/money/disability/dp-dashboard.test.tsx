import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DpStoredRecord } from '@backoffice/core';

const { downloadDpExport } = vi.hoisted(() => ({ downloadDpExport: vi.fn() }));
vi.mock('../../../../lib/money/dp-export', () => ({ downloadDpExport }));
import { DpDashboard } from './dp-dashboard';

const rec = (o: Partial<DpStoredRecord>): DpStoredRecord => ({
  ref: 'x', date: '2025-10-05', fy: 2569, visit_no: 1, cid: '1', name: 'ทดสอบ สมมติ', hn: 'h1', an: '', target: 'กลุ่มที่ 3', dis_type: '', adl: '', right: 'UCS', subright: '',
  svc_type: 'ผู้ป่วยนอก', code: 'H9339', service: 'กายภาพบำบัด', icd10: '', icd9: '', staff: 'เจ้าหน้าที่ ทดสอบ', status: '', claim: 160, eligible: 150, std_price: 0,
  charge_unit: 0, paid_unit: 0, diff_unit: 0, qty: 1, saved: '', start: '', end: '', ...o
});
const records = [
  rec({ ref: '1', date: '2024-10-02', fy: 2568, right: 'WEL', cid: 'z' }),
  rec({ ref: '2', date: '2025-10-01', cid: 'a' }),
  rec({ ref: '3', date: '2025-11-13', cid: 'b', status: 'D24', service: 'จิตบำบัด', code: 'H9449' }),
  rec({ ref: '4', date: '2025-11-13', cid: 'a', target: 'กลุ่มที่ 1', hn: 'h4', name: 'มานี ใจดี' })
];
const years = [{ fy: 2569, count: 3, from: '2025-10-01', to: '2025-11-13', claim: 480, eligible: 450, flagged: 1, latestFile: 'a.csv', updatedAt: '2026-11-13T07:05:00.000Z' },
  { fy: 2568, count: 1, from: '2024-10-02', to: '2024-10-02', claim: 160, eligible: 150, flagged: 0, latestFile: 'b.csv', updatedAt: '2026-11-01T01:00:00.000Z' }];
const serve = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
const shown = async (canManage = true) => { render(<DpDashboard canManage={canManage} />); return screen.findByRole('region', { name: 'รายละเอียด' }); };
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[];

afterEach(() => { vi.unstubAllGlobals(); downloadDpExport.mockReset(); });

describe('DpDashboard', () => {
  it('shows the status line, the latest ปีงบ, KPI cards, services with a total row and ปีงบ rows', async () => {
    serve({ years, records });
    await shown();
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูล 4 ครั้ง · 2 ปีงบ (2 ต.ค. 2567 – 13 พ.ย. 2568) · ปรับปรุงล่าสุด 13 พ.ย. 2569 14:05');
    expect(screen.getByLabelText('ปีงบประมาณ (ต.ค.–ก.ย.)')).toHaveValue('2569');
    expect(within(screen.getByLabelText('ปีงบประมาณ (ต.ค.–ก.ย.)')).getAllByRole('option').map((o) => o.textContent)).toEqual(['ทุกปีงบ', 'ปีงบ 2569 (3 ครั้ง)', 'ปีงบ 2568 (1 ครั้ง)']);
    const kpis = screen.getByRole('region', { name: 'สรุป' });
    expect(within(kpis).getByText('จำนวนครั้ง').parentElement).toHaveTextContent('3');
    expect(within(kpis).getByText('ผู้รับบริการ').parentElement).toHaveTextContent('2');
    expect(within(kpis).getByText('ราคาที่ขอเบิก (AE)').parentElement).toHaveTextContent('480.00');
    expect(within(kpis).getByText('ราคาที่พึงเบิก (AF)').parentElement).toHaveTextContent('300.00');
    expect(within(kpis).getByText('ส่วนต่าง').parentElement).toHaveTextContent('180.00');
    expect(within(kpis).getByText('ติดสถานะ').parentElement).toHaveTextContent('1 ครั้งพึงเบิกตามไฟล์ 150.00 บาท');
    const services = screen.getByRole('table', { name: 'รายชื่อบริการฟื้นฟู' });
    expect(bodyRows(services).map((row) => row.cells[0]!.textContent)).toEqual(['กายภาพบำบัด', 'จิตบำบัด', 'รวม 2 บริการ']);
    expect(bodyRows(services)[2]).toHaveTextContent('480.00');
    expect(screen.getByRole('figure', { name: 'กราฟรวมราคาที่พึงเบิกได้รายบริการฟื้นฟู' })).toBeInTheDocument();
    expect(bodyRows(screen.getByRole('table', { name: 'สรุปรายปีงบ' })).map((row) => row.cells[0]!.textContent)).toEqual(['2569', '2568']);
    expect(screen.getByRole('heading', { name: /แนวโน้มรายเดือน/ })).toBeInTheDocument();
    expect(screen.getByText('กำลังแสดง:').parentElement).toHaveTextContent('ปีงบ 2569 (1 ต.ค. 2568 – 30 ก.ย. 2569)');
  });

  it('lists the rows newest first; a service, a ปีงบ and a status code open their rows', async () => {
    serve({ years, records });
    const detail = await shown();
    expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' })).map((row) => row.cells[11]!.textContent)).toEqual(['4', '3', '2']);
    fireEvent.click(within(screen.getByRole('table', { name: 'รายชื่อบริการฟื้นฟู' })).getByRole('button', { name: 'จิตบำบัด' }));
    expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' })).map((row) => row.cells[11]!.textContent)).toEqual(['3']);
    fireEvent.click(within(detail).getByRole('button', { name: 'ล้างบริการ' }));
    fireEvent.click(within(screen.getByRole('table', { name: 'สรุปรายปีงบ' })).getByRole('button', { name: '2568' }));
    expect(screen.getByLabelText('ปีงบประมาณ (ต.ค.–ก.ย.)')).toHaveValue('2568');
    expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' })).map((row) => row.cells[11]!.textContent)).toEqual(['1']);
    fireEvent.change(screen.getByLabelText('ปีงบประมาณ (ต.ค.–ก.ย.)'), { target: { value: '2569' } });
    fireEvent.click(within(detail).getByRole('tab', { name: 'ติดสถานะ' }));
    fireEvent.click(within(within(detail).getByRole('table', { name: 'ติดสถานะ' })).getByRole('button', { name: 'D24' }));
    expect(within(detail).getByRole('tab', { name: 'รายการ' })).toHaveAttribute('aria-selected', 'true');
    expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' })).map((row) => row.cells[11]!.textContent)).toEqual(['3']);
  });

  it('filters by สิทธิหลัก and search, and clears the filters', async () => {
    serve({ years, records });
    const detail = await shown();
    fireEvent.change(screen.getByLabelText('ปีงบประมาณ (ต.ค.–ก.ย.)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('สิทธิหลัก'), { target: { value: 'WEL' } });
    expect(within(screen.getByRole('region', { name: 'สรุป' })).getByText('จำนวนครั้ง').parentElement).toHaveTextContent('1');
    fireEvent.change(screen.getByLabelText('สิทธิหลัก'), { target: { value: '' } });
    fireEvent.change(within(detail).getByRole('searchbox', { name: 'ค้นหา' }), { target: { value: 'มานี' } });
    await waitFor(() => expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' }))).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    await waitFor(() => expect(bodyRows(within(detail).getByRole('table', { name: 'รายการ' }))).toHaveLength(4));
  });

  it('switches to รายวัน with ‹ › and to a chosen range', async () => {
    serve({ years, records });
    await shown();
    fireEvent.click(screen.getByRole('tab', { name: 'รายวัน' }));
    expect(screen.getByText('กำลังแสดง:').parentElement).toHaveTextContent('วันที่ 13 พ.ย. 2568');
    expect(within(screen.getByRole('region', { name: 'สรุป' })).getByText('จำนวนครั้ง').parentElement).toHaveTextContent('2');
    expect(screen.getByRole('heading', { name: /แนวโน้มรายวัน/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'วันก่อนหน้า' }));
    expect(screen.getByText('กำลังแสดง:').parentElement).toHaveTextContent('วันที่ 12 พ.ย. 2568');
    fireEvent.click(screen.getByRole('tab', { name: 'เลือกช่วงเวลา' }));
    expect(screen.getByText('กำลังแสดง:').parentElement).toHaveTextContent('1 พ.ย. 2568 – 13 พ.ย. 2568');
  });

  it('exports the four legacy sheets', async () => {
    serve({ years, records });
    await shown();
    fireEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' }));
    await waitFor(() => expect(downloadDpExport).toHaveBeenCalled());
    expect(Object.keys(downloadDpExport.mock.calls[0]![0] as object)).toEqual(['ช่วงเวลา', 'รายบริการ', 'แนวโน้ม', 'รายการ']);
  });

  it('says there is no data with a link for managers, and shows a load failure', async () => {
    serve({ years: [], records: [] });
    render(<DpDashboard canManage />);
    expect(await screen.findByRole('heading', { name: 'ยังไม่มีข้อมูล' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'หน้าจัดการไฟล์' })).toHaveAttribute('href', '/money/disability/files');
    vi.unstubAllGlobals();
    serve({ error: 'FORBIDDEN' }, 403);
    render(<DpDashboard canManage={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดข้อมูลไม่ได้');
  });
});
