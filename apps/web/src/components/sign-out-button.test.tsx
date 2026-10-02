import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SignOutButton } from './sign-out-button';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
afterEach(() => { vi.restoreAllMocks(); replace.mockReset(); });

test('ends the session and returns to the sign-in page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  render(<SignOutButton />);

  fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
});
