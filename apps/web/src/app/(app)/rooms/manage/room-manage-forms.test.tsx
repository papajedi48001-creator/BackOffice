import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoomManageForms } from './room-manage-forms';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });

const room = { id: 'room-1', name: 'ห้องประชุม 1', place: 'อาคารอำนวยการ', capacity: 20, equipment: 'จอ', ownerOrganizationId: 'admin-unit', ownerOrganizationName: 'งานธุรการ', isBookable: true };

it('closes a room for booking by saving the whole room with isBookable false', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  render(<RoomManageForms rooms={[room]} addons={[]} organizations={[{ id: 'admin-unit', name: 'งานธุรการ' }]} />);

  fireEvent.click(screen.getByRole('button', { name: 'ปิดการจอง ห้องประชุม 1' }));

  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/rooms/room-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'ห้องประชุม 1', place: 'อาคารอำนวยการ', capacity: 20, equipment: 'จอ', ownerOrganizationId: 'admin-unit', isBookable: false }) }));
});

it('adds a room for an organization the manager covers', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
  render(<RoomManageForms rooms={[]} addons={[]} organizations={[{ id: 'admin-unit', name: 'งานธุรการ' }]} />);

  fireEvent.change(screen.getByLabelText('ชื่อห้อง'), { target: { value: 'ห้องประชุมเล็ก' } });
  fireEvent.change(screen.getByLabelText('ที่ตั้งห้อง'), { target: { value: 'ตึกผู้ป่วยนอก ชั้น 3' } });
  fireEvent.change(screen.getByLabelText('ความจุ (คน)'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มห้อง' }));

  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ name: 'ห้องประชุมเล็ก', place: 'ตึกผู้ป่วยนอก ชั้น 3', capacity: 12, equipment: '', ownerOrganizationId: 'admin-unit', isBookable: true });
});
