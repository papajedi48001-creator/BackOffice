import { render, screen } from '@testing-library/react';
import { BrandLogo } from './brand-logo';

describe('BrandLogo', () => {
  it('renders an accessible WR monogram at the requested size', () => {
    render(<BrandLogo size={64} title="โลโก้ WR" />);
    const logo = screen.getByRole('img', { name: 'โลโก้ WR' });
    expect(logo).toHaveAttribute('width', '64');
    expect(logo.textContent).toContain('WR');
  });

  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<BrandLogo decorative />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses unique gradient ids per instance', () => {
    const { container } = render(<><BrandLogo decorative /><BrandLogo decorative /></>);
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
