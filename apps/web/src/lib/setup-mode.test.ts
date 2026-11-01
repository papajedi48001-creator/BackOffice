// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isSetupMode } from './setup-mode';

describe('isSetupMode', () => {
  it('is on only while no database URL can be found', () => {
    expect(isSetupMode({ BACKOFFICE_CONFIG_DIR: '/nonexistent-backoffice-config' })).toBe(true);
    expect(isSetupMode({ DATABASE_URL: 'mysql://a' })).toBe(false);
  });
});
