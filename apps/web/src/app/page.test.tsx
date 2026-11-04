import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('HomePage', () => {
  it('renders the Thai Back Office title', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'ระบบสนับสนุนการทำงานภายในองค์กร (Back Office)' })).toBeInTheDocument();
  });
});
