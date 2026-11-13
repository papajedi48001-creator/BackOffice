import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dentalPresets, summarizeDental, type DentalRow } from '@backoffice/core';
import rows from '../../../../../../../packages/core/src/smart-money/fixtures/dental-rows.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { DentalDashboard, type DentalDashboardProps } from './dental-dashboard';

const fixture = rows as DentalRow[];
const base: DentalDashboardProps = { start: '2026-10-01', end: '2026-11-30', group: 'pttype', period: 'day', presets: dentalPresets('2026-11-13'), showConnectionLink: false, outcome: { kind: 'data', rows: fixture, summary: summarizeDental(fixture, 'pttype', 'day') } };

describe('DentalDashboard', () => {
  it('shows the four summary cards from the summary', () => {
    render(<DentalDashboard {...base} />);
    const cards = screen.getByRole('region', { name: 'สรุป' });
    expect(within(cards).getByText('ผู้รับบริการทันตกรรม')).toBeInTheDocument();
    expect(within(cards).getByText('7')).toBeInTheDocument();
    expect(within(cards).getByText('10 visit')).toBeInTheDocument();
    expect(within(cards).getByText('7,251.00')).toBeInTheDocument();
    expect(within(cards).getByText('775.25')).toBeInTheDocument();
    expect(within(cards).getByText('6,475.75')).toBeInTheDocument();
  });

  it('labels group bars with the number of people and lists the top 10 diagnoses', () => {
    render(<DentalDashboard {...base} />);
    expect(within(screen.getByRole('figure', { name: 'ค่ารักษารวมแยกตามสิทธิการรักษา' })).getAllByText(/\(\d+ คน\)/).length).toBeGreaterThan(0);
    const top = screen.getByRole('table', { name: 'รหัสโรคที่พบบ่อย (Top 10)' });
    expect(within(top).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('table', { name: 'สรุปตามสิทธิการรักษา' })).toBeInTheDocument();
    expect(screen.getByText(/1 visit ที่มีหลายรหัสโรคจะแสดงหลายแถว/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'รายละเอียดรายการ' })).toBeInTheDocument();
  });

  it('keeps the filters in the links and the CSV download', () => {
    render(<DentalDashboard {...base} />);
    expect(screen.getByRole('link', { name: 'ผังบัญชี' })).toHaveAttribute('href', '/money/dental?start=2026-10-01&end=2026-11-30&group=paccount&period=day');
    expect(screen.getByRole('link', { name: 'รายเดือน' })).toHaveAttribute('href', '/money/dental?start=2026-10-01&end=2026-11-30&group=pttype&period=month');
    expect(screen.getByRole('link', { name: 'เดือนนี้' })).toHaveAttribute('href', '/money/dental?start=2026-11-01&end=2026-11-30&group=pttype&period=day');
    expect(screen.getByRole('link', { name: 'ดาวน์โหลด CSV' })).toHaveAttribute('href', '/api/money/dental/export?start=2026-10-01&end=2026-11-30');
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
