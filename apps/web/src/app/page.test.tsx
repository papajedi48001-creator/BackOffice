import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the Thai Back Office title', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'ระบบ Back Office' })).toBeInTheDocument();
  });
});
