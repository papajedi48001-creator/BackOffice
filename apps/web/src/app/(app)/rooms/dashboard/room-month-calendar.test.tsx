import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { monthGrid } from '../month-grid';
import { RoomMonthCalendar, type MonthEntryView } from './room-month-calendar';

const grid = monthGrid({ month: '2026-11' }, '2026-11-02');
const entry: MonthEntryView = { bookingId: 'b1', reference: 'RB-2569-0007', roomName: 'ห้องประชุมใหญ่', roomPlace: 'อาคารอำนวยการ ชั้น 2', date: '2026-11-05', startsAt: '2026-11-05T02:00:00.000Z', endsAt: '2026-11-05T05:00:00.000Z', status: 'APPROVED', title: 'ประชุมกรรมการบริหาร', bookerName: 'สมใจ ใจดี', bookerOrganizationName: 'งานการพยาบาล', canOpen: false };
const dayHref = '/rooms/calendar?view=day&date={date}';

it('shows who booked which room under each day of the month', () => {
  render(<RoomMonthCalendar grid={grid} entries={[entry]} dayHref={dayHref} />);
  const day = screen.getByRole('group', { name: 'พฤหัสบดี 5 พ.ย. 2569' });
  expect(within(day).getByRole('button', { name: /09:00.*ห้องประชุมใหญ่.*สมใจ ใจดี/ })).toBeInTheDocument();
  expect(within(day).getByText('อนุมัติแล้ว')).toBeInTheDocument();
});

it('marks today and dims the days already past', () => {
  render(<RoomMonthCalendar grid={grid} entries={[]} dayHref={dayHref} />);
  expect(screen.getByRole('group', { name: 'จันทร์ 2 พ.ย. 2569' })).toHaveAttribute('aria-current', 'date');
  expect(screen.getByRole('group', { name: 'อาทิตย์ 1 พ.ย. 2569' })).toHaveClass('is-past');
});

it('shows the first three bookings of a day and links the rest to the day view', () => {
  const many = Array.from({ length: 5 }, (_, index) => ({ ...entry, bookingId: `b${index}`, title: `ประชุม ${index}` }));
  render(<RoomMonthCalendar grid={grid} entries={many} dayHref={dayHref} />);
  const day = screen.getByRole('group', { name: 'พฤหัสบดี 5 พ.ย. 2569' });
  expect(within(day).getAllByRole('button')).toHaveLength(3);
  expect(within(day).getByRole('link', { name: '+2 รายการ' })).toHaveAttribute('href', '/rooms/calendar?view=day&date=2026-11-05');
});

it('opens the booking details in a popup, without a link for someone who may not open it', () => {
  render(<RoomMonthCalendar grid={grid} entries={[{ ...entry, status: 'PENDING' }]} dayHref={dayHref} />);
  fireEvent.click(screen.getByRole('button', { name: /ห้องประชุมใหญ่/ }));
  const dialog = screen.getByRole('dialog', { name: 'ประชุมกรรมการบริหาร' });
  expect(within(dialog).getByText('RB-2569-0007')).toBeInTheDocument();
  expect(within(dialog).getByText('ห้องประชุมใหญ่ · อาคารอำนวยการ ชั้น 2')).toBeInTheDocument();
  expect(within(dialog).getByText('09:00–12:00')).toBeInTheDocument();
  expect(within(dialog).getByText('สมใจ ใจดี · งานการพยาบาล')).toBeInTheDocument();
  expect(within(dialog).getByText('รออนุมัติ')).toBeInTheDocument();
  expect(within(dialog).queryByRole('link')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'ปิด' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: /ห้องประชุมใหญ่/ })).toHaveFocus();
});

it('links the booker or an approver to the full booking page', () => {
  render(<RoomMonthCalendar grid={grid} entries={[{ ...entry, canOpen: true }]} dayHref={dayHref} />);
  fireEvent.click(screen.getByRole('button', { name: /ห้องประชุมใหญ่/ }));
  expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'เปิดหน้ารายละเอียดการจอง' })).toHaveAttribute('href', '/rooms/bookings/b1');
});

it('gives each day a heading with its full date', () => {
  render(<RoomMonthCalendar grid={grid} entries={[]} dayHref={dayHref} />);
  expect(screen.getByRole('heading', { name: /พฤหัสบดี 5 พ.ย. 2569/ })).toBeInTheDocument();
  expect(screen.queryAllByRole('region')).toHaveLength(0);
});

it('heads the weeks with full Thai weekday names and greys a วันหยุด with its name', () => {
  render(<RoomMonthCalendar grid={grid} entries={[]} dayHref={dayHref} holidays={{ '2026-11-06': 'วันหยุดชดเชย' }} />);
  expect(screen.getByText('จันทร์')).toBeInTheDocument();
  expect(screen.getByText('อาทิตย์')).toBeInTheDocument();
  expect(screen.queryByText('จ.')).toBeNull();
  const holiday = screen.getByRole('group', { name: 'ศุกร์ 6 พ.ย. 2569 วันหยุด วันหยุดชดเชย' });
  expect(holiday).toHaveClass('is-holiday');
  expect(within(holiday).getByText('วันหยุดชดเชย')).toBeInTheDocument();
});
