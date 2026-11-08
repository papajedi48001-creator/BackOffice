import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppName } from './app-name';

describe('AppName', () => {
  it('puts "(Back Office)" on its own line', () => {
    const { container } = render(<h1><AppName /></h1>);
    const tail = container.querySelector('.app-name-tail');
    expect(tail?.textContent).toBe('(Back Office)');
    expect(container.textContent).toBe('ระบบสนับสนุนการทำงานภายในองค์กร (Back Office)');
  });
});
