import { describe, expect, it } from 'vitest';
import * as page from './page';

describe('link-provider page', () => {
  it('renders per request so the Provider SSO settings are read at run time, not baked in at build time', () => {
    expect(page.dynamic).toBe('force-dynamic');
  });
});
