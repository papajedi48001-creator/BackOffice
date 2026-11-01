import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { TravelTypeTargets } from './travel-type-targets';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('changes a travel type\'s final approver in a popup', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<TravelTypeTargets types={[{ code: 'MEETING', approvalTarget: 'HOSPITAL' }]} />);
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /^แก้ไข/ })[0]!);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'DIVISION' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith('/api/travel/types/MEETING', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ approvalTarget: 'DIVISION' }) }));
});
