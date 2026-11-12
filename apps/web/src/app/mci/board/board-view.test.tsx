import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BoardView } from './board-view';

const board = {
  incident: { title: 'รถบัสคว่ำ', kind: 'DRILL' as const, occurredAt: '2026-11-10T03:00:00.000Z' },
  updatedAt: '2026-11-10T04:00:00.000Z', total: 3,
  byTriage: [{ name: 'แดง', colorHex: '#DC2626', count: 2 }, { name: 'ดำ', colorHex: '#111827', count: 1 }],
  byStatus: [{ name: 'กำลังรักษา', count: 2 }],
  people: [{ name: 'มานี ม.', place: 'ER' }, { name: 'สมชาย ใ.', place: 'กรุณาติดต่อจุดประชาสัมพันธ์' }],
  contactPhone: '043-777777'
};

it('shows the drill banner, the counts by colour with their names, and the contact phone', () => {
  render(<BoardView initial={board} poll={false} />);
  expect(screen.getByText('ซ้อมแผน ไม่ใช่เหตุจริง')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'รถบัสคว่ำ' })).toBeInTheDocument();
  const colours = screen.getByRole('list', { name: 'ยอดผู้ป่วยตามสี' });
  expect(within(colours).getByText('แดง').closest('li')).toHaveTextContent('2');
  expect(screen.getByText('ผู้ป่วยทั้งหมด').closest('div')).toHaveTextContent('3');
  expect(screen.getByText(/043-777777/)).toBeInTheDocument();
});

it('lets a relative tap the phone to call and shows how many names match', () => {
  render(<BoardView initial={board} poll={false} />);
  expect(screen.getByRole('link', { name: /043-777777/ })).toHaveAttribute('href', 'tel:043777777');
  fireEvent.change(screen.getByLabelText('ค้นหาชื่อผู้ป่วย'), { target: { value: 'สม' } });
  expect(screen.getByText('พบ 1 คน')).toBeInTheDocument();
});

it('filters the name list as a relative types', () => {
  render(<BoardView initial={board} poll={false} />);
  fireEvent.change(screen.getByLabelText('ค้นหาชื่อผู้ป่วย'), { target: { value: 'มานี' } });
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveTextContent('มานี ม.');
  expect(rows[0]).toHaveTextContent('ER');
});

it('says there is no เหตุ when none is open', () => {
  render(<BoardView initial={{ ...board, incident: null, total: 0, people: [], byTriage: [], byStatus: [] }} poll={false} />);
  expect(screen.getByText('ขณะนี้ไม่มีเหตุอุบัติเหตุหมู่')).toBeInTheDocument();
});
