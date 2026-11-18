import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { herbRules, summarizeHerb, ttmPresets, type HerbRow } from '@backoffice/core';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { HerbDashboard, type HerbDashboardProps } from './herb-dashboard';

// Made-up rows only.
const row = (o: Partial<HerbRow> = {}): HerbRow => ({ rxdate: '2026-11-05', vn: 'v1', an: '', hn: 'h1', icode: '1520003', drugName: 'ฟ้าทะลายโจร 400 mg.', units: 'cap', qty: 10, sumPrice: 20, unitcost: 1.5, stdprice: 2, pttype: '89', pttypeName: 'UC', hipdata: 'UCS', ...o });
const rows = [row(), row({ vn: 'v2', hn: 'h2', icode: '1560021', drugName: 'เลือดงาม', qty: 42, unitcost: 0.66, stdprice: 1 }), row({ vn: 'v3', hn: 'h3', pttype: '10', pttypeName: 'ข้าราชการ', hipdata: 'OFC', rxdate: '2026-11-06' })];
const withRep = summarizeHerb(rows, herbRules(), new Map([['v1|1520003', 92]]));
const base: HerbDashboardProps = { start: '2026-11-05', end: '2026-11-06', presets: ttmPresets('2026-11-18'), periodText: '5 พฤศจิกายน 2569 – 6 พฤศจิกายน 2569', pointBaht: null, canUpload: false, showConnectionLink: false, outcome: { kind: 'data', summary: withRep, rep: { kind: 'files', count: 2 } } };

describe('HerbDashboard', () => {
  it('shows the five cards with รับจริง from REP and the unconverted points', () => {
    render(<HerbDashboard {...base} />);
    expect(screen.getByRole('heading', { name: 'การจ่ายยาสมุนไพร' })).toBeInTheDocument();
    const cards = screen.getByRole('region', { name: 'สรุป' });
    expect(within(cards).getByText('จำนวนครั้ง').parentElement).toHaveTextContent('3 ครั้ง3 คน · 2 รายการยา');
    expect(within(cards).getByText('รับจริง (REP)').parentElement).toHaveTextContent('92 บาท1 ครั้งที่พบใน REP · จาก 2 ไฟล์');
    expect(within(cards).getByText('คาดการณ์ ontop (ชดเชยยาสมุนไพร · UC)').parentElement).toHaveTextContent('92 บาท+ 264.50 point (ยังไม่แปลงเป็นบาท)');
    expect(screen.queryByRole('link', { name: 'อัปโหลด REP' })).toBeNull();
  });

  it('lists สิทธิ with รวมทั้งสิ้น, hides an unused สิทธิอื่น ๆ and opens a group\'s drugs from its button', () => {
    render(<HerbDashboard {...base} />);
    const table = screen.getByRole('table', { name: 'สรุปตามสิทธิการรักษา' });
    const texts = () => within(table).getAllByRole('row').map((r) => r.textContent);
    expect(texts()).toContain('บัตรทอง (UC)242.726292+ 264.50 point92154');
    expect(texts().some((t) => t?.startsWith('สิทธิอื่น ๆ'))).toBe(false);
    expect(texts().at(-1)).toBe('รวมทั้งสิ้น357.728292+ 264.50 point92174');
    const open = within(table).getByRole('button', { name: /บัตรทอง \(UC\)/ });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(within(table).queryByText('เลือดงาม')).toBeNull();
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(within(table).getByText('เลือดงาม')).toBeInTheDocument();
    expect(within(table).getAllByText('ontop 264.50 point/ครั้ง')[0]).toHaveAttribute('title', 'ชดเชยต่อครั้ง (จ่าย 42 แคปซูล)');
  });

  it('shows รอ REP before any REP and the upload link to those who may upload', () => {
    render(<HerbDashboard {...base} canUpload outcome={{ kind: 'data', summary: summarizeHerb(rows, herbRules(), null), rep: { kind: 'files', count: 0 } }} />);
    expect(screen.getAllByRole('link', { name: 'อัปโหลด REP' })[0]).toHaveAttribute('href', '/money/fdh/files');
    expect(within(screen.getByRole('region', { name: 'สรุป' })).getByText('รับจริง (REP)').parentElement).toHaveTextContent('รอ REPยังไม่มีไฟล์');
    expect(within(screen.getByRole('table', { name: 'สรุปตามสิทธิการรักษา' })).getAllByText('รอ REP').length).toBeGreaterThan(0);
  });

  it('switches the drug chart to จำนวนครั้ง and searches the drug list', () => {
    render(<HerbDashboard {...base} />);
    expect(screen.getByRole('figure', { name: 'มูลค่าการจ่ายยาสมุนไพร แยกรายยา' })).toHaveTextContent('เลือดงาม ★');
    fireEvent.click(screen.getByRole('button', { name: 'จำนวนครั้ง' }));
    expect(screen.getByRole('figure', { name: 'จำนวนครั้งที่จ่ายยาสมุนไพร แยกรายยา' })).toBeInTheDocument();
    const list = screen.getByRole('table', { name: 'รายยาสมุนไพร' });
    expect(within(list).getAllByRole('row')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('ค้นหายา'), { target: { value: '1560021' } });
    expect(within(list).getAllByRole('row')).toHaveLength(2);
  });

  it('says when nothing was dispensed or HOSxP failed', () => {
    const { rerender } = render(<HerbDashboard {...base} outcome={{ kind: 'data', summary: summarizeHerb([], herbRules(), null), rep: { kind: 'files', count: 0 } }} />);
    expect(screen.getByText('ไม่พบการจ่ายยาสมุนไพรในช่วงวันที่ที่เลือก')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ดาวน์โหลด Excel' })).toBeNull();
    rerender(<HerbDashboard {...base} outcome={{ kind: 'error', code: 'HOSXP_FAILED' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ดึงข้อมูลจาก HOSxP ไม่สำเร็จ');
  });

  it('starts the search again when the range changes', () => {
    const { rerender } = render(<HerbDashboard {...base} />);
    fireEvent.change(screen.getByLabelText('ค้นหายา'), { target: { value: 'เลือด' } });
    rerender(<HerbDashboard {...base} start="2026-11-04" />);
    expect(screen.getByLabelText('ค้นหายา')).toHaveValue('');
  });
});
