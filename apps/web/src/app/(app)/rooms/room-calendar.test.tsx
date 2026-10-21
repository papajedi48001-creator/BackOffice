import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RoomCalendar } from './room-calendar';

const entry = { bookingId: 'b1', reference: 'RB-2569-0001', roomId: 'room-1', roomName: 'ห้องประชุม 1', date: '2026-11-05', startsAt: '2026-11-05T02:00:00.000Z', endsAt: '2026-11-05T05:00:00.000Z', status: 'PENDING' as const, title: 'อบรมพยาบาลใหม่', bookerName: 'สมใจ ใจดี', bookerOrganizationName: 'งานการพยาบาล' };

it('shows each booking under its day with time, title, booker and a text status', () => {
  render(<RoomCalendar dates={['2026-11-05', '2026-11-06']} entries={[entry, { ...entry, bookingId: 'b2', date: '2026-11-06', startsAt: '2026-11-06T02:00:00.000Z', endsAt: '2026-11-06T03:00:00.000Z', status: 'APPROVED' as const }]} />);

  const day = screen.getByRole('region', { name: /5 พ.ย. 2569/ });
  expect(within(day).getByText('09:00–12:00')).toBeInTheDocument();
  expect(within(day).getByText('อบรมพยาบาลใหม่')).toBeInTheDocument();
  expect(within(day).getByText('สมใจ ใจดี · งานการพยาบาล')).toBeInTheDocument();
  expect(within(day).getByText('รออนุมัติ')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: /6 พ.ย. 2569/ })).getByText('อนุมัติแล้ว')).toBeInTheDocument();
});

it('says so when a day has no bookings', () => {
  render(<RoomCalendar dates={['2026-11-07']} entries={[]} />);
  expect(screen.getByText('ไม่มีการจองในวันนี้')).toBeInTheDocument();
});
