import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dentalPresets, summarizeDental, type DentalRow } from '@backoffice/core';
import rows from '../../../../../../../packages/core/src/smart-money/fixtures/dental-rows.json';
const rowsJson = rows;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { DentalDashboard, type DentalDashboardProps } from './dental-dashboard';

const fixture = rows as DentalRow[];
const base: DentalDashboardProps = { start: '2026-10-01', end: '2026-11-30', group: 'pttype', period: 'day', presets: dentalPresets('2026-11-13'), showConnectionLink: false, outcome: { kind: 'data', rows: fixture, summary: summarizeDental(fixture, 'pttype', 'day') } };

describe('DentalDashboard', () => {
  it('shows the five summary cards, ลูกหนี้ = ค่ารักษารวม − ชำระแล้ว and คาดการณ์รายรับ', () => {
    render(<DentalDashboard {...base} />);
    const cards = screen.getByRole('region', { name: 'สรุป' });
    expect(within(cards).getByText('ผู้รับบริการทันตกรรม')).toBeInTheDocument();
    expect(within(cards).getByText('10')).toBeInTheDocument();
    expect(within(cards).getByText('13 visit')).toBeInTheDocument();
    expect(within(cards).getByText('9,651.00')).toBeInTheDocument();
    expect(within(cards).getByText('1,275.25')).toBeInTheDocument();
    expect(within(cards).getByText('มูลค่าลูกหนี้ (บาท)')).toBeInTheDocument();
    expect(within(cards).getByText('8,575.75')).toBeInTheDocument();
    expect(within(cards).getByText('ค่ารักษารวม − ชำระแล้ว')).toBeInTheDocument();
    expect(within(cards).getByText('คาดการณ์รายรับทันตกรรม (บาท)')).toBeInTheDocument();
    expect(within(cards).getByText('6,175.00')).toBeInTheDocument();
    expect(within(cards).getByText('ลูกหนี้ทุกผังบัญชี ยกเว้น UC-OP ใน CUP และ PP')).toBeInTheDocument();
  });

  it('charts ลูกหนี้ by group, largest first, with งานฟันปลอม stacked and UC ใน CUP in red', () => {
    render(<DentalDashboard {...base} />);
    const chart = screen.getByRole('figure', { name: 'มูลค่าลูกหนี้แยกตามสิทธิการรักษา' });
    const items = within(chart).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.bar-chart-label')!.firstChild!.textContent!.split(' ')[0])).toEqual(['A8', '89', '71', '10', 'A7', '34', '23']);
    expect(items[1]).toHaveClass('is-alert');
    expect(items[0]).not.toHaveClass('is-alert');
    expect(within(items[2]!).getByText(/งานฟันปลอม 1,500\.00 บาท/)).toBeInTheDocument();
    expect(chart.querySelector('figcaption')).toHaveTextContent('ลูกหนี้งานฟันปลอม');
    expect(screen.getByRole('table', { name: 'Diag หลักที่พบบ่อย (Top 10)' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'สรุปตามสิทธิการรักษา' })).toBeInTheDocument();
    expect(screen.getByText(/1 แถว = 1 visit ที่มีงานทันตกรรม \(dtmain\)/)).toBeInTheDocument();
    expect(screen.getByText(/งานทันตกรรม \(dtmain\) · เฉพาะลูกหนี้/)).toBeInTheDocument();
  });

  it('shows the dentist and filters the detail by สิทธิ, ผังบัญชี and search, counting each visit once', () => {
    render(<DentalDashboard {...base} />);
    const table = screen.getByRole('table', { name: 'รายละเอียดรายการ' });
    expect(within(table).getByRole('columnheader', { name: 'ทันตแพทย์' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Diag หลัก' })).toBeInTheDocument();
    expect(screen.queryByText(/^แสดง \d/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'กรองตามสิทธิ' }), { target: { value: '71' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('แสดง 1 แถว · 1 visit · ลูกหนี้ 1,500.00 บาท')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'กรองตามสิทธิ' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'กรองตามผังบัญชี' }), { target: { value: 'ลูกหนี้ค่ารักษา UC-OP ใน CUP' } });
    const rows = (rowsJson as DentalRow[]).filter((row) => row.paccountName === 'ลูกหนี้ค่ารักษา UC-OP ใน CUP');
    expect(within(table).getAllByRole('row')).toHaveLength(rows.length + 1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายการ' }), { target: { value: 'zzz' } });
    expect(screen.getByText('แสดง 0 แถว · 0 visit · ลูกหนี้ 0.00 บาท')).toBeInTheDocument();
  });

  it('counts a visit once in the info line even when it has two rows, and finds rows by amount', () => {
    const visit = (rowsJson as DentalRow[]).filter((row) => row.vn === '681002080138');
    expect(visit.length).toBeGreaterThan(1);
    render(<DentalDashboard {...base} outcome={{ kind: 'data', rows: visit, summary: summarizeDental(visit, 'pttype', 'day') }} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายการ' }), { target: { value: '000123' } });
    expect(screen.getByText(`แสดง ${visit.length} แถว · 1 visit · ลูกหนี้ ${visit[0]!.claimAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหารายการ' }), { target: { value: visit[0]!.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 }) } });
    expect(within(screen.getByRole('table', { name: 'รายละเอียดรายการ' })).getAllByRole('row')).toHaveLength(visit.length + 1);
  });

  it('lets a visit with no สิทธิ be picked on its own', () => {
    const [first, second] = rowsJson as DentalRow[];
    const rows = [{ ...first!, pttypeCode: '', pttypeName: '' }, { ...second!, vn: '999', pttypeCode: '10' }];
    render(<DentalDashboard {...base} outcome={{ kind: 'data', rows, summary: summarizeDental(rows, 'pttype', 'day') }} />);
    const select = screen.getByRole('combobox', { name: 'กรองตามสิทธิ' });
    const empty = within(select).getByRole('option', { name: '(ไม่ระบุสิทธิ)' }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value: empty.value } });
    expect(within(screen.getByRole('table', { name: 'รายละเอียดรายการ' })).getAllByRole('row')).toHaveLength(2);
  });

  it('keeps the filters in the links and the CSV download', () => {
    render(<DentalDashboard {...base} />);
    expect(screen.getByRole('link', { name: 'ผังบัญชี' })).toHaveAttribute('href', '/money/dental?start=2026-10-01&end=2026-11-30&group=paccount&period=day');
    expect(screen.getByRole('link', { name: 'รายเดือน' })).toHaveAttribute('href', '/money/dental?start=2026-10-01&end=2026-11-30&group=pttype&period=month');
    expect(screen.getByRole('link', { name: 'เดือนนี้' })).toHaveAttribute('href', '/money/dental?start=2026-11-01&end=2026-11-30&group=pttype&period=day');
    expect(screen.getByRole('link', { name: 'ดาวน์โหลด CSV' })).toHaveAttribute('href', '/api/money/dental/export?start=2026-10-01&end=2026-11-30');
  });

  it('shows the new dates in the date boxes after a preset changes the range', () => {
    const { rerender } = render(<DentalDashboard {...base} />);
    rerender(<DentalDashboard {...base} start="2026-09-01" end="2026-09-30" />);
    expect(screen.getByLabelText('ตั้งแต่วันที่')).toHaveValue('อังคาร 1 ก.ย. 2569');
    expect(screen.getByLabelText('ถึงวันที่')).toHaveValue('พุธ 30 ก.ย. 2569');
  });
  it('explains a range that is too long without data', () => {
    render(<DentalDashboard {...base} outcome={{ kind: 'range', code: 'RANGE_TOO_LONG' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ช่วงวันที่ยาวเกิน 366 วัน');
    expect(screen.queryByRole('region', { name: 'สรุป' })).toBeNull();
  });

  it('explains a missing HOSxP connection, with the settings link for ผู้ดูแลระบบ only', () => {
    const { rerender } = render(<DentalDashboard {...base} outcome={{ kind: 'error', code: 'NOT_CONFIGURED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP');
    expect(screen.queryByRole('link', { name: 'ตั้งค่าการเชื่อมต่อ' })).toBeNull();
    rerender(<DentalDashboard {...base} showConnectionLink outcome={{ kind: 'error', code: 'NOT_CONFIGURED' }} />);
    expect(screen.getByRole('link', { name: 'ตั้งค่าการเชื่อมต่อ' })).toHaveAttribute('href', '/admin/connections');
  });

  it('explains a failed HOSxP read and an empty range', () => {
    const { rerender } = render(<DentalDashboard {...base} outcome={{ kind: 'error', code: 'HOSXP_FAILED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ดึงข้อมูลจาก HOSxP ไม่สำเร็จ ลองใหม่อีกครั้ง');
    rerender(<DentalDashboard {...base} outcome={{ kind: 'data', rows: [], summary: summarizeDental([], 'pttype', 'day') }} />);
    expect(screen.getByText('ไม่พบข้อมูลในช่วงวันที่ที่เลือก')).toBeInTheDocument();
  });
});
