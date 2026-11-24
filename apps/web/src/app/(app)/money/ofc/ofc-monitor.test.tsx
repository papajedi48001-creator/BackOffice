import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { summarizeOfc, ttmPresets, type OfcRepLine, type OfcRow } from '@backoffice/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { OfcMonitor, type OfcMonitorProps } from './ofc-monitor';

// Made-up people only.
const row = (vn: string, hn: string, name: string, date: string, qty = 2, price = 4000): OfcRow => ({ vstdate: date, vn, hn, name, icode: '3000001', itemName: 'อุปกรณ์พยุงส้นเท้า', qty, sumPrice: price, pttype: '10', pttypeName: 'ข้าราชการ' });
const rep = (vn: string, paid: number, error = ''): OfcRepLine => ({ repNo: '691000117', tranId: `t${vn}`, itemNo: 1, vn, date: '2026-10-20', adp: '8610', itemName: 'x', qty: 2, claim: 4000, paid, deny: error ? 'Y' : '', error });
const summary = summarizeOfc(
  [row('v1', 'h1', 'นาย สมมุติ หนึ่ง', '2026-10-20'), row('v2', 'h2', 'นาง สมมุติ สอง', '2026-10-21'), row('v3', 'h1', 'นาย สมมุติ หนึ่ง', '2026-10-25', 1, 2000)],
  [rep('v1', 4000), rep('v2', 0, 'C438')],
  [{ docNo: '11093_OP202610_01', repNo: '691000117', vn: 'v1', date: '2026-10-20', claim: 4300, inst: 4000, total: 4300 }]
);
const base: OfcMonitorProps = { start: '2026-10-01', end: '2026-10-31', presets: ttmPresets('2026-10-31'), periodText: '1 ตุลาคม 2569 – 31 ตุลาคม 2569', canManage: false, showConnectionLink: false, outcome: { kind: 'data', summary, updatedAt: null } };

describe('OfcMonitor', () => {
  it('sums people, claims, REP and Statement on the cards', () => {
    render(<OfcMonitor {...base} />);
    expect(screen.getByRole('heading', { name: 'Monitor Instrument OFC' })).toBeInTheDocument();
    const cards = screen.getByRole('region', { name: 'สรุป Instrument OFC' });
    expect(within(cards).getByText('ผู้ป่วย OFC ที่ได้รับอุปกรณ์').parentElement).toHaveTextContent('2 คน3 ครั้ง · 5 ชิ้น');
    expect(within(cards).getByText('เรียกเก็บ').parentElement).toHaveTextContent('10,000.00 บาทยังไม่มี REP 2,000.00 บาท');
    expect(within(cards).getByText('REP ชดเชย').parentElement).toHaveTextContent('4,000.00 บาทปฏิเสธ 1 ครั้ง · รอ Statement 0 ครั้ง');
    expect(within(cards).getByText('Statement ค่าอวัยวะฯ').parentElement).toHaveTextContent('4,000.00 บาท');
    expect(screen.queryByRole('button', { name: 'นำเข้า REP / Statement' })).toBeNull();
  });

  it('opens a person to show each visit with its REP, Statement and status', () => {
    render(<OfcMonitor {...base} canManage />);
    expect(screen.getByRole('button', { name: 'นำเข้า REP / Statement' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'รายละเอียดรายบุคคล' });
    const toggle = within(table).getByRole('button', { name: 'นาย สมมุติ หนึ่ง' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const visits = screen.getByRole('table', { name: 'การรับอุปกรณ์ นาย สมมุติ หนึ่ง' });
    expect(within(visits).getAllByRole('row').map((r) => r.textContent)).toEqual([
      'วันที่รับบริการVNรายการชิ้นเรียกเก็บREPStatementสถานะREP NO',
      '25 ต.ค. 2569v3อุปกรณ์พยุงส้นเท้า12,000.00--ยังไม่มี REP-',
      '20 ต.ค. 2569v1อุปกรณ์พยุงส้นเท้า24,000.004,000.004,000.00ได้รับแล้ว691000117',
      'รวม 2 ครั้ง36,000.004,000.004,000.00'
    ]);
  });

  it('filters people by status', () => {
    render(<OfcMonitor {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'ปฏิเสธ (1)' }));
    const table = screen.getByRole('table', { name: 'รายละเอียดรายบุคคล' });
    expect(within(table).queryByRole('button', { name: 'นาย สมมุติ หนึ่ง' })).toBeNull();
    expect(within(table).getByRole('button', { name: 'นาง สมมุติ สอง' })).toBeInTheDocument();
  });

  it('says when HOSxP is not set up, fails, or has nothing in the range', () => {
    const { rerender } = render(<OfcMonitor {...base} showConnectionLink outcome={{ kind: 'error', code: 'NOT_CONFIGURED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP · ตั้งค่าการเชื่อมต่อ');
    rerender(<OfcMonitor {...base} outcome={{ kind: 'error', code: 'HOSXP_FAILED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ดึงข้อมูลจาก HOSxP ไม่สำเร็จ');
    rerender(<OfcMonitor {...base} outcome={{ kind: 'data', summary: summarizeOfc([], [], []), updatedAt: null }} />);
    expect(screen.getByText('ไม่พบผู้ป่วย OFC ที่ได้รับอุปกรณ์ ADP 8610 ในช่วงวันที่ที่เลือก')).toBeInTheDocument();
  });
});
