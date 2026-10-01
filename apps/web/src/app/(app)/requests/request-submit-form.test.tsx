import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { RequestSubmitForm } from './request-submit-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

test('submits a maintenance request and opens its detail page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'request-1' }), { status: 201 }));
  render(<RequestSubmitForm organizationId="organization-1" />);

  fireEvent.click(screen.getByRole('button', { name: 'สร้างคำขอซ่อมบำรุง' }));

  await waitFor(() => expect(push).toHaveBeenCalledWith('/requests/request-1'));
});
