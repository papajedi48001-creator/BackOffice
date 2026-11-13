import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { LedgerRange } from './ledger-range';

it('moves the end to the new start when the start passes it, then opens the range', () => {
  render(<LedgerRange path="/lab/stock/i-1" store="ALL" from="2026-11-01" to="2026-11-05" />);
  fireEvent.change(screen.getByLabelText('ตั้งแต่'), { target: { value: '08/11/2569' } });
  expect((screen.getByLabelText('ถึง') as HTMLInputElement).value).toBe('8 พ.ย. 2569');
  fireEvent.click(screen.getByRole('button', { name: 'แสดง' }));
  expect(push).toHaveBeenCalledWith('/lab/stock/i-1?store=ALL&from=2026-11-08&to=2026-11-08');
});
