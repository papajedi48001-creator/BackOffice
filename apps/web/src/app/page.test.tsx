import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('HomePage', () => {
  it('renders the Thai Back Office title', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'ระบบ Back Office' })).toBeInTheDocument();
  });

  it('shows the WR logo and hospital name', () => {
    render(<HomePage />);

    expect(screen.getAllByRole('img', { name: /WR/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('โรงพยาบาลวาริชภูมิ').length).toBeGreaterThan(0);
    expect(screen.getByText('ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ')).toBeInTheDocument();
  });
});
