import { describe, expect, it } from 'vitest';
import { adminGrantInputSchema, adminPersonRolesInputSchema, moduleCodeSchema } from './admin';

describe('admin contracts', () => {
  it('accepts only grantable roles and a person id', () => {
    expect(adminGrantInputSchema.safeParse({ personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roleName: 'fleet-manager' }).success).toBe(true);
    expect(adminGrantInputSchema.safeParse({ personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roleName: 'data-exporter' }).success).toBe(false);
    expect(adminPersonRolesInputSchema.safeParse({ roleNames: ['admin', 'hr-manager'] }).success).toBe(true);
  });

  it('accepts module codes and nothing path-like', () => {
    expect(moduleCodeSchema.safeParse('official-travel').success).toBe(true);
    expect(moduleCodeSchema.safeParse('../x').success).toBe(false);
  });
});
