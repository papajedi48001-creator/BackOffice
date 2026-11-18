import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { summarizeTtm, ttmPresets, ttmRules, type TtmItem, type TtmServiceRow } from '@backoffice/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { TtmDashboard, type TtmDashboardProps } from './ttm-dashboard';

// Made-up rows only.
const svc = (vn: string, hn: string, o: Partial<TtmServiceRow> = {}): TtmServiceRow => ({ vn, hn, an: '', serviceDate: '2026-11-05', serviceTime: '09:00:00', typeId: '1', typeName: 'ในหน่วยบริการ', doctorName: 'แพทย์แผนไทย ก', treatmentName: 'นวด', patientName: `ผู้ป่วยสมมติ ${hn}`, ...o });
const item = (o: Partial<TtmItem>): TtmItem => ({ vn: 'v1', icode: 'X', income: '99', incomeName: '', itemName: '', isDrug: false, qty: 1, amount: 0, ...o });
const summary = summarizeTtm(
  [svc('v1', 'h1'), svc('v2', 'h2', { serviceTime: '17:10:00', serviceDate: '2026-11-06' }), svc('v3', 'h3', { serviceDate: '2026-11-06', doctorName: 'แพทย์แผนไทย ข' })],
  [{ vn: 'v1', an: '', pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC' }, { vn: 'v2', an: '690000001', pttype: '89', pttypeName: 'UC', hipdata: 'UCS' }, { vn: 'v3', an: '', pttype: '89', pttypeName: 'UC', hipdata: 'UCS' }],
  [item({ icode: '3015001', amount: 250 }), item({ icode: '1560028', isDrug: true, amount: 120.5 }), item({ icode: '3015968', amount: 50 }), item({ vn: 'v2', icode: '1560028', isDrug: true, amount: 100 }), item({ vn: 'v3', icode: '3015004', amount: 150 })],
  ttmRules()
);
const base: TtmDashboardProps = { start: '2026-11-05', end: '2026-11-06', presets: ttmPresets('2026-11-18'), periodText: '5 พฤศจิกายน 2569 – 6 พฤศจิกายน 2569', afterFrom: '16:00', showConnectionLink: false, outcome: { kind: 'data', summary } };

describe('TtmDashboard', () => {
  it('shows the daily report by สิทธิ with the top rows and the grand total', () => {
    render(<TtmDashboard {...base} />);
    expect(screen.getByRole('heading', { name: 'สรุปผลการดำเนินงาน' })).toBeInTheDocument();
    expect(screen.getByText('5 พฤศจิกายน 2569 – 6 พฤศจิกายน 2569')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'สรุปตามสิทธิการรักษา' });
    const rows = within(table).getAllByRole('row').map((row) => row.textContent);
    expect(rows).toContain('ผู้รับบริการทั้งหมด3 คน4002 คน220.502 คน620.50');
    expect(rows).toContain('บริการผู้ป่วยใน (IPD)1 คน00 คน1001 คน100');
    expect(rows).toContain('สิทธิข้าราชการ1250120.50370.50');
    expect(rows).toContain('บัตรทอง (UC)2150100250');
    expect(rows.some((row) => row?.startsWith('สิทธิอื่น ๆ'))).toBe(false);
    expect(rows).toContain('ค่าบริการผู้ป่วยนอก (ในเวลา 50 บาท)–––50');
    expect(rows).toContain('รวมทั้งสิ้น3400220.50670.50');
    const cards = screen.getByRole('complementary', { name: 'สรุป' });
    expect(within(cards).getByText('3 visit · 3 รายการบริการ')).toBeInTheDocument();
  });

  it('splits people and money by service and สิทธิ', () => {
    render(<TtmDashboard {...base} />);
    const people = screen.getByRole('table', { name: 'จำนวนผู้รับบริการรายบริการ แยกตามสิทธิ' });
    expect(within(people).getAllByRole('row')[1]!.textContent).toBe('สิทธิข้าราชการ100000111');
    const money = screen.getByRole('table', { name: 'รายได้รายบริการ แยกตามสิทธิ' });
    expect(within(money).getAllByRole('row').at(-1)!.textContent).toBe('รวม2501500000220.5050670.50');
  });

  it('switches the period table between day, month and ปีงบ, and hides it for one day', () => {
    const { unmount } = render(<TtmDashboard {...base} />);
    expect(screen.getByRole('table', { name: 'สรุปรายวัน' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'รายปีงบ' }));
    expect(within(screen.getByRole('table', { name: 'สรุปรายปีงบ' })).getByText('ปีงบ 2570')).toBeInTheDocument();
    unmount();
    render(<TtmDashboard {...base} end="2026-11-05" periodText="วันพฤหัสบดี ที่ 5 พฤศจิกายน 2569" />);
    expect(screen.getByRole('heading', { name: 'สรุปผลการดำเนินงานประจำวัน' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'ช่วงเวลา' })).toBeNull();
  });

  it('searches the visit list and marks IPD and after-hours', () => {
    render(<TtmDashboard {...base} />);
    const list = screen.getByRole('table', { name: 'รายชื่อผู้รับบริการ' });
    expect(within(list).getAllByRole('row')).toHaveLength(4);
    expect(within(list).getByText('IPD')).toBeInTheDocument();
    expect(within(list).getByText('นอกเวลา')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ค้นหาผู้รับบริการ'), { target: { value: 'แพทย์แผนไทย ข' } });
    expect(within(list).getAllByRole('row')).toHaveLength(2);
  });

  it('links the code check and offers Excel only with data', () => {
    const { unmount } = render(<TtmDashboard {...base} />);
    for (const link of screen.getAllByRole('link', { name: 'ตรวจสอบการจับคู่รหัส' })) expect(link).toHaveAttribute('href', '/money/ttm/mapping?start=2026-11-05&end=2026-11-06');
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' })).toBeInTheDocument();
    unmount();
    render(<TtmDashboard {...base} outcome={{ kind: 'data', summary: summarizeTtm([], [], [], ttmRules()) }} />);
    expect(screen.getByText('ไม่พบผู้รับบริการแพทย์แผนไทยในช่วงวันที่ที่เลือก')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ดาวน์โหลด Excel' })).toBeNull();
  });

  it('explains a missing or failing HOSxP connection', () => {
    const { unmount } = render(<TtmDashboard {...base} showConnectionLink outcome={{ kind: 'error', code: 'NOT_CONFIGURED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP · ตั้งค่าการเชื่อมต่อ');
    unmount();
    render(<TtmDashboard {...base} outcome={{ kind: 'error', code: 'HOSXP_FAILED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ดึงข้อมูลจาก HOSxP ไม่สำเร็จ');
  });

  it('resets the date boxes, period view and search when the range changes (a preset chip)', () => {
    const { rerender } = render(<TtmDashboard {...base} />);
    fireEvent.change(screen.getByLabelText('ค้นหาผู้รับบริการ'), { target: { value: 'แพทย์แผนไทย ข' } });
    fireEvent.click(screen.getByRole('button', { name: 'รายปีงบ' }));
    rerender(<TtmDashboard {...base} start="2025-01-01" end="2026-11-06" />);
    expect(document.querySelector('form.money-date-filter')!.textContent + [...document.querySelectorAll('form.money-date-filter input')].map((i) => (i as HTMLInputElement).value).join('|')).toContain('2568');
    expect(screen.getByLabelText('ค้นหาผู้รับบริการ')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'รายเดือน' })).toHaveAttribute('aria-pressed', 'true');
  });
});
